// Dev-only: capture the nav + hero-top region (stepped nav→hero gap, centered pill).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');
const OUT = resolve(__dirname, 'screens');
const url = pathToFileURL(resolve(SITE, 'index.html')).href;
const browser = await chromium.launch();
for (const w of [1920, 1440, 1024, 768, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, `nav-hero-${w}.png`), clip: { x: 0, y: 0, width: w, height: Math.min(360, 900) } });
  await ctx.close();
}
await browser.close();
console.log('wrote nav-hero-*.png');
