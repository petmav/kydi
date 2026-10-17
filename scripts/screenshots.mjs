#!/usr/bin/env node
// Captures the catalogue screenshots from a RUNNING Kydi instance seeded with demo data (KYDI_DEMO_SEED=true),
// using Playwright's bundled Chromium. Nothing is mocked: every image is the real app.
//
//   E2E_BASE_URL=http://localhost:3100 node scripts/screenshots.mjs [outDir]
//
// Also writes publish/icon.png (a plain navy square with a white "K" in the system UI font).
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const OUT = process.argv[2] ?? "publish/screenshots";
const VIEWPORT = { width: 1440, height: 900 };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const page = await context.newPage();

async function shot(name, url, opts = {}) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  if (opts.wait) await page.waitForTimeout(opts.wait);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`${file} ${(statSync(file).size / 1024).toFixed(0)} KiB`);
}

// Staff app (demo administrator).
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', process.env.KYDI_EMAIL ?? "admin@kydi.test");
await page.fill('input[name="password"]', process.env.KYDI_PASSWORD ?? "password123");
await Promise.all([page.waitForURL(/\/dashboard/), page.click('button[type="submit"]')]);
await shot("Dashboard", "/dashboard");
await shot("Invoices", "/invoices");

// First sent invoice in the list.
await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle" });
const href = await page.locator('a[href^="/invoices/"]:not([href$="/new"])').first().getAttribute("href");
const invoiceId = href?.match(/\/invoices\/(\d+)/)?.[1];
if (invoiceId) {
  await shot("Invoice detail", `/invoices/${invoiceId}`, { wait: 2500 });
  await shot("Invoice PDF", `/api/pdf/invoice/${invoiceId}`, { wait: 3000 });
}
const year = new Date().getFullYear();
await shot("Reports", `/reports?tab=sales&from=${year}-01-01&to=${year}-12-31`, { wait: 1500 });

// Customer portal (demo customer).
const portal = await context.browser().newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const p2 = await portal.newPage();
await p2.goto(`${BASE}/portal/northwind-studio/login`);
await p2.fill('input[name="email"]', process.env.KYDI_PORTAL_EMAIL ?? "billing@acme.test");
await p2.fill('input[name="password"]', process.env.KYDI_PORTAL_PASSWORD ?? "password123");
await Promise.all([p2.waitForURL(/\/portal\/northwind-studio(\/)?$/), p2.click('button[type="submit"]')]);
await p2.goto(`${BASE}/portal/northwind-studio/invoices`, { waitUntil: "networkidle" });
const portalFile = path.join(OUT, "Customer portal.png");
await p2.screenshot({ path: portalFile });
console.log(`${portalFile} ${(statSync(portalFile).size / 1024).toFixed(0)} KiB`);

// Icon: formal wordmark, no gradients, system font.
const icon = await context.newPage();
await icon.setViewportSize({ width: 512, height: 512 });
await icon.setContent(
  `<html><body style="margin:0"><div style="width:512px;height:512px;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:600;font-size:320px;color:#ffffff;line-height:1">K</div></body></html>`,
);
const iconFile = path.join(path.dirname(OUT), "icon.png");
await icon.screenshot({ path: iconFile, clip: { x: 0, y: 0, width: 512, height: 512 } });
console.log(`${iconFile} ${(statSync(iconFile).size / 1024).toFixed(0)} KiB`);

await browser.close();
