# annaneiman.design

Personal portfolio and case-study site for **Anna Neiman**, Senior Product Designer
(product UI, component systems, and the accessible front-end that ships them).

**Live:** https://annaneiman.github.io/annaneiman-portfolio/ (custom domain `annaneiman.design` to follow)

## Stack

Intentionally a **zero-dependency static site** — hand-written semantic HTML, a
token-driven CSS system, and a small amount of vanilla JS for progressive
enhancement (scroll-spy, count-ups, reveal animations). No framework, no build
step: the site runs straight from the files.

```
.
├── index.html            # homepage (hero, work, about, contact)
├── marketplace.html      # case study — Spectrum App Store (0→1 streaming marketplace)
├── case-2…5.html         # additional case studies
├── assets/
│   ├── styles.css        # canonical design tokens + base (single source of truth)
│   ├── index.css         # homepage components
│   └── case-study.css    # case-study components
├── resume.pdf
└── .agents/verify/       # dev-only verification harness (not shipped)
```

## Design-system notes

- **Tokens are the single source of truth.** All color, type, spacing (8px scale),
  radius, and shadow live in `assets/styles.css` `:root` and are referenced
  everywhere else — no hard-coded values.
- **Page-scoped overrides.** Case-study visual treatments are scoped behind a
  `.mp` body class so shared stylesheets can be reused across pages without leak.
- **Accessibility is built in, not bolted on.** Semantic landmarks, one `h1` per
  page, visible focus states (never removed), `prefers-reduced-motion` honored,
  AA-contrast color pairings, and ARIA only where semantics fall short.

## Local development

No build required — open `index.html` in a browser, or serve statically:

```bash
npx serve .
# or: python3 -m http.server
```

## Verification harness

Checks under `tests/` (Playwright + axe-core + stylelint +
html-validate + prettier). Not part of the shipped site.

```bash
cd tests
npm install
node run.mjs       # overflow, console errors, interactions at 5 breakpoints
node axe.mjs       # accessibility (WCAG 2.1 A/AA tags) — target: 0 violations
node links.mjs     # link integrity
```

## Syncing updates from the workspace

Day-to-day edits happen in the shared `sidecar` workspace (where project context
and collaboration live). This repo is the clean, canonical home for the site.
To bring the latest site changes over:

```bash
./scripts/sync-portfolio.sh
```

The script compares by *prettier-normalized content* (so formatting never counts
as a change), previews exactly what differs, waits for confirmation, formats to
this repo's standard, runs the accessibility gate (`axe` — must be 0 violations),
commits locally, and — once a GitHub remote is configured — offers to push.
One-way only: sidecar → this repo.

## License

© Anna Neiman. All rights reserved.
