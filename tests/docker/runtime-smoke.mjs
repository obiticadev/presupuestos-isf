import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

async function main() {
  assert.equal(process.getuid(), 1000, "La imagen debe ejecutar la app como node");
  assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, "/ms-playwright");
  const pkg = JSON.parse(await readFile("node_modules/playwright-core/package.json", "utf8"));
  assert.equal(pkg.version, "1.64.1");
  const font = await readFile("node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2");
  assert.ok(font.length > 1000);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(`<style>@font-face{font-family:Archivo;src:url(data:font/woff2;base64,${font.toString("base64")})}body{font-family:Archivo}</style><h1>Presupuesto Docker · 1.246,30 €</h1>`);
    const pdf = await page.pdf({ format: "A4" });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 1000);
    console.log(`OK: node sin privilegios, fuente, playwright-core y PDF con Chromium (${pdf.length} bytes)`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
