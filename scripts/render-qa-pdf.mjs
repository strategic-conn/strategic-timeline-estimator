/**
 * Print a QA walkthrough page to PDF with headless Chromium (A4, page footer).
 *
 *   node scripts/render-qa-pdf.mjs                       # v3 by default
 *   node scripts/render-qa-pdf.mjs docs/Some-Guide.html  # → docs/Some-Guide.pdf
 */
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const src = resolve(process.argv[2] ?? "docs/App-QA-Walkthrough-v3.html");
const out = src.replace(/\.html$/, ".pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
const title = await page.title();
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font:7pt 'Segoe UI',sans-serif;color:#5f6470;padding:0 17mm;display:flex;justify-content:space-between"><span>${title}</span><span class="pageNumber"></span></div>`,
});
await browser.close();
console.log(`wrote ${out}`);
