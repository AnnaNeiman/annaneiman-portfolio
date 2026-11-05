// Dev-only: capture the hero-card internal rhythm + glass panel at M/L/XL for VISUAL-QA.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');
const OUT = resolve(__dirname, 'screens');
const url = pathToFileURL(resolve(SITE, 'index.html')).href;
const browser = await chromium.launch();
for (const w of [1920, 1440, 1024]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1100 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const card = await page.locator('.hero-top').boundingBox();
  await page.screenshot({ path: resolve(OUT, `hero-card-${w}.png`), clip: { x: 0, y: Math.max(0,card.y-10), width: Math.min(w, card.width+40), height: Math.min(760, card.height+20) } });
}
await browser.close();
console.log('wrote hero-card-*.png');
