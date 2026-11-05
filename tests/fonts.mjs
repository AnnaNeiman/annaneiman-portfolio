// Dev-only: computed font-family audit — every key text element's rendered family
// must be 1:1 with the Figma dump (node 54:1923 / Hero Card 54:1365). NOT shipped.
//
// Why computed font-family (not the actually-painted glyph font): the CSS cascade is
// what we control and what the Figma map pins. We assert the FIRST family in the
// computed font-family stack equals the expected face, which is deterministic whether
// or not the Google webfont finished downloading in headless. We also print the full
// stack so a reviewer can eyeball the fallbacks.
//
// Expected families per the node-verified Figma map (see TYPEFACE-AUDIT.md):
//   Playfair Display = hero name, section/contact/reading headlines, case-study h1 +
//                      claims, the glass hobby-card .desc.
//   Space Mono       = eyebrow, all kickers/labels, nav? (NO — see below), meta,
//                      captions, book spines, code, category tags, info VALUE,
//                      work index + metric label, footer tagline.
//   Inter            = greeting, role tabs, bios, body copy, buttons, metric numbers,
//                      work-row titles/descriptions, info LABEL, nav links, work tags,
//                      project-info title + description.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, '..');
const pages = {
  index: pathToFileURL(resolve(SITE, 'index.html')).href,
  case: pathToFileURL(resolve(SITE, 'marketplace.html')).href,
};

// The three canonical primary families (first token of each --f-* stack).
const PLAYFAIR = 'Playfair Display';
const MONO = 'Space Mono';
const INTER = 'Inter';

// element label -> { sel, expect }. sel is a CSS selector; we read the first visible match.
// index.html probes (node IDs are the Figma source for each expectation).
const INDEX_PROBES = [
  { label: 'hero name (h1.hero-name) — node 54:1368', sel: '.hero-name', expect: PLAYFAIR },
  { label: 'eyebrow (.eyebrow) — node 54:1367', sel: '.eyebrow', expect: MONO },
  { label: 'greeting pill (.greeting) — node 54:1371', sel: '.greeting', expect: INTER },
  { label: 'role tab (.switcher-tabs [role=tab]) — node 54:1375', sel: '.switcher-tabs [role="tab"]', expect: INTER },
  { label: 'bio (.bio) — node 54:1382', sel: '.bio', expect: INTER },
  { label: 'CTA button (.hero-ctas .btn) — node 55:4026', sel: '.hero-ctas .btn', expect: INTER },
  { label: 'nav link (.nav a) — node 54:1356', sel: '.nav a', expect: INTER },
  { label: 'work kicker "all work" (.work .kicker) — node 54:1471', sel: '#work .kicker', expect: MONO },
  { label: 'work count "5 case studies" (.work .count) — node 54:1473', sel: '#work .count', expect: MONO },
  { label: 'section headline (.about h2) — node 54:1566', sel: '.about h2', expect: PLAYFAIR },
  { label: 'reading headline (.reading-stats h2) — node 54:1614', sel: '.reading-stats h2', expect: PLAYFAIR },
  { label: 'contact headline (.contact h2) — node 54:1622', sel: '.contact h2', expect: PLAYFAIR },
  { label: 'glass hobby .desc — node 54:1402 (style_c8137439)', sel: '.glass .desc', expect: PLAYFAIR },
  { label: 'glass hobby .label — node 54:1400', sel: '.glass .label', expect: MONO },
  { label: 'featured overlay category (.overlay .cat) — node 54:1417', sel: '.overlay .cat', expect: MONO },
  { label: 'featured overlay title (.overlay .ptitle) — node 54:1423', sel: '.overlay .ptitle', expect: INTER },
  { label: 'featured overlay desc (.overlay .pout) — node 54:1424', sel: '.overlay .pout', expect: INTER },
  { label: 'work-row title (.work-title) — node 55:2789', sel: '.work-title', expect: INTER },
  { label: 'work-row desc (.work-desc) — node 55:2790', sel: '.work-desc', expect: INTER },
  { label: 'work tag (.tag) — node 55:2793 (EL-a980784f)', sel: '.tag', expect: INTER },
  { label: 'work index (.work-index) — node 55:2786', sel: '.work-index', expect: MONO },
  { label: 'work metric num (.work-metric .num) — node 55:2799', sel: '.work-metric .num', expect: INTER },
  { label: 'work metric label (.work-metric .lab) — node 55:2800', sel: '.work-metric .lab', expect: MONO },
  { label: 'work row arrow (.work-arrow) — node 55:2801', sel: '.work-arrow', expect: INTER },
  { label: 'info-card LABEL (.info-card .il) — node 54:1575', sel: '.info-card .il', expect: INTER },
  { label: 'info-card VALUE (.info-card .iv) — node 54:1576', sel: '.info-card .iv', expect: MONO },
  { label: 'book spine (.spine span) — node 54:1596', sel: '.spine span', expect: MONO },
  { label: 'footer tagline (.tagline) — node 54:1630', sel: '.tagline', expect: MONO },
  { label: 'footer email (.site-footer .email) — node 54:1629', sel: '.site-footer .email', expect: INTER },
  { label: 'footer social (.socials a) — node 54:1632', sel: '.socials a', expect: INTER },
];

// marketplace.html is a bespoke case-study page (no 1:1 Figma node); assert it against the SAME
// family map so the two pages stay consistent.
const CASE_PROBES = [
  { label: 'case hero h1 (.hero h1)', sel: '.hero h1', expect: PLAYFAIR },
  { label: 'case claim (.section h2.claim)', sel: '.section h2.claim', expect: PLAYFAIR },
  { label: 'case kicker (.section .kicker)', sel: '.section .kicker', expect: MONO },
  { label: 'case hook (.hook)', sel: '.hook', expect: INTER },
  { label: 'case body (.section p.lead)', sel: '.section p.lead', expect: INTER },
  { label: 'case chip (.chip)', sel: '.chip', expect: MONO },
  { label: 'case summary value (.sfield .v)', sel: '.sfield .v', expect: INTER },
  { label: 'case decision head h3 (.dhead h3)', sel: '.dhead h3', expect: INTER },
  { label: 'case outcome num (.ocard .onum)', sel: '.ocard .onum', expect: INTER },
  { label: 'case readtime (.readtime)', sel: '.readtime', expect: MONO },
];

// widths the user asked the font harness to cover (plus parity check that computed
// family is breakpoint-stable, which it must be — none of the --f-* are media-swapped).
const WIDTHS = [1440, 375];

const firstFamily = (stack) =>
  (stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '');

const browser = await chromium.launch();
let failures = [];

async function auditPage(name, url, probes) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    console.log(`\n=== ${name} @ ${w}px — computed font-family ===`);
    for (const p of probes) {
      const stack = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return getComputedStyle(el).fontFamily;
      }, p.sel);
      if (stack == null) {
        failures.push(`[${name}@${w}] MISSING element: ${p.label} (${p.sel})`);
        console.log(`  ✗ ${p.label} → element not found`);
        continue;
      }
      const got = firstFamily(stack);
      if (got === p.expect) {
        console.log(`  ✓ ${p.label} → ${got}`);
      } else {
        failures.push(`[${name}@${w}] ${p.label}: computed "${got}" ≠ expected "${p.expect}" (stack: ${stack})`);
        console.log(`  ✗ ${p.label} → ${got} (expected ${p.expect})  [stack: ${stack}]`);
      }
    }
    await ctx.close();
  }
}

await auditPage('index', pages.index, INDEX_PROBES);
await auditPage('case', pages.case, CASE_PROBES);
await browser.close();

console.log('\n============================================');
if (failures.length) {
  console.log(`FONT-AUDIT: FAIL (${failures.length})`);
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('FONT-AUDIT: PASS — every probed element is 1:1 with the Figma font map');
  process.exit(0);
}
