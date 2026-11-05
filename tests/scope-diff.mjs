// Dev-only (NOT shipped). Task 7.6 — before/after computed-style diff.
//
// Proves the `.mp`-scoped marketplace polish did NOT leak onto the other two
// shared-stylesheet page (index.html). The three edited
// files (marketplace.html, assets/styles.css, assets/case-study.css) are
// MODIFIED in the working tree; HEAD is the clean "before" baseline.
//
// Method:
//   1. Create a detached git worktree of HEAD at /tmp/cs-baseline ("before").
//   2. For each page, snapshot getComputedStyle for a fixed element set +
//      the :root custom-property dump, BEFORE (worktree) and AFTER (working tree).
//   3. Assert DEEP EQUALITY on every sampled *resolved* property. New :root
//      token NAMES may appear in the raw custom-prop dump (that's allowed and
//      reported separately), but no resolved property on a sampled element may
//      change. Any differing resolved value is a scope-leak FAILURE.
//   4. Remove the worktree.
//
// Run: node .agents/verify/scope-diff.mjs   (cwd anywhere; paths are absolute)

import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..', '..', '..', '..'); // -> /Users/Anna/sidecar
const SITE_AFTER = resolve(__dirname, '..'); // working-tree anna/portfolio/site
const WORKTREE = '/tmp/cs-baseline';
const SITE_BEFORE = resolve(WORKTREE, 'anna', 'portfolio', 'site');

// Pages that must stay identical (marketplace.html is intentionally excluded —
// it is the page that *did* change).
const PAGES = ['index.html'];

// Fixed element set to snapshot. `.first()` semantics: we sample the first
// match of each selector. Absent selectors are recorded as { missing: true }
// so an element appearing/disappearing between before/after is itself a diff.
const ELEMENTS = [
  'body',
  '.outcomes',
  '.ocard',
  '.insight',
  '.dcol.rejected',
  '.dcol.shipped',
  '.imgslot',
  '.result-badge',
];

// Stable subset of resolved properties — enough to catch a visual leak from
// the polish (surfaces, accent borders/shadows, spacing, focus outline color).
const PROPS = [
  'background-color',
  'color',
  'box-shadow',
  'border-top-color',
  'border-top-width',
  'border-top-style',
  'border-left-color',
  'border-left-width',
  'border-right-color',
  'border-bottom-color',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'row-gap',
  'column-gap',
  'outline-color',
  'outline-width',
  'font-size',
  'letter-spacing',
  'line-height',
];

function git(...args) {
  return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
}

function setupWorktree() {
  // Clean any stale worktree from a prior aborted run. `worktree remove` errors
  // (and prints to stderr) when nothing is there, which is fine — prune quietly
  // first so the common case produces no noise.
  try {
    git('worktree', 'prune');
    execFileSync('git', ['-C', REPO, 'worktree', 'remove', WORKTREE, '--force'], { stdio: 'ignore' });
  } catch {
    /* none present — fine */
  }
  git('worktree', 'add', '--detach', WORKTREE, 'HEAD');
}

function teardownWorktree() {
  try {
    git('worktree', 'remove', WORKTREE, '--force');
  } catch (e) {
    console.log('  ! worktree cleanup warning: ' + e.message);
  }
}

// Collect every `--token` name declared anywhere in a site dir's CSS files.
// Chromium blocks `cssRules` access on cross-origin file:// external
// stylesheets, so we harvest the candidate NAMES from disk (in Node) and then
// resolve each to its RESOLVED value via getComputedStyle(:root) in the page.
// That gives a true :root custom-property readout independent of the CORS
// restriction, for both the before (worktree) and after (working tree) dirs.
function collectTokenNames(siteDir) {
  const names = new Set();
  const cssDir = resolve(siteDir, 'assets');
  let files = [];
  try {
    files = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
  } catch {
    return [];
  }
  const re = /(--[A-Za-z0-9_-]+)\s*:/g;
  for (const f of files) {
    const text = readFileSync(resolve(cssDir, f), 'utf8');
    let m;
    while ((m = re.exec(text)) !== null) names.add(m[1]);
  }
  return [...names].sort();
}

// Snapshot one page: { elements: {sel: {prop:value}|{missing:true}}, rootTokens: {name:resolvedValue} }
async function snapshot(browser, fileUrl, tokenNames) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const data = await page.evaluate(
    ({ elements, props, tokenNames }) => {
      const out = { elements: {}, rootTokens: {} };
      for (const sel of elements) {
        const el = document.querySelector(sel);
        if (!el) {
          out.elements[sel] = { missing: true };
          continue;
        }
        const cs = getComputedStyle(el);
        const rec = {};
        for (const p of props) rec[p] = cs.getPropertyValue(p).trim();
        out.elements[sel] = rec;
      }
      // :root custom-property readout: resolve each candidate token name on the
      // document root. An empty string means the name is not actually in effect
      // on :root for this page (we drop those so the delta only reflects tokens
      // that genuinely resolve).
      const rootCs = getComputedStyle(document.documentElement);
      for (const name of tokenNames) {
        const v = rootCs.getPropertyValue(name).trim();
        if (v !== '') out.rootTokens[name] = v;
      }
      return out;
    },
    { elements: ELEMENTS, props: PROPS, tokenNames }
  );

  await ctx.close();
  return data;
}

// Compare before/after for one page. Returns array of diff strings (empty = PASS).
function diffPage(before, after) {
  const diffs = [];

  // Element resolved properties — the leak-detection assertion.
  for (const sel of ELEMENTS) {
    const b = before.elements[sel];
    const a = after.elements[sel];
    const bMissing = b && b.missing;
    const aMissing = a && a.missing;
    if (bMissing && aMissing) continue; // consistently absent — fine
    if (bMissing !== aMissing) {
      diffs.push(`${sel}: element presence changed (before ${bMissing ? 'absent' : 'present'} → after ${aMissing ? 'absent' : 'present'})`);
      continue;
    }
    for (const p of PROPS) {
      if (b[p] !== a[p]) {
        diffs.push(`${sel} { ${p} }: "${b[p]}" → "${a[p]}"`);
      }
    }
  }

  return diffs;
}

// Report (informational) which :root token NAMES were added — allowed.
function tokenDelta(before, after) {
  const added = [];
  const changed = [];
  for (const name of Object.keys(after.rootTokens)) {
    if (!(name in before.rootTokens)) added.push(name);
    else if (before.rootTokens[name] !== after.rootTokens[name]) {
      changed.push(`${name}: "${before.rootTokens[name]}" → "${after.rootTokens[name]}"`);
    }
  }
  const removed = Object.keys(before.rootTokens).filter((n) => !(n in after.rootTokens));
  return { added, removed, changed };
}

// ---- main ----
let exitCode = 0;
setupWorktree();

const browser = await chromium.launch();
try {
  // Candidate token names from each tree's CSS (union covers added/removed).
  const beforeTokenNames = collectTokenNames(SITE_BEFORE);
  const afterTokenNames = collectTokenNames(SITE_AFTER);
  const unionTokenNames = [...new Set([...beforeTokenNames, ...afterTokenNames])].sort();
  console.log(`(scanned ${beforeTokenNames.length} token names in baseline CSS, ${afterTokenNames.length} in working-tree CSS)`);

  for (const pageFile of PAGES) {
    console.log(`\n=== ${pageFile} ===`);
    const beforeUrl = pathToFileURL(resolve(SITE_BEFORE, pageFile)).href;
    const afterUrl = pathToFileURL(resolve(SITE_AFTER, pageFile)).href;

    const before = await snapshot(browser, beforeUrl, unionTokenNames);
    const after = await snapshot(browser, afterUrl, unionTokenNames);

    const diffs = diffPage(before, after);
    const td = tokenDelta(before, after);

    // Report token-name delta (informational; added names are allowed).
    if (td.added.length) console.log(`  i :root token names ADDED (allowed): ${td.added.join(', ')}`);
    if (td.removed.length) console.log(`  i :root token names REMOVED: ${td.removed.join(', ')}`);
    // A changed resolved :root value is only a problem if it also changes a
    // sampled element's resolved property (caught above). We surface it as info.
    if (td.changed.length) console.log(`  i :root token values changed on root: ${td.changed.join(' ; ')}`);

    if (diffs.length === 0) {
      console.log(`  ✓ PASS — zero resolved-style diffs across ${ELEMENTS.length} sampled selectors`);
    } else {
      exitCode = 1;
      console.log(`  ✗ FAIL — ${diffs.length} scope leak(s) detected:`);
      for (const d of diffs) console.log(`      - ${d}`);
    }
  }
} finally {
  await browser.close();
  teardownWorktree();
}

console.log('\n============================================');
if (exitCode === 0) {
  console.log('RESULT: PASS — .mp-scoped changes did not leak to index.html');
} else {
  console.log('RESULT: FAIL — scope leak detected (see diffs above)');
}
process.exit(exitCode);
