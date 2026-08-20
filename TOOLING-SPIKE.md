# Tooling spike results (fork-only, not proposed upstream)

Machine: M-series MacBook, Node 24. Branch: `spike/vitest` on top of the
moment-removal branch. No spec files were modified in any experiment.

## 1. Karma → Vitest (the headline)

Motivation: Karma has been officially deprecated upstream since April 2023.

Setup cost: ~120-line jasmine-compat shim (`vitest.jasmine-compat.mjs`) +
~50-line config (`vitest.spike.config.mjs`) mirroring webpack aliases,
DefinePlugin globals and raw-HTML template imports.

| Metric | Karma (master tooling) | Vitest spike |
|---|---|---|
| Full-suite wall time | ~7 min (incl. ~3 min webpack precompile) | 25 s (all 125 files attempted) |
| Time to first test | ~3 min | < 2 s |
| Single-file run | not supported | 2–4 s |
| Watch mode / IDE integration | none | built-in |

State after three config iterations (zero spec edits):
- 125/125 spec files load and execute
- 48/125 files fully green — 452/990 tests passing
- Remaining failures are concentrated in the shared `createOpenMct`
  harness patterns: `jasmine.clock()`, deprecated `done()` callbacks,
  jasmine's deep-equal `toContain`, and DOM/body fixtures.

Read: a full migration is a bounded compat-shim + harness workstream
(each fix unlocks dozens of files at once), not a rewrite of 975 specs.
Progression during the spike: 21 → 36 → 48 green files, one small config
change per step.

## 2. Type checking (aligned with upstream #6483 / #5781)

The repo already emits `dist/types/index.d.ts` from JSDoc for `src/api`
with `checkJs: false`. Flipping `checkJs: true` on that same scope surfaces
**1,444 type errors** — the measurable burn-down backlog behind #6483.

## 3. oxlint alongside ESLint

`lint:js` + `lint:vue` (ESLint): **10.4 s**. oxlint over the same tree:
**1.3 s (~8×)**. Modest because the ESLint setup is already fast here;
worth it only as a pre-commit fast path, not as a replacement.

## Conclusions

- The Vitest migration is the experiment with real substance: deprecated
  runner, order-of-magnitude feedback-loop win, and a demonstrably bounded
  migration path.
- Type checking has a maintainer-sanctioned home (#6483) and now a number.
- oxlint is a nice-to-have, not a pitch.
