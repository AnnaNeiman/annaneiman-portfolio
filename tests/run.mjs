// Throwaway headless verification harness (NOT shipped).
// Runs both pages at the five breakpoints, checks overflow/overlap,
// console errors, and the key interactions. Also screenshots.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');           // anna/portfolio/site
const OUT = resolve(__dirname, 'screens');             // full-page screenshots for Figma side-by-side
mkdirSync(OUT, { recursive: true });

// expected frame values from the Figma dump (§2 frame table): [bodyPadX, sectionGap]
const FRAME = { 1920:{padX:240,gap:60}, 1440:{padX:120,gap:60}, 1024:{padX:40,gap:40}, 768:{padX:32,gap:32}, 375:{padX:24,gap:24} };
const near = (a,b,tol=2)=>Math.abs(a-b)<=tol;

const WIDTHS = [375, 768, 1024, 1440, 1920];
const pages = {
  index: pathToFileURL(resolve(SITE, 'index.html')).href,
  marketplace: pathToFileURL(resolve(SITE, 'marketplace.html')).href,
  'case-2': pathToFileURL(resolve(SITE, 'case-2.html')).href,
  'case-3': pathToFileURL(resolve(SITE, 'case-3.html')).href,
  'case-4': pathToFileURL(resolve(SITE, 'case-4.html')).href,
  'case-5': pathToFileURL(resolve(SITE, 'case-5.html')).href,
};

let failures = [];
function fail(msg){ failures.push(msg); console.log('  ✗ ' + msg); }
function ok(msg){ console.log('  ✓ ' + msg); }

const browser = await chromium.launch();

for (const [name, url] of Object.entries(pages)) {
  console.log(`\n=== ${name} ===`);
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // horizontal overflow (allow the intentional bookshelf rail on index)
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    if (overflow > 2) fail(`[${name}@${w}] horizontal overflow: ${overflow}px`);
    else ok(`[${name}@${w}] no page overflow`);

    if (errs.length) fail(`[${name}@${w}] console errors: ${errs.join(' | ')}`);
    else ok(`[${name}@${w}] zero console errors`);

    // ---- BREATHING ROOM / 1:1 vs Figma frame ----
    // Fluid build: content is capped at --maxw (1440) and centered, so the
    // meaningful gutter is the space from the viewport edge to the CENTERED
    // content column — not raw body padding (body uses a clamp vw bridge that
    // only reaches 240 past ~2400px). At frame widths where the content is
    // capped+centered, the effective gutter = (vw - min(contentW, vw-2*pad))/2.
    // Below the cap, the gutter == body padding. We assert the effective gutter
    // matches the Figma frame side value (±6px for clamp/centering rounding),
    // and the section gap matches the frame gap.
    const fr = FRAME[w];
    if (name === 'index' && fr) {
      const geom = await page.evaluate(() => {
        const page = document.querySelector('.page');
        const r = page.getBoundingClientRect();
        const b = getComputedStyle(document.body);
        const gutterL = r.left;                 // effective left gutter to centered content
        const gap = parseFloat(getComputedStyle(page).rowGap || getComputedStyle(page).gap);
        return { gutterL: Math.round(gutterL), padL: Math.round(parseFloat(b.paddingLeft)), gap: Math.round(gap) };
      });
      near(geom.gutterL, fr.padX, 4) ? ok(`[index@${w}] content gutter ${geom.gutterL} ≈ Figma ${fr.padX}`) : fail(`[index@${w}] content gutter ${geom.gutterL} ≠ Figma ${fr.padX}`);
      near(geom.gap, fr.gap, 4) ? ok(`[index@${w}] section gap ${geom.gap} ≈ Figma ${fr.gap}`) : fail(`[index@${w}] section gap ${geom.gap} ≠ Figma ${fr.gap}`);
    }

    // ---- EXACT-FRAME stepped gaps: nav→hero AND section→section = frame gap ----
    if (name === 'index' && fr) {
      const gaps = await page.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect();
        const nav = r('.nav'), hero = r('#hero'), work = r('#work'), about = r('#about');
        return { navHero: Math.round(hero.top - nav.bottom), heroWork: Math.round(work.top - hero.bottom), workAbout: Math.round(about.top - work.bottom) };
      });
      near(gaps.navHero, fr.gap, 3) ? ok(`[index@${w}] nav→hero gap ${gaps.navHero} = Figma ${fr.gap}`) : fail(`[index@${w}] nav→hero gap ${gaps.navHero} ≠ Figma ${fr.gap}`);
      (near(gaps.heroWork, fr.gap, 3) && near(gaps.workAbout, fr.gap, 3)) ? ok(`[index@${w}] section gaps ${gaps.heroWork}/${gaps.workAbout} = Figma ${fr.gap}`) : fail(`[index@${w}] section gaps ${gaps.heroWork}/${gaps.workAbout} ≠ Figma ${fr.gap}`);
      // nav centered
      const navc = await page.evaluate((vw) => { const n = document.querySelector('.nav').getBoundingClientRect(); return Math.abs(Math.round(n.left) - Math.round(vw - n.right)); }, w);
      (navc <= 2) ? ok(`[index@${w}] nav horizontally centered`) : fail(`[index@${w}] nav off-center by ${navc}px`);
    }

    // ---- OPTION A card dims: hero-card width + featured image height pinned ----
    if (name === 'index') {
      const CARD = { 1920:{heroW:584,featH:393}, 1440:{heroW:459,featH:389}, 1024:{heroW:null,featH:315} };
      const ct = CARD[w];
      if (ct) {
        const dims = await page.evaluate(() => {
          const hc = document.querySelector('.hero-card').getBoundingClientRect();
          const fl = document.querySelector('.feature.large').getBoundingClientRect();
          const hg = Math.round(parseFloat(getComputedStyle(document.querySelector('.hero-top')).columnGap));
          return { heroW: Math.round(hc.width), featH: Math.round(fl.height), heroGap: hg };
        });
        if (ct.heroW != null) (near(dims.heroW, ct.heroW, 2) ? ok(`[index@${w}] hero-card width ${dims.heroW} = Figma ${ct.heroW}`) : fail(`[index@${w}] hero-card width ${dims.heroW} ≠ Figma ${ct.heroW}`));
        // featured card is vertical:fill (Figma alignItems:stretch) — it GROWS to match
        // the hero-card height; the frame height (393/389/315) is the MIN floor. Fill wins
        // (no negative space), so assert featH >= floor, not == floor.
        (dims.featH >= ct.featH - 2) ? ok(`[index@${w}] featured img height ${dims.featH} ≥ Figma floor ${ct.featH} (fills hero-card height)`) : fail(`[index@${w}] featured img height ${dims.featH} < Figma floor ${ct.featH}`);
        // right column bottom aligns with hero-card bottom — no negative space
        const aligned = await page.evaluate(() => {
          const hc = document.querySelector('.hero-card').getBoundingClientRect();
          const hr = document.querySelector('.hero-right').getBoundingClientRect();
          return Math.abs(hc.bottom - hr.bottom) <= 2;
        });
        aligned ? ok(`[index@${w}] right column bottom aligns with hero-card (no gap)`) : fail(`[index@${w}] right column leaves negative space under featured card`);
        near(dims.heroGap, 32, 2) ? ok(`[index@${w}] hero-row gap ${dims.heroGap} = Figma 32`) : fail(`[index@${w}] hero-row gap ${dims.heroGap} ≠ Figma 32`);
      }
    }

    // ---- OVERLAP: featured-card frosted overlay must sit inside its card ----
    if (name === 'index') {
      const bad = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('a.feature').forEach((card, i) => {
          const ov = card.querySelector('.overlay');
          if (!ov) return;
          const c = card.getBoundingClientRect(), o = ov.getBoundingClientRect();
          // overlay inset ~14px; allow 1px rounding
          if (o.left < c.left - 1 || o.right > c.right + 1 || o.bottom > c.bottom + 1 || o.top < c.top - 1) {
            out.push(`feature#${i} overlay ${Math.round(o.left)},${Math.round(o.top)},${Math.round(o.right)},${Math.round(o.bottom)} vs card ${Math.round(c.left)},${Math.round(c.top)},${Math.round(c.right)},${Math.round(c.bottom)}`);
          }
        });
        return out;
      });
      bad.length ? fail(`[index@${w}] overlay escapes card: ${bad.join(' ; ')}`) : ok(`[index@${w}] frosted overlays contained in cards`);
    }

    // ---- CASE-STUDY consistency with the homepage system (Phase 2) ----
    if (name === 'case') {
      // (a) section rhythm steps with the SAME Figma frame table as the homepage
      //     (--gap-section 60/40/32/24). Drives nav→hero + rail↔story breathing.
      if (fr) {
        const rhythm = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const gs = parseFloat(root.getPropertyValue('--gap-section'));
          const bg = document.querySelector('.body-grid');
          const grid = Math.round(parseFloat(getComputedStyle(bg).columnGap || getComputedStyle(bg).gap));
          const bar = document.querySelector('.topbar').getBoundingClientRect();
          const hero = document.querySelector('.hero .wrap').getBoundingClientRect();
          return { gapSection: Math.round(gs), bodyGridGap: grid, navHero: Math.round(hero.top - bar.bottom) };
        });
        near(rhythm.gapSection, fr.gap, 2) ? ok(`[case@${w}] --gap-section ${rhythm.gapSection} = Figma frame ${fr.gap} (matches homepage)`) : fail(`[case@${w}] --gap-section ${rhythm.gapSection} ≠ Figma frame ${fr.gap}`);
        // rail↔story grid gap tracks the frame gap at ≥901 (collapses to 1 col below)
        if (w >= 901) (near(rhythm.bodyGridGap, fr.gap, 2) ? ok(`[case@${w}] body-grid gap ${rhythm.bodyGridGap} = frame ${fr.gap}`) : fail(`[case@${w}] body-grid gap ${rhythm.bodyGridGap} ≠ frame ${fr.gap}`));
        // nav→hero top spacing opens the frame gap, same as the homepage nav→page
        near(rhythm.navHero, fr.gap, 4) ? ok(`[case@${w}] nav→hero gap ${rhythm.navHero} ≈ frame ${fr.gap}`) : fail(`[case@${w}] nav→hero gap ${rhythm.navHero} ≠ frame ${fr.gap}`);
      }
      // (b) decision code must WRAP — zero in-card horizontal overflow at every width
      const codeBad = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.codeblock').forEach((el, i) => {
          if (el.scrollWidth > el.clientWidth + 2) out.push(`codeblock#${i} scrollW ${el.scrollWidth} > clientW ${el.clientWidth}`);
        });
        return out;
      });
      codeBad.length ? fail(`[case@${w}] decision code overflows: ${codeBad.join(' ; ')}`) : ok(`[case@${w}] decision code wraps (no in-card overflow)`);
      // (c) result badge fully inside the hero figure — no overhang/clip
      const badge = await page.evaluate(() => {
        const fig = document.querySelector('.hero-figure').getBoundingClientRect();
        const b = document.querySelector('.result-badge').getBoundingClientRect();
        return { escapes: b.left < fig.left - 1 || b.right > fig.right + 1 || b.bottom > fig.bottom + 1 || b.top < fig.top - 1 };
      });
      badge.escapes ? fail(`[case@${w}] result badge overhangs/clips the hero figure`) : ok(`[case@${w}] result badge contained in hero figure (no overhang)`);
      // (d) no element overflows the story column (in-card clip guard)
      const storyBad = await page.evaluate(() => {
        const story = document.querySelector('.story');
        return story.scrollWidth > story.clientWidth + 2 ? story.scrollWidth - story.clientWidth : 0;
      });
      storyBad ? fail(`[case@${w}] story column overflows by ${storyBad}px`) : ok(`[case@${w}] story column no horizontal overflow`);
    }

    // ---- MARKETPLACE (task 7.1): full-bleed band must not overflow the page or its column ----
    if (name === 'marketplace') {
      // (a) explicit page-overflow readout at every width (report the measured px)
      (overflow <= 2)
        ? ok(`[marketplace@${w}] document horizontal overflow ${overflow}px ≤ 2px`)
        : fail(`[marketplace@${w}] document horizontal overflow ${overflow}px > 2px`);
      // (b) the .story column has no in-column horizontal overflow (track-bounded bleed)
      const storyOverflow = await page.evaluate(() => {
        const story = document.querySelector('.story');
        if (!story) return null;
        return story.scrollWidth > story.clientWidth + 2 ? story.scrollWidth - story.clientWidth : 0;
      });
      if (storyOverflow === null) fail(`[marketplace@${w}] .story column not found`);
      else storyOverflow ? fail(`[marketplace@${w}] .story column overflows by ${storyOverflow}px`) : ok(`[marketplace@${w}] .story column no horizontal overflow`);
      // (c) exactly one .mp-bleed element (the single full-bleed moment)
      const bleedCount = await page.evaluate(() => document.querySelectorAll('.mp-bleed').length);
      (bleedCount === 1) ? ok(`[marketplace@${w}] exactly one .mp-bleed element`) : fail(`[marketplace@${w}] .mp-bleed count ${bleedCount} (want 1)`);
    }

    await page.screenshot({ path: resolve(OUT, `${name}-${w}.png`), fullPage: true });
    await ctx.close();
  }
}

// ---- interaction checks on index @1440 ----
console.log('\n=== index interactions @1440 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(pages.index, { waitUntil: 'networkidle' });

  // exactly one h1 = Anna Neiman
  const h1s = await page.$$eval('h1', els => els.map(e => e.textContent.trim()));
  (h1s.length === 1 && h1s[0] === 'Anna Neiman') ? ok('one h1 = Anna Neiman') : fail('h1 wrong: ' + JSON.stringify(h1s));

  // on load, two bio panels hidden (JS collapsed)
  const hidden = await page.$$eval('.bio', els => els.filter(e => e.hidden).length);
  (hidden === 2) ? ok('two bios hidden on load (JS)') : fail('bio hidden count = ' + hidden);

  // click Design Lead tab -> its panel visible, recruiter hidden, aria-selected moves
  await page.click('#tab-lead');
  const leadState = await page.evaluate(() => ({
    sel: document.getElementById('tab-lead').getAttribute('aria-selected'),
    leadVisible: !document.getElementById('bio-lead').hidden,
    recHidden: document.getElementById('bio-recruiter').hidden,
  }));
  (leadState.sel==='true' && leadState.leadVisible && leadState.recHidden) ? ok('tab click swaps panel + aria-selected') : fail('tab click: ' + JSON.stringify(leadState));

  // keyboard: focus recruiter tab, ArrowRight -> lead selected
  await page.focus('#tab-recruiter');
  await page.keyboard.press('ArrowRight');
  const kbd = await page.evaluate(() => document.activeElement.id + '|' + document.getElementById('tab-lead').getAttribute('aria-selected'));
  (kbd === 'tab-lead|true') ? ok('ArrowRight moves selection + focus') : fail('keyboard: ' + kbd);
  await page.keyboard.press('End');
  const endK = await page.evaluate(() => document.getElementById('tab-engineer').getAttribute('aria-selected'));
  (endK === 'true') ? ok('End selects last tab') : fail('End: ' + endK);

  // cards/rows link to the real marketplace study (card 01 + row 01) or a placeholder case page.
  // No portfolio entry should still point at the generic case-study.html template.
  const links = await page.$$eval('a.feature, a.work-row', els => els.map(e => e.getAttribute('href')));
  const allowed = new Set(['marketplace.html', 'case-2.html', 'case-3.html', 'case-4.html', 'case-5.html']);
  const stale = links.filter(h => h === 'case-study.html');
  const bad = links.filter(h => !allowed.has(h));
  const mkt = links.filter(h => h === 'marketplace.html').length;
  (bad.length === 0 && stale.length === 0 && mkt >= 1)
    ? ok(`${links.length} cards/rows link to real/placeholder pages (marketplace x${mkt}, 0 stale case-study.html)`)
    : fail('card links: ' + JSON.stringify(links));

  // count-up finished
  await page.waitForTimeout(1500);
  const metric = await page.$eval('.work-metric .num[data-count]', e => e.textContent.trim());
  (metric === '+37%') ? ok('count-up ends at +37%') : fail('count-up: ' + metric);

  // scrollspy: scroll to work, exactly one aria-current
  await page.evaluate(() => document.getElementById('work').scrollIntoView());
  await page.waitForTimeout(600);
  const cur = await page.$$eval('.nav a', els => els.filter(e => e.getAttribute('aria-current')==='true').map(e=>e.getAttribute('href')));
  (cur.length === 1) ? ok('scrollspy: exactly one aria-current (' + cur[0] + ')') : fail('aria-current count: ' + JSON.stringify(cur));

  // nav sticky + shadow after scroll
  const navSticky = await page.$eval('.nav', e => getComputedStyle(e).position);
  (navSticky === 'sticky') ? ok('nav position:sticky') : fail('nav position: ' + navSticky);
  const navShadow = await page.$eval('.nav', e => e.classList.contains('scrolled'));
  navShadow ? ok('nav gains .scrolled on scroll') : fail('nav no .scrolled after scroll');

  // ---- GROUPING (Gestalt proximity): within-group gaps tighter than between-group ----
  const grp = await page.evaluate(() => {
    const g = (sel, prop='gap') => { const e = document.querySelector(sel); if(!e) return null; const s = getComputedStyle(e); return parseFloat(s[prop] || s.gap || s.rowGap); };
    return {
      workMain: g('.work-main'),          // label→title→desc (within group)
      workTags: g('.work-tags'),          // role tags (within group)
      workRowGap: g('.work-row','columnGap'),
      heroBento: g('.hero-top','columnGap'), // card-to-card (between group)
      pageGap: g('.page','rowGap'),       // section-to-section (between group)
    };
  });
  (grp.workMain < grp.heroBento && grp.workMain < grp.pageGap)
    ? ok(`grouping: within-card ${grp.workMain}px < bento ${grp.heroBento}px & section ${grp.pageGap}px`)
    : fail(`grouping inverted: within-card ${grp.workMain} vs bento ${grp.heroBento} / section ${grp.pageGap}`);
  (grp.workTags <= grp.workRowGap)
    ? ok(`grouping: tags ${grp.workTags}px ≤ work-row ${grp.workRowGap}px`)
    : fail(`grouping: tags ${grp.workTags}px > work-row ${grp.workRowGap}px`);

  if (errs.length) fail('index interaction console errors: ' + errs.join(' | '));
  await ctx.close();
}

// ---- no-JS check on index ----
console.log('\n=== index no-JS ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(pages.index, { waitUntil: 'load' });
  const visibleBios = await page.$$eval('.bio', els => els.filter(e => !e.hidden).length);
  (visibleBios === 3) ? ok('no-JS: all 3 bios visible') : fail('no-JS bios visible = ' + visibleBios);
  const metric = await page.$eval('.work-metric .num[data-count]', e => e.textContent.trim());
  (metric === '+37%') ? ok('no-JS: metric shows final value') : fail('no-JS metric: ' + metric);
  await ctx.close();
}

// ---- marketplace (case-study) interactions ----
console.log('\n=== marketplace (case-study) interactions ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(pages.marketplace, { waitUntil: 'networkidle' });

  // skip -> #main, one h1
  const skip = await page.$eval('.skip', e => e.getAttribute('href'));
  (skip === '#main') ? ok('skip -> #main') : fail('skip: ' + skip);
  const h1n = await page.$$eval('h1', els => els.length);
  (h1n === 1) ? ok('one h1') : fail('h1 count: ' + h1n);

  // source order: h1 above <main>, aside before main
  const order = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const aside = document.querySelector('aside.rail');
    const main = document.getElementById('main');
    const inMain = main.contains(h1);
    const asideBeforeMain = (aside.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return { inMain, asideBeforeMain };
  });
  (!order.inMain && order.asideBeforeMain) ? ok('source order: h1 outside main, aside before main') : fail('order: ' + JSON.stringify(order));

  // rail: the summary scrolls with the story; only the section nav stays sticky
  // (so the nav is always reachable even when the summary card is tall)
  const navPos = await page.$eval('.spinenav', e => getComputedStyle(e).position);
  (navPos === 'sticky') ? ok('section nav sticky @1440') : fail('spinenav position: ' + navPos);

  // outcome count-up settles to final values
  await page.evaluate(() => document.getElementById('s-outcomes').scrollIntoView());
  await page.waitForTimeout(2500);
  const scale = await page.$$eval('.ocard .onum', els => els.map(e=>e.textContent.trim()));
  (scale.includes('+37%') && scale.includes('6+')) ? ok('outcome count-up settled (+37% … 6+)') : fail('outcomes: ' + JSON.stringify(scale));

  // decision wipe reveal
  await page.evaluate(() => document.getElementById('d1').scrollIntoView());
  await page.waitForTimeout(800);
  const dIn = await page.$eval('#d1', e => e.classList.contains('in'));
  dIn ? ok('decision reveal fired (.in)') : fail('decision not revealed');

  // progress bar grew
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight/2));
  await page.waitForTimeout(300);
  const prog = await page.$eval('#progress', e => parseFloat(e.style.width) || 0);
  (prog > 0) ? ok('progress bar grows (' + prog.toFixed(0) + '%)') : fail('progress width 0');

  // spine scrollspy exactly one aria-current
  const spineCur = await page.$$eval('.spinenav a', els => els.filter(e=>e.getAttribute('aria-current')==='true').length);
  (spineCur === 1) ? ok('spine scrollspy exactly one aria-current') : fail('spine aria-current count: ' + spineCur);

  // mobile bar: role=region, not aria-hidden; jump link focusable
  const mb = await page.evaluate(() => {
    const el = document.querySelector('.mobilebar');
    return { role: el.getAttribute('role'), ariaHidden: el.getAttribute('aria-hidden'), jump: !!el.querySelector('a[href="#s-outcomes"]') };
  });
  (mb.role==='region' && !mb.ariaHidden && mb.jump) ? ok('mobile bar region, no aria-hidden, jump link present') : fail('mobilebar: ' + JSON.stringify(mb));

  // how-it-was-built section renders (marketplace uses a plain #s-howbuilt section
  // with a <dl class="buildlist">, not the old collapsible <details class="built">)
  const built = await page.evaluate(() => {
    const sec = document.getElementById('s-howbuilt');
    const dl = sec && sec.querySelector('dl.buildlist');
    return { hasSection: !!sec, rows: dl ? dl.querySelectorAll('div').length : 0 };
  });
  (built.hasSection && built.rows >= 1) ? ok(`how-it-was-built renders (${built.rows} rows)`) : fail('how-it-was-built: ' + JSON.stringify(built));

  if (errs.length) fail('marketplace interaction console errors: ' + errs.join(' | '));
  await ctx.close();
}

// ---- reduced motion on marketplace ----
console.log('\n=== marketplace reduced-motion ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(pages.marketplace, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const scale = await page.$$eval('.ocard .onum', els => els.map(e=>e.textContent.trim()));
  (scale.includes('+37%') && scale.includes('6+')) ? ok('reduced-motion: numbers show final immediately') : fail('rm outcomes: ' + JSON.stringify(scale));
  const wipeHidden = await page.$eval('.dcol.shipped .wipe', e => getComputedStyle(e).display);
  (wipeHidden === 'none') ? ok('reduced-motion: wipe display:none') : fail('wipe display: ' + wipeHidden);
  await ctx.close();
}

// ---- mobile bar visible <=900, hidden >=901 ----
console.log('\n=== marketplace mobile bar breakpoint ===');
{
  for (const [w, want] of [[375, 'flex'], [1024, 'none']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(pages.marketplace, { waitUntil: 'load' });
    const disp = await page.$eval('.mobilebar', e => getComputedStyle(e).display);
    (disp === want) ? ok(`mobile bar display @${w} = ${disp}`) : fail(`mobile bar @${w}: ${disp} (want ${want})`);
    if (want === 'flex') {
      // scroll to bottom; the fixed bar must not cover footer text (body has padding-bottom clearance)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      const clear = await page.evaluate(() => {
        const bar = document.querySelector('.mobilebar').getBoundingClientRect();
        const foot = document.querySelector('footer.site').getBoundingClientRect();
        const jump = document.querySelector('.mobilebar .m-jump').getBoundingClientRect();
        const barInView = bar.right <= window.innerWidth + 1 && bar.left >= -1;
        return { footerCovered: foot.bottom > bar.top + 1, jumpClipped: jump.right > window.innerWidth + 1, barInView };
      });
      (!clear.footerCovered && !clear.jumpClipped && clear.barInView)
        ? ok(`mobile bar @${w}: clears footer, jump link not clipped, bar in viewport`)
        : fail(`mobile bar @${w} overlap: ${JSON.stringify(clear)}`);
    }
    await ctx.close();
  }
}

await browser.close();

console.log('\n============================================');
if (failures.length) {
  console.log(`RESULT: FAIL (${failures.length})`);
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('RESULT: PASS — all checks green');
  process.exit(0);
}
