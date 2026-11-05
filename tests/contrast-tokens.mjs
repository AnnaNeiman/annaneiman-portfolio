// Dev-only: token-level contrast math check for the marketplace polish accent/surface pairings.
// Recomputes each pairing from the design's hex tokens using the WCAG 2.1 relative-luminance +
// contrast-ratio formula (identical math to contrast.mjs, which samples *rendered* pixels; this
// file instead asserts the *declared token* pairings C1–C6 from design.md §1). Not shipped.
//
// Exits non-zero if any required pairing (C1–C6) fails its AA threshold.
// The documented EXCLUSION (accent on --headline-brown, ~2.77:1 < 3) is asserted to be a non-use:
// it must stay below 3:1, and the script treats staying-below as correct (EXCLUDED-OK), not a pass.

// --- WCAG math (same formula as contrast.mjs) ---
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function lum([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(aHex, bHex) {
  const L1 = lum(hexToRgb(aHex));
  const L2 = lum(hexToRgb(bHex));
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

// --- tokens (design.md §1) ---
const T = {
  accent: '#a8341a', // --accent
  white: '#ffffff', // --accent-ink / --surface
  bg: '#f6f3ed', // --bg
  surface: '#ffffff', // --surface
  surfaceDeep: '#efe9e0', // --surface-deep
  ink: '#313131', // --ink
  flint: '#6b6860', // --flint
  headlineBrown: '#2e1a0f', // --headline-brown (exclusion target)
};

// --- required pairings C1–C6 (foreground, background, threshold, expected-from-design) ---
const required = [
  { id: 'C1', fg: T.accent, bg: T.bg, label: 'accent #a8341a on --bg #f6f3ed', threshold: 4.5, boundary: 3, expected: 5.98 },
  { id: 'C2', fg: T.accent, bg: T.surface, label: 'accent #a8341a on --surface #ffffff', threshold: 4.5, expected: 6.62 },
  { id: 'C3', fg: T.accent, bg: T.surfaceDeep, label: 'accent #a8341a on --surface-deep #efe9e0', threshold: 4.5, expected: 5.49 },
  { id: 'C4', fg: T.white, bg: T.accent, label: 'white #ffffff on accent #a8341a', threshold: 4.5, expected: 6.62 },
  { id: 'C5', fg: T.ink, bg: T.surfaceDeep, label: 'ink #313131 on --surface-deep #efe9e0', threshold: 4.5, expected: 10.78 },
  { id: 'C6', fg: T.flint, bg: T.surfaceDeep, label: 'flint #6b6860 on --surface-deep #efe9e0', threshold: 4.5, expected: 4.61 },
];

// --- documented exclusion: accent on --headline-brown must stay BELOW 3:1 (non-use) ---
const exclusion = {
  id: 'X1',
  fg: T.accent,
  bg: T.headlineBrown,
  label: 'accent #a8341a on --headline-brown #2e1a0f',
  mustBeBelow: 3,
  // design.md §1 cites ~2.77:1; the WCAG 2.1 formula (exponent 2.4, same as contrast.mjs)
  // actually yields ~2.50:1 for this very-dark pairing. Either way it is well below 3:1, so the
  // documented non-use holds. We keep the real computed value rather than the design's 2.77 note.
  expected: 2.5,
};

let failed = 0;

console.log('=== token contrast — required AA pairings (C1–C6) ===');
for (const p of required) {
  const r = ratio(p.fg, p.bg);
  const pass = r >= p.threshold;
  if (!pass) failed++;
  const boundaryNote = p.boundary ? `  [boundary ≥${p.boundary}: ${r >= p.boundary ? 'ok' : 'FAIL'}]` : '';
  console.log(
    `${p.id}  ${p.label}` +
      `\n     computed ${r.toFixed(2)}:1  (design ~${p.expected.toFixed(2)}:1)  ` +
      `vs AA ${p.threshold} → ${pass ? 'PASS' : 'FAIL'}${boundaryNote}`
  );
}

console.log('\n=== documented exclusion (must NOT be used) ===');
{
  const r = ratio(exclusion.fg, exclusion.bg);
  const excludedOk = r < exclusion.mustBeBelow;
  if (!excludedOk) failed++; // if it ever rose to/above 3:1 the documented rationale would be wrong
  console.log(
    `${exclusion.id}  ${exclusion.label}` +
      `\n     computed ${r.toFixed(2)}:1  (design ~${exclusion.expected.toFixed(2)}:1)  ` +
      `below ${exclusion.mustBeBelow}:1 → ${excludedOk ? 'EXCLUDED-OK (documented non-use, must not be used)' : 'UNEXPECTED (now ≥3:1 — revisit exclusion)'}`
  );
}

console.log(`\n${failed === 0 ? 'ALL CHECKS OK' : failed + ' CHECK(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
