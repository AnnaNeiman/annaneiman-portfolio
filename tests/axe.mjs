// Dev-only axe-core accessibility run (NOT shipped). Injects axe-core into
// both pages at 1440 + 375 and reports violations by impact. Zero critical/
// serious is the Phase-4 gate (minor/moderate noted). Automated a11y is a
// proxy, not WCAG 2.1 AA certification — manual AT + expert review still needed.
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, "..");
const axeSrc = readFileSync(resolve(__dirname, "node_modules/axe-core/axe.min.js"), "utf8");

const pages = {
  index: pathToFileURL(resolve(SITE, "index.html")).href,
  marketplace: pathToFileURL(resolve(SITE, "marketplace.html")).href,
  "case-2": pathToFileURL(resolve(SITE, "case-2.html")).href,
  "case-3": pathToFileURL(resolve(SITE, "case-3.html")).href,
  "case-4": pathToFileURL(resolve(SITE, "case-4.html")).href,
  "case-5": pathToFileURL(resolve(SITE, "case-5.html")).href
};
const WIDTHS = [1440, 375];

const browser = await chromium.launch();
let worst = 0; // 0 none, 1 minor/moderate, 2 serious/critical
const rank = { minor: 1, moderate: 1, serious: 2, critical: 2 };

for (const [name, url] of Object.entries(pages)) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.evaluate(axeSrc);
    const results = await page.evaluate(async () => {
      return await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] }
      });
    });
    const v = results.violations;
    console.log(`\n=== ${name} @ ${w} ===`);
    if (v.length === 0) {
      console.log("  ✓ 0 violations");
    } else {
      for (const issue of v) {
        const impact = issue.impact || "minor";
        worst = Math.max(worst, rank[impact] || 1);
        console.log(`  ${rank[impact] === 2 ? "✗" : "•"} [${impact}] ${issue.id}: ${issue.help} (${issue.nodes.length} node(s))`);
        issue.nodes.slice(0, 2).forEach((n) => console.log(`      ${n.target.join(" ")}`));
      }
    }
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Preserved a11y invariants for marketplace.html (task 7.2 / Req 8.1–8.6, 10.1).
// These mirror the invariants run.mjs already asserts for marketplace.html. Any
// failure here flips the overall result to FAIL with the observed value.
// ---------------------------------------------------------------------------
const mpUrl = pages.marketplace;
let invariantFail = 0;
const inv = [];
const rec = (name, pass, observed) => {
  inv.push({ name, pass, observed });
  if (!pass) invariantFail++;
  console.log(`  ${pass ? "✓" : "✗"} ${name} — observed: ${observed}`);
};

console.log("\n=== marketplace a11y invariants ===");
{
  // (1)–(4): default context @1440
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(mpUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  // (1) exactly one <h1>
  const h1Count = await page.$$eval("h1", (els) => els.length);
  rec("(1) exactly one <h1>", h1Count === 1, `${h1Count} h1`);

  // (2) aside.rail appears before <main> in source order
  const asideBeforeMain = await page.evaluate(() => {
    const aside = document.querySelector("aside.rail");
    const main = document.querySelector("main");
    if (!aside || !main) return null;
    return (aside.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  rec(
    "(2) aside.rail before <main> in source order",
    asideBeforeMain === true,
    asideBeforeMain === null ? "aside.rail or main missing" : `asideBeforeMain=${asideBeforeMain}`
  );

  // (3) spine scrollspy yields exactly one aria-current after scrolling a section in
  await page.evaluate(() => {
    const el = document.querySelector("#s-outcomes");
    if (el) el.scrollIntoView();
  });
  await page.waitForTimeout(600);
  const currentCount = await page.$$eval('.spinenav a[aria-current="true"]', (els) => els.length);
  rec("(3) scrollspy sets exactly one aria-current", currentCount === 1, `${currentCount} aria-current="true"`);

  // (4) mobile bar is role="region" and NOT aria-hidden
  const mb = await page.evaluate(() => {
    const el = document.querySelector(".mobilebar");
    if (!el) return null;
    return { role: el.getAttribute("role"), ariaHidden: el.getAttribute("aria-hidden") };
  });
  rec(
    '(4) mobile bar role="region" and not aria-hidden',
    mb !== null && mb.role === "region" && mb.ariaHidden == null,
    mb === null ? ".mobilebar missing" : `role=${JSON.stringify(mb.role)} aria-hidden=${JSON.stringify(mb.ariaHidden)}`
  );

  await ctx.close();
}

{
  // (5) reduced-motion: count-up shows final values AND .dcol.shipped .wipe => display:none
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(mpUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const nums = await page.$$eval(".ocard .onum", (els) => els.map((e) => e.textContent.trim()));
  // final values expected on the outcome cards: +37%, +15%, 6+
  const finalShown = nums.includes("+37%") && nums.includes("+15%") && nums.includes("6+");
  const wipeDisplay = await page.$eval(".dcol.shipped .wipe", (e) => getComputedStyle(e).display);
  rec(
    "(5) reduced-motion: count-up final + .dcol.shipped .wipe display:none",
    finalShown && wipeDisplay === "none",
    `onum=${JSON.stringify(nums)} wipeDisplay=${wipeDisplay}`
  );

  await ctx.close();
}

await browser.close();

console.log("\n============================================");
let axeStatus;
if (worst >= 2) {
  axeStatus = "FAIL — serious/critical axe violations present";
} else if (worst === 1) {
  axeStatus = "PASS (gate) — 0 serious/critical; minor/moderate noted above";
} else {
  axeStatus = "PASS — 0 axe violations across all pages at 1440 + 375";
}
console.log("AXE:        " + axeStatus);
console.log(
  `INVARIANTS: ${invariantFail === 0 ? "PASS" : "FAIL"} — ${inv.length - invariantFail}/${inv.length} marketplace invariants hold`
);
if (invariantFail > 0) {
  inv.filter((i) => !i.pass).forEach((i) => console.log(`  - ${i.name} (observed: ${i.observed})`));
}

if (worst >= 2 || invariantFail > 0) {
  process.exit(1);
}
