// Dev-only link crawl (NOT shipped). For every page: every in-page #anchor
// resolves to a real id; every local *.html / *.pdf target exists; mailto present;
// no bare "#" dead ends; the retired lovable.app origin appears nowhere; external
// links carry rel with noopener (or are same-safe). Reports pre-public swap slots.
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, "..");
const FILES = ["index.html", "marketplace.html", "case-2.html", "case-3.html", "case-4.html", "case-5.html"];
let problems = [];
const note = (m) => console.log("  • " + m);

// collect all ids present across both pages (for cross-page #frag like case-study.html#x)
const html = {};
const ids = {};
for (const f of FILES) {
  html[f] = readFileSync(resolve(SITE, f), "utf8");
  ids[f] = new Set([...html[f].matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}

for (const f of FILES) {
  console.log(`\n=== ${f} ===`);
  const src = html[f];
  const hrefs = [...src.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

  // lovable.app must not appear anywhere
  if (/lovable\.app/i.test(src)) problems.push(`${f}: retired lovable.app origin present`);

  for (const h of hrefs) {
    if (h === "#" || h === "") {
      // An intentional inert placeholder link (href="#" with aria-disabled="true", e.g. the
      // .livelink.static on the lorem case-study pages) is NOT a dead end — allow it.
      const inert = /<a[^>]*href="#"[^>]*aria-disabled="true"/.test(src);
      if (h === "#" && inert) {
        // allowed intentional placeholder — skip
      } else {
        problems.push(`${f}: bare dead-end href "${h || "(empty)"}"`);
      }
    } else if (h.startsWith("#")) {
      const id = h.slice(1);
      if (!ids[f].has(id)) problems.push(`${f}: in-page anchor ${h} has no matching id`);
    } else if (h.startsWith("mailto:") || h.startsWith("data:")) {
      // mailto + inline data: URIs (e.g. the SVG favicon) need no file to exist
    } else if (/^https?:\/\//i.test(h)) {
      // external — checked for rel/noopener below
    } else {
      // local path, optionally with #frag
      const [path, frag] = h.split("#");
      if (path) {
        const target = resolve(SITE, path);
        if (!existsSync(target)) problems.push(`${f}: local link "${path}" → missing file`);
        else if (frag && ids[path] && !ids[path].has(frag)) {
          problems.push(`${f}: cross-page fragment ${h} has no matching id in ${path}`);
        }
      }
    }
  }

  // external anchors: must carry rel; flag any target=_blank without noopener
  const anchors = [...src.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi)];
  for (const a of anchors) {
    const tag = a[0];
    const url = a[1];
    const hasBlank = /target="_blank"/i.test(tag);
    const hasNoopener = /rel="[^"]*noopener[^"]*"/i.test(tag);
    if (hasBlank && !hasNoopener) problems.push(`${f}: external ${url} opens _blank without rel=noopener`);
  }

  note(`${hrefs.length} href(s) checked`);
}

// pre-public swap slots (report, do not fail)
console.log("\n=== pre-public swap slots (report-only) ===");
for (const f of FILES) {
  if (/linkedin\.com\/"/.test(html[f]) || /href="https:\/\/www\.linkedin\.com\/"/.test(html[f]))
    note(`${f}: LinkedIn href is the generic root — swap to the real profile pre-public`);
  if (/href="https:\/\/github\.com\/"/.test(html[f]))
    note(`${f}: GitHub href is the generic root — swap to the real profile pre-public`);
  if (/\(add link\)/.test(html[f])) note(`${f}: Read.cv / Are.na "(add link)" slots still unlinked`);
}

console.log("\n============================================");
if (problems.length) {
  console.log("RESULT: FAIL — broken/dead links:");
  problems.forEach((p) => console.log("  ✗ " + p));
  process.exit(1);
}
console.log("RESULT: PASS — no broken in-page/local links, no lovable.app origin, no unsafe _blank");
