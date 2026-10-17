import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const BASE = "http://localhost:3200";
const OUT = "pitch/shots-au";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "en-AU", timezoneId: "Australia/Sydney" });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', "admin@kydi.test");
await page.fill('input[name="password"]', "password123");
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click('button[type="submit"]')]);
const shoot = async (p, name) => {
  await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 90000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", p);
};
await shoot("/dashboard", "dashboard");
await shoot("/invoices", "invoices");
await shoot("/customers", "customers");
await shoot("/invoices/new", "invoice-new");
await shoot("/reports", "reports");
for (const id of [1, 2, 3, 5]) {
  const res = await ctx.request.get(`${BASE}/api/pdf/invoice/${id}`);
  writeFileSync(`${OUT}/invoice-${id}.pdf`, await res.body());
  console.log("pdf", id, res.status());
}
await browser.close();
