// Dev-only: capture the Work-list hover state (inset rounded highlight) for VISUAL-QA.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');
const OUT = resolve(__dirname, 'screens');
const url = pathToFileURL(resolve(SITE, 'index.html')).href;
const browser = await chromium.launch();

for (const w of [1440, 768, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const row = page.locator('.work-row').nth(0);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.waitForTimeout(300);
  // clip to the work list region for a focused before/after
  const list = await page.locator('.work-list').boundingBox();
  await page.screenshot({ path: resolve(OUT, `work-hover-${w}.png`), clip: { x: Math.max(0,list.x-20), y: list.y-10, width: Math.min(w, list.width+40), height: Math.min(360, list.height) } });
  // geometry proof: content x of a hovered vs non-hovered row title must be identical (no shift)
  const geom = await page.evaluate(() => {
    const rows = document.querySelectorAll('.work-row');
    const t0 = rows[0].querySelector('.work-title').getBoundingClientRect();
    const t1 = rows[1].querySelector('.work-title').getBoundingClientRect();
    const r0 = rows[0].getBoundingClientRect();
    const s = getComputedStyle(rows[0]);
    return { hoveredTitleX: Math.round(t0.left), idleTitleX: Math.round(t1.left), rowRadius: s.borderTopLeftRadius, rowLeft: Math.round(r0.left) };
  });
  console.log(`@${w}: hovered title x=${geom.hoveredTitleX} vs idle title x=${geom.idleTitleX} (shift=${geom.hoveredTitleX-geom.idleTitleX}px) · row radius=${geom.rowRadius} · row left=${geom.rowLeft}`);
  await ctx.close();
}
await browser.close();
console.log('wrote work-hover-*.png');
