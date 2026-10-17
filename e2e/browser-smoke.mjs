// Browser smoke check (Playwright, headless Chromium) against a running Kydi server.
//
//   E2E_BASE_URL=http://localhost:3100 KYDI_EMAIL=... KYDI_PASSWORD=... node e2e/browser-smoke.mjs [/path ...]
//
// Signs in through the real login form, opens each page (default: the main screens), and fails when the
// browser reports a Content-Security-Policy violation, an uncaught page error or a console error.
// Optional: KYDI_INSTALL_TOKEN + KYDI_INSTALL=1 completes the install wizard first (fresh database).
import { chromium } from "playwright";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const EMAIL = process.env.KYDI_EMAIL ?? "admin@kydi.test";
const PASSWORD = process.env.KYDI_PASSWORD ?? "password123";
const DEFAULT_PAGES = [
  "/dashboard", "/customers", "/customers/new", "/items", "/invoices", "/invoices/new", "/estimates", "/payments",
  "/expenses", "/expenses/new", "/recurring-invoices", "/reports", "/purchases", "/bills", "/suppliers", "/members",
  "/profile", "/settings/company", "/settings/mail", "/settings/exchange-rates", "/settings/api-tokens", "/admin",
];
const pages = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PAGES;

const problems = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
await page.addInitScript(() => {
  document.addEventListener("securitypolicyviolation", (e) => {
    console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || "inline"} (${e.sourceFile || ""}:${e.lineNumber || ""})`);
  });
});
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`${page.url()} console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`${page.url()} pageerror: ${e.message}`));

if (process.env.KYDI_INSTALL === "1") {
  await page.goto(`${BASE}/install`);
  if (process.env.KYDI_INSTALL_TOKEN) await page.fill('input[name="install_token"]', process.env.KYDI_INSTALL_TOKEN);
  await page.fill('input[name="name"]', process.env.KYDI_NAME ?? "Browser Admin");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.fill('input[name="confirm"]', PASSWORD);
  await Promise.all([page.waitForURL(/\/install\/company/, { timeout: 30000 }), page.click('button[type="submit"]')]);
  await page.fill('input[name="name"]', process.env.KYDI_COMPANY ?? "Browser Check Ltd");
  await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 30000 }), page.click('button[type="submit"]')]);
  console.log("install wizard completed");
} else {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
}

for (const p of pages) {
  const res = await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  const status = res?.status() ?? 0;
  console.log(`${status} ${p}`);
  if (status >= 400) problems.push(`${p}: HTTP ${status}`);
}

await browser.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`\nOK: ${pages.length} page(s), no CSP violations, page errors or console errors.`);
