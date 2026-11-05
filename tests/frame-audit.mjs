// Dev-only: OPTION A exact-frame fidelity audit — card dims vs the Figma dump.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');
const url = pathToFileURL(resolve(SITE, 'index.html')).href;
const caseUrl = pathToFileURL(resolve(SITE, 'marketplace.html')).href;

// dump targets per frame: hero-card width, featured image height, overlay large/medium panel.
const T = {
  1920: { heroW: 584, featH: 393, ovLarge: 854, ovMed: 570 },
  1440: { heroW: 459, featH: 389, ovLarge: 854, ovMed: 570 },
  1024: { heroW: null, featH: 315, ovLarge: null, ovMed: null }, // M: card fills; panels cap-or-fill
};

const browser = await chromium.launch();
async function measure(u, w, fn){
  const ctx = await browser.newContext({ viewport:{width:w,height:1200}, deviceScaleFactor:1 });
  const page = await ctx.newPage();
  await page.goto(u,{waitUntil:'networkidle'}); await page.waitForTimeout(300);
  const r = await page.evaluate(fn);
  await ctx.close();
  return r;
}

// expected hero-card pad/gap + internal rhythm + body vertical padding per frame.
// XL/L/M: Figma Hero Card 32/48 pad, gap 40; inner 8/24/16/16. S/XS: 28 pad, gap 24.
// Body vertical padding = frame y-padding (dump): 60/60/60/32/24.
const R = {
  1920: { padBlock:32, padInline:48, gap:40, eyebrowName:8, greetRoles:24, tabsBio:16, ctaGap:16, bodyY:60 },
  1440: { padBlock:32, padInline:48, gap:40, eyebrowName:8, greetRoles:24, tabsBio:16, ctaGap:16, bodyY:60 },
  1024: { padBlock:32, padInline:48, gap:40, eyebrowName:8, greetRoles:24, tabsBio:16, ctaGap:16, bodyY:60 },
  768:  { padBlock:28, padInline:28, gap:24, bodyY:32 },
  390:  { padBlock:28, padInline:28, gap:24, bodyY:24 },
};

const probe = () => {
  const px = v => Math.round(parseFloat(v));
  const bx = sel => { const e=document.querySelector(sel); if(!e)return null; const b=e.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height)}; };
  const sty = sel => { const e=document.querySelector(sel); const s=getComputedStyle(e); return {pt:px(s.paddingTop),pl:px(s.paddingLeft),gap:px(s.gap||s.rowGap||0),r:px(s.borderTopLeftRadius)}; };
  const gapOf = sel => { const e=document.querySelector(sel); if(!e) return null; const s=getComputedStyle(e); return px(s.rowGap||s.gap||0); };
  // vertical distance between the bottom of A and the top of the next sibling B
  const between = (aSel,bSel) => { const a=document.querySelector(aSel),b=document.querySelector(bSel); if(!a||!b)return null; return Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom); };
  function ov(cardSel){ const card=document.querySelector(cardSel); const o=card.querySelector('.overlay'); const cb=card.getBoundingClientRect(), ob=o.getBoundingClientRect(); const os=getComputedStyle(o); return {w:Math.round(ob.width),h:Math.round(ob.height),pad:px(os.paddingTop),gap:px(os.gap||0),contained:(ob.left>=cb.left-1&&ob.right<=cb.right+1&&ob.bottom<=cb.bottom+1&&ob.top>=cb.top-1)}; }
  return {
    heroCard: { ...bx('.hero-card'), ...sty('.hero-card') },
    glass: { ...bx('.glass'), ...sty('.glass') },
    bodyY: px(getComputedStyle(document.body).paddingTop),
    // internal rhythm (measured center-to-center edge gaps on the real rendered DOM)
    eyebrowName: between('.hero-card .eyebrow','.hero-card .hero-name'),
    greetRoles: between('.introduction .greeting','.introduction .switcher'),
    tabsBio: between('.switcher-tabs','.switcher-panels'),
    ctaGap: gapOf('.hero-ctas'),
    group1to2: between('.hero-text','.introduction'),
    group2to3: between('.introduction','.hero-ctas'),
    ovTitleDesc: between('.feature.large .overlay .ptitle','.feature.large .overlay .pout'),
    ovCatTitle: between('.feature.large .overlay .cat','.feature.large .overlay .pt-group'),
    featLargeH: bx('.feature.large').h,
    featWideH: bx('.feature.wide').h,
    featMedH: bx('.feature.medium').h,
    ovLarge: ov('.feature.large'),
    ovWide: ov('.feature.wide'),
    ovMed: ov('.feature.medium'),
    heroRowGap: (()=>{const s=getComputedStyle(document.querySelector('.hero-top'));return Math.round(parseFloat(s.columnGap));})(),
  };
};

let failures = [];
const assert = (label, v, tgt, tol=2) => {
  if (tgt == null) return;
  if (Math.abs(v - tgt) > tol) { failures.push(`[${label}] ${v} ≠ ${tgt} (±${tol})`); }
};

console.log('=== HOMEPAGE card-dimension + rhythm audit (OPTION A) ===');
for (const w of [1920,1440,1024,768,390]) {
  const m = await measure(url, w, probe);
  const t = T[w] || {};
  const r = R[w] || {};
  const chk=(v,tgt,tol=2)=> tgt==null?`${v} (fill)`:(Math.abs(v-tgt)<=tol?`${v}=✓${tgt}`:`${v}≠${tgt}✗`);
  console.log(`\n-- ${w}px --`);
  console.log(`  hero-card: W=${chk(m.heroCard.w,t.heroW)}  pad=${m.heroCard.pt}/${m.heroCard.pl}  gap=${m.heroCard.gap}  r=${m.heroCard.r}  [want pad ${r.padBlock}/${r.padInline} gap ${r.gap} r16]`);
  console.log(`  body vertical pad=${m.bodyY} [want ${r.bodyY}]`);
  console.log(`  internal rhythm: eyebrow→name=${m.eyebrowName} greeting→roles=${m.greetRoles} tabs→bio=${m.tabsBio} cta=${m.ctaGap} grp1→2=${m.group1to2} grp2→3=${m.group2to3} [want 8/24/16/16/40/40]`);
  console.log(`  overlay rhythm: cat→title=${m.ovCatTitle} title→desc=${m.ovTitleDesc} [want 16/8]`);
  console.log(`  hero-top col gap=${m.heroRowGap} [dump 32]`);
  console.log(`  featured img H: large=${chk(m.featLargeH,t.featH)}  wide=${m.featWideH}  medium=${m.featMedH}  [dump large 393/389/315 floor]`);
  console.log(`  overlay LARGE: ${m.ovLarge.w}x${m.ovLarge.h} pad${m.ovLarge.pad} gap${m.ovLarge.gap} contained=${m.ovLarge.contained} [cap ${t.ovLarge||'—'}x120]`);
  console.log(`  overlay WIDE : ${m.ovWide.w}x${m.ovWide.h} pad${m.ovWide.pad} gap${m.ovWide.gap} contained=${m.ovWide.contained} [cap 854x120]`);
  console.log(`  overlay MED  : ${m.ovMed.w}x${m.ovMed.h} pad${m.ovMed.pad} gap${m.ovMed.gap} contained=${m.ovMed.contained} [cap ${t.ovMed||570}x120]`);
  console.log(`  glass card: W=${m.glass.w} pad=${m.glass.pt} r=${m.glass.r} [dump pad16 r16; 342 at stacked frames]`);

  // ---- hard assertions (exit non-zero on drift) ----
  assert(`${w} hero-card padBlock`, m.heroCard.pt, r.padBlock);
  assert(`${w} hero-card padInline`, m.heroCard.pl, r.padInline);
  assert(`${w} hero-card gap`, m.heroCard.gap, r.gap);
  assert(`${w} hero-card radius`, m.heroCard.r, 16);
  assert(`${w} body vertical pad`, m.bodyY, r.bodyY);
  assert(`${w} hero-top col gap`, m.heroRowGap, 32);
  if (w >= 1024) {
    assert(`${w} eyebrow→name`, m.eyebrowName, r.eyebrowName);
    assert(`${w} greeting→roles`, m.greetRoles, r.greetRoles);
    assert(`${w} tabs→bio`, m.tabsBio, r.tabsBio);
    assert(`${w} CTA gap`, m.ctaGap, r.ctaGap);
    assert(`${w} major group1→2`, m.group1to2, 40);
    assert(`${w} major group2→3`, m.group2to3, 40);
  }
  // overlay pad 16, gap 16, title→desc 8, contained; height floor 120
  assert(`${w} overlay pad`, m.ovLarge.pad, 16);
  assert(`${w} overlay gap`, m.ovLarge.gap, 16);
  assert(`${w} overlay cat→title`, m.ovCatTitle, 16);
  assert(`${w} overlay title→desc`, m.ovTitleDesc, 8);
  if (!m.ovLarge.contained) failures.push(`[${w} overlay LARGE] escapes card`);
  if (!m.ovMed.contained) failures.push(`[${w} overlay MED] escapes card`);
  if (m.ovLarge.h < 118) failures.push(`[${w} overlay LARGE height] ${m.ovLarge.h} < 120 floor`);
  // featured floor: fill wins (>=), but must not under-fill below the frame floor
  if (t.featH != null && m.featWideH < t.featH - 2) failures.push(`[${w} feature.wide] ${m.featWideH} < floor ${t.featH}`);
  if (t.featH != null && m.featMedH < t.featH - 2) failures.push(`[${w} feature.medium] ${m.featMedH} < floor ${t.featH}`);
}
await browser.close();

console.log('\n============================================');
if (failures.length) {
  console.log(`FRAME-AUDIT: FAIL (${failures.length})`);
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('FRAME-AUDIT: PASS — all exact-frame pins green');
  process.exit(0);
}
