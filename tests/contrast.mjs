// Dev-only: measure rendered contrast of the darkened-glass overlay/badge text.
// Samples the actual composited panel background pixel under the text and computes
// the WCAG contrast ratio against the text color. Not shipped.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');

function lum([r,g,b]){ const f=c=>{c/=255; return c<=.03928? c/12.92 : Math.pow((c+.055)/1.055,2.4);}; return .2126*f(r)+.7152*f(g)+.0722*f(b); }
function ratio(a,b){ const L1=lum(a),L2=lum(b); const hi=Math.max(L1,L2),lo=Math.min(L1,L2); return (hi+.05)/(lo+.05); }

const browser = await chromium.launch();

async function samplePanelBg(url, panelSel, w){
  const ctx = await browser.newContext({ viewport:{width:w,height:1200}, deviceScaleFactor:1 });
  const page = await ctx.newPage();
  await page.goto(url,{waitUntil:'networkidle'}); await page.waitForTimeout(400);
  const el = page.locator(panelSel).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await el.boundingBox();
  // screenshot the panel region and sample a pixel in its padding area (no text)
  const clip = { x: Math.round(box.x+6), y: Math.round(box.y+6), width: 4, height: 4 };
  const buf = await page.screenshot({ clip });
  const png = PNG.sync.read(buf);
  const idx = 0; // top-left pixel
  const bg = [png.data[idx], png.data[idx+1], png.data[idx+2]];
  await ctx.close();
  return bg;
}

const idx = pathToFileURL(resolve(SITE,'index.html')).href;
const cs = pathToFileURL(resolve(SITE,'marketplace.html')).href;
const white = [255,255,255];
const whiteSoft = [240,240,240]; // ~rgba(255,255,255,.92) over dark ≈ near-white

console.log('=== overlay / badge contrast (white text on darkened glass) ===');
for (const w of [1920,1440,1024,768,390]) {
  const ovBg = await samplePanelBg(idx, '.feature.large .overlay', w);
  console.log(`index  @${w}  overlay panel bg≈rgb(${ovBg})  →  white title ratio = ${ratio(white,ovBg).toFixed(2)}:1   soft-desc ratio = ${ratio(whiteSoft,ovBg).toFixed(2)}:1`);
}
for (const w of [1440,768,390]) {
  const rbBg = await samplePanelBg(cs, '.result-badge', w);
  console.log(`case   @${w}  badge panel bg≈rgb(${rbBg})    →  white num ratio   = ${ratio(white,rbBg).toFixed(2)}:1   soft-lab ratio  = ${ratio(whiteSoft,rbBg).toFixed(2)}:1`);
}
await browser.close();
