// Dev-only: capture computed spacing/type values BEFORE and AFTER the token
// refactor to prove net-zero rendered change. Writes JSON to baseline-<tag>.json.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');
const tag = process.argv[2] || 'before';

const pages = {
  index: pathToFileURL(resolve(SITE, 'index.html')).href,
  case: pathToFileURL(resolve(SITE, 'marketplace.html')).href,
};
const WIDTHS = [375, 768, 1024, 1440, 1920];
const browser = await chromium.launch();
const out = {};

for (const [name, url] of Object.entries(pages)) {
  out[name] = {};
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const data = await page.evaluate(() => {
      const cs = (sel, props) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        const o = {};
        props.forEach(p => o[p] = s[p]);
        return o;
      };
      const body = getComputedStyle(document.body);
      const r = {
        body: { paddingTop: body.paddingTop, paddingRight: body.paddingRight, paddingBottom: body.paddingBottom, paddingLeft: body.paddingLeft },
      };
      // shared probes
      r.h1 = cs('h1', ['fontSize', 'lineHeight', 'letterSpacing']);
      return r;
    });
    // page-specific probes
    const extra = await page.evaluate((pg) => {
      const gv = (sel, props) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); const o = {}; props.forEach(p => o[p] = s[p]); return o; };
      const res = {};
      if (pg === 'index') {
        res.page = gv('.page', ['gap']);
        res.contactH2 = gv('.contact h2', ['fontSize', 'lineHeight']);
        res.workMetricNum = gv('.work-metric .num', ['fontSize']);
        res.sectionHead = gv('.section-head', ['gap']);
        res.workMain = gv('.work-main', ['gap']);
        res.heroCard = gv('.hero-card', ['gap']);
        res.glass = gv('.glass', ['gap']);
        res.contact = gv('.contact', ['gap']);
        res.workList = gv('.work-list', ['marginTop']);
        res.workTags = gv('.work-tags', ['gap']);
      } else {
        res.heroH1 = gv('.hero h1', ['fontSize', 'lineHeight']);
        res.claim = gv('.section h2.claim', ['fontSize', 'lineHeight']);
        res.badgeNum = gv('.result-badge .num', ['fontSize']);
        res.hook = gv('.hero .hook', ['fontSize', 'lineHeight']);
        res.heroWrap = gv('.hero .wrap', ['gap']);
        res.bodyGrid = gv('.body-grid', ['gap', 'marginTop']);
        res.summaryCard = gv('.summary-card', ['padding']);
        res.insights = gv('.insights', ['gap']);
        res.tldr = gv('.tldr', ['padding']);
        res.heroMeta = gv('.hero-meta', ['gap']);
      }
      return res;
    }, name);
    out[name][w] = { ...data, ...extra };
    await ctx.close();
  }
}
await browser.close();
writeFileSync(resolve(__dirname, `baseline-${tag}.json`), JSON.stringify(out, null, 2));
console.log(`wrote baseline-${tag}.json`);
