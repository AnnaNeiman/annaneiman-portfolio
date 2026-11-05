// Dev-only: RENDERED contrast sampling for the marketplace polish (task 7.4).
// Companion to contrast.mjs (which samples the darkened-glass overlay/badge) and
// contrast-tokens.mjs (which checks the *declared* token math). This file loads the
// ACTUAL marketplace.html, screenshots a small glyph-free region of the real composited
// background under each new accent / deep-surface pairing, reads the pixel with pngjs, and
// computes the WCAG 2.1 contrast ratio against the known foreground color — proving the
// pairings clear AA as they actually render, not just on paper. Not shipped.
//
// Sampling rule (same philosophy as contrast.mjs): never sample a pixel that may contain a
// glyph. For text-on-surface pairings we sample the composited BACKGROUND in a padding/edge
// zone of the element (or its card), then contrast that against the KNOWN foreground hex.
// For the accent ✓ chip we sample the chip FILL pixel and contrast it against white (the glyph).
// For non-text boundaries (the .ocard 3px inset accent top bar, painted as box-shadow: inset 0 3px
// 0 var(--accent)) we sample the accent bar vs the adjacent card background. Every sample documents
// WHERE it was taken.
//
// Exits non-zero if any pairing is below its threshold.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');

// --- WCAG math (identical to contrast.mjs / contrast-tokens.mjs) ---
function lum([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const L1 = lum(a);
  const L2 = lum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// --- known foreground / fill colors (design tokens) ---
const ACCENT = hexToRgb('#a8341a'); // --accent
const WHITE = hexToRgb('#ffffff'); // --accent-ink / --surface
const INK = hexToRgb('#313131'); // --ink
const FLINT = hexToRgb('#6b6860'); // --flint

const url = pathToFileURL(resolve(SITE, 'marketplace.html')).href;
const browser = await chromium.launch();

// Sample a single composited pixel at an absolute viewport point (document coords are
// converted via the element box by the caller). Returns [r,g,b].
async function samplePixel(page, x, y) {
  const clip = { x: Math.round(x), y: Math.round(y), width: 2, height: 2 };
  const buf = await page.screenshot({ clip });
  const png = PNG.sync.read(buf);
  return [png.data[0], png.data[1], png.data[2]];
}

// Screenshot a w×h region and return the single pixel closest to a target color. Used for thin
// features (a 3px border, a round chip) where a single fixed pixel can straddle an antialiased
// edge; scanning the band and picking the purest matching pixel is the composited value we want.
async function sampleNearest(page, x, y, w, h, target) {
  const clip = { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
  const buf = await page.screenshot({ clip });
  const png = PNG.sync.read(buf);
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < png.data.length; i += 4) {
    const px = [png.data[i], png.data[i + 1], png.data[i + 2]];
    const d =
      (px[0] - target[0]) ** 2 + (px[1] - target[1]) ** 2 + (px[2] - target[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = px;
    }
  }
  return best;
}

// Open a page at a given width. deviceScaleFactor:2 so a 3px CSS accent border spans ~6 raster
// rows — thin borders at DSF 1 fall between integer pixel rows after fractional layout offsets,
// which makes a clean composited sample of the band unreliable. Clips are still in CSS px.
async function openAt(w) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  return { ctx, page };
}

let failures = 0;
const results = [];
function record({ id, label, where, fg, bg, got, threshold, kind = 'text' }) {
  const r = ratio(fg, bg);
  const pass = r >= threshold;
  if (!pass) failures++;
  results.push({ id, label, where, got, ratio: r, threshold, pass, kind });
  return r;
}

// ---------------------------------------------------------------------------
// 1. accent outcome label .mp .ocard .lens  →  accent #a8341a on the white card.
//    The .lens text itself is accent; the card behind it is --surface (white). We sample the
//    card background a few px ABOVE the lens text (inside the card's top padding, below the
//    3px accent border) so we never hit a glyph.
async function checkLens(page, w) {
  const el = page.locator('.mp .ocard .lens').first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await el.boundingBox();
  // sample to the right of the (short) label text, same vertical band = card surface
  const bg = await samplePixel(page, box.x + box.width + 12, box.y + box.height / 2);
  record({
    id: 'C2',
    label: 'accent .lens #a8341a on composited card bg',
    where: `@${w} pixel right of the lens text within the ocard surface`,
    fg: ACCENT,
    bg,
    got: bg,
    threshold: 4.5,
  });
}

// ---------------------------------------------------------------------------
// 2. shipped decision ✓ chip .mp .dcol.shipped .mark  →  accent fill, white glyph.
//    Sample the chip FILL in a corner (the ✓ glyph sits centered, so a corner pixel is pure
//    fill), contrast white vs that fill. (C4)
async function checkShippedMark(page, w) {
  const el = page.locator('.mp .dcol.shipped .mark').first();
  await el.scrollIntoViewIfNeeded();
  // The shipped column is covered by the .wipe reveal overlay until its parent .decision gets the
  // `in` class (IntersectionObserver @0.3) and the wipe scales away. Wait for that so we sample the
  // real accent chip and not the white wipe cover. Center the parent in the viewport to trigger it.
  await el.evaluate((node) => {
    const dec = node.closest('.decision');
    if (dec) dec.scrollIntoView({ block: 'center' });
  });
  await page
    .locator('.mp .dcol.shipped')
    .first()
    .evaluate((node) => {
      const dec = node.closest('.decision');
      return new Promise((res) => {
        const done = () => (dec && dec.classList.contains('in') ? res() : requestAnimationFrame(done));
        done();
      });
    });
  await page.waitForTimeout(700); // let the wipe scale-away transition finish
  const box = await el.boundingBox();
  // The chip is an 18px border-radius:50% circle with a centered white ✓ glyph; its bounding-box
  // corners are transparent (outside the circle). Scan the whole chip box and take the pixel
  // nearest the accent color — that is the circle's fill, never the white glyph or the corner.
  const fill = await sampleNearest(page, box.x, box.y, box.width, box.height, ACCENT);
  record({
    id: 'C4',
    label: 'white ✓ glyph #ffffff on shipped .mark accent fill',
    where: `@${w} accent-fill pixel of the round .mark chip (scanned, off the white glyph/corners)`,
    fg: WHITE,
    bg: fill,
    got: fill,
    threshold: 4.5,
  });
}

// ---------------------------------------------------------------------------
// 3. insight text .mp .insight p  →  ink #313131 on --surface-deep #efe9e0.  (C5)
//    Sample the insight card background just inside its top-left padding (above the .n number
//    and the <p>), which is the deep surface, never a glyph.
async function checkInsight(page, w) {
  const card = page.locator('.mp .insight').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await card.boundingBox();
  // top-right corner padding of the card = deep surface (the .n and p start at the left)
  const bg = await samplePixel(page, box.x + box.width - 6, box.y + 6);
  record({
    id: 'C5',
    label: 'insight p ink #313131 on composited --surface-deep',
    where: `@${w} top-right padding corner of the .insight card`,
    fg: INK,
    bg,
    got: bg,
    threshold: 4.5,
  });
}

// ---------------------------------------------------------------------------
// 4. rejected column body text .mp .dcol.rejected  →  ink on --surface-deep.
//    Sample the rejected column background in its top padding band (above the ✗ tag text).
async function checkRejected(page, w) {
  const col = page.locator('.mp .dcol.rejected').first();
  await col.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await col.boundingBox();
  // top-right corner padding of the rejected column = deep surface
  const bg = await samplePixel(page, box.x + box.width - 6, box.y + 6);
  record({
    id: 'C5r',
    label: 'rejected .dcol body ink #313131 on composited --surface-deep',
    where: `@${w} top-right padding corner of the .dcol.rejected column`,
    fg: INK,
    bg,
    got: bg,
    threshold: 4.5,
  });
}

// ---------------------------------------------------------------------------
// 5. outcomes band caption .mp .mp-bleed .caption  →  flint #6b6860 on --surface-deep.  (C6)
//    Thin margin (~4.61 on paper) — report the SAMPLED value precisely. Sample the band bg to
//    the right of the caption text, same vertical band.
async function checkCaption(page, w) {
  const cap = page.locator('.mp .mp-bleed .caption').first();
  await cap.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await cap.boundingBox();
  // sample band background right of the caption text (caption is short, left-aligned)
  const bg = await samplePixel(page, box.x + box.width + 16, box.y + box.height / 2);
  record({
    id: 'C6',
    label: 'mp-bleed .caption flint #6b6860 on composited --surface-deep',
    where: `@${w} band bg right of the caption text (thin-margin pairing)`,
    fg: FLINT,
    bg,
    got: bg,
    threshold: 4.5,
  });
}

// ---------------------------------------------------------------------------
// 6. accent top edge on .mp .ocard  →  accent vs adjacent bg >= 3 (non-text boundary).
//    The .ocard accent is a 3px inset box-shadow bar (box-shadow: inset 0 3px 0 var(--accent)),
//    NOT a border-top — it sits just inside the top edge (≈y..y+3 CSS px) under the 1px --cararra
//    border. (The outcomes band .mp .mp-bleed no longer carries an accent edge — it is a plain
//    tinted section and the .ocard cards are the only accent-edge owners, so it is not sampled.)
//    Sample a pixel in the inset accent bar, and a pixel below it (the card surface), and assert
//    the measured accent vs the adjacent surface >= 3.
async function checkBorderBoundary(page, w, sel, id) {
  const el = page.locator(sel).first();
  // Center the element in the viewport (not just "if needed") so its top edge is never clipped at
  // or above y=0 — a partially-off-screen top makes the clip capture adjacent content instead of
  // the bar. Re-measure after the scroll settles.
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  const box = await el.boundingBox();
  // The inset accent bar is only 3px tall just inside the top edge and sits above a soft
  // box-shadow halo, so a single fixed pixel (or a too-shallow strip starting on a fractional Y)
  // can land on the antialiased boundary. Scan a slightly taller strip that brackets the top edge
  // (y-2, height 8 → covers the inset bar at y..y+3) and take the purest accent pixel (the painted
  // bar), then sample the surface ~16px below for the adjacent bg. The inset box-shadow accent is
  // verified separately as rgb(168,52,26).
  const border = await sampleNearest(page, box.x + box.width / 2 - 10, box.y - 2, 20, 8, ACCENT);
  const below = await samplePixel(page, box.x + box.width / 2, box.y + 16);
  const r = ratio(border, below);
  const pass = r >= 3;
  if (!pass) failures++;
  results.push({
    id,
    label: `${sel} 3px inset accent top bar vs adjacent bg (non-text boundary)`,
    where: `@${w} purest accent pixel in the top-edge inset bar rgb(${border}) vs surface pixel 16px below rgb(${below})`,
    got: border,
    ratio: r,
    threshold: 3,
    pass,
    kind: 'boundary',
  });
}

// ---------------------------------------------------------------------------
// 7. RE-SAMPLE the darkened-glass .result-badge on marketplace.html (same technique as
//    contrast.mjs) → white text vs composited glass bg >= 4.5. (Requirement 8.7)
async function checkResultBadge(page, w) {
  const el = page.locator('.result-badge').first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await el.boundingBox();
  // sample a padding-corner pixel of the badge (glass fill, no glyph) — same as contrast.mjs
  const bg = await samplePixel(page, box.x + 6, box.y + 6);
  record({
    id: '8.7',
    label: 'result-badge white text #ffffff on composited darkened-glass bg',
    where: `@${w} top-left padding corner of the .result-badge glass panel`,
    fg: WHITE,
    bg,
    got: bg,
    threshold: 4.5,
  });
}

// --- run at 1440 (primary) and 375 (where elements are visible) ---
for (const w of [1440, 375]) {
  const { ctx, page } = await openAt(w);
  await checkLens(page, w);
  await checkShippedMark(page, w);
  await checkInsight(page, w);
  await checkRejected(page, w);
  await checkCaption(page, w);
  await checkBorderBoundary(page, w, '.mp .ocard', `BND-ocard`);
  await checkResultBadge(page, w);
  // tag the width into each freshly-added result for the report
  for (const r of results) if (!r.w) r.w = w;
  await ctx.close();
}

await browser.close();

// --- report ---
console.log('=== marketplace rendered contrast sampling (task 7.4) ===\n');
for (const r of results) {
  const line =
    `${r.id}  [@${r.w}]  ${r.label}\n` +
    `     sampled bg/fill rgb(${r.got})  →  ratio ${r.ratio.toFixed(2)}:1  vs ${r.kind === 'boundary' ? '≥3 (boundary)' : 'AA ≥4.5'}  → ${r.pass ? 'PASS' : 'FAIL'}\n` +
    `     where: ${r.where}`;
  console.log(line + '\n');
}
console.log(failures === 0 ? 'ALL SAMPLED PAIRINGS PASS' : `${failures} SAMPLED PAIRING(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
