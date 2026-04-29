# FitFix testing plan

Status: 2026-04-28 — replaces the manual QA checklist in
[TESTING_HANDOVER.md](TESTING_HANDOVER.md) as the source of truth for
**automated** tests. The handover stays as a human-driven smoke pass;
this document is what we wire into CI.

## Ground truth (current state)

- **No test runner installed.** `package.json` ships only `dev / build /
  lint / preview`. There is no `test` script.
- Three ad-hoc scripts in `scripts/` already exercise the API surface
  from Node (and prove the core runs dual-target today):
  - `test-merge.ts` — two-FIT merge, parse-back, growth-ratio assertion
    (the LRU regression guard from AGENTS.md §5).
  - `test-samples.ts` — runs over `public/samples/*.fit`, hits the parse
    + detector path.
  - `bench-merge.ts` — perf snapshot.
  These become seed cases for the vitest suite — not the long-term home
  of regression coverage.
- **One committed FIT fixture**: `public/samples/garmin-edge-500-cycling.fit`
  (357 KB, public-domain Edge 500 export). We need 4–6 more (indoor /
  TCX / multi-lap / multi-vendor / known-bad). They live under
  `tests/fixtures/` outside the public folder so we don't ship them in
  the PWA bundle.
- **The plugin contract** (`src/lib/plugins/types.ts`) gives every phase
  a clean `Detector` + `Edit` boundary. Tests can plug in directly
  without React.

## Why TESTING_HANDOVER.md is partly stale

It was written during the unified-editor PR (Phases 1–15+17). Several
things have moved since:

| Handover section | Status today |
| --- | --- |
| Foundation (drop FIT/TCX, undo/redo, error path) | **valid** |
| Phases 4–13/15 (elevation, trim, spikes, strip, privacy, loops, time-shift, split, data track, TCX I/O) | **valid as a manual smoke pass**, but section names should be detector ids (`elevation`, `trim`, `spikes-hr`, …) — "Phase N" is a development artefact, not a user concept. |
| Phase 14 Multi-vendor branding | **valid**; cs/en strings bumped since — re-verify. |
| Legacy fallback (3-tile home) | **partial drift**: HomeView was redesigned in `42f7d3b` ("redesign back-and-forth"); tile copy + auto-open semantics changed. Re-check the current UI before treating any of those steps as regressions. |
| Cross-cutting (PWA offline, locale switch, refresh-clears-state) | **valid**. |
| "Phase 16 SEO landing pages" under scope gaps | **stale heading** — no Phase 16 anymore; URL routing is still state-based and now lives under the MCP backlog. |

The handover is ~80 % usable as a manual QA script; the table above is
enough — no need to rewrite it line by line.

Two memory-anchored UX rules also tighten what we test (and drop):
- **One Suggestion per detector run, not N per issue.** Each detector
  test asserts at most one card; per-occurrence tuning lives in the
  manual tool. (`feedback_jitter_summary_pattern.md`.)
- **Advisor cards never apply blind** — single "Open tool →" CTA. There
  is no Apply/Dismiss to test on the card itself; assertions move into
  the tool subpage. (`feedback_findings_open_tool.md`.)
- **Editor uses sub-page navigation** — manual tools are full-takeover
  subpages with persistent map. (`feedback_editor_subpage_nav.md`.)

## What we need (priority order)

### 1. Test runner — vitest

- Add `vitest`, `@vitest/ui`, `@vitest/coverage-v8`, `jsdom`.
- One `vitest.config.ts` with two projects:
  - **node** — `src/lib/**` (default, for the API surface).
  - **jsdom** — the few React hooks we test (`usePreview`, store).
- Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`,
  `"test:ui": "vitest --ui"`, `"test:coverage": "vitest run --coverage"`.

### 2. API tests — the priority

This is the MCP-server-ready surface. Layout: **`tests/api/`**, separate
from the source tree so it's obvious to a later `packages/core/`
extraction.

| File | What it asserts |
| --- | --- |
| `fit-parser.test.ts` | `walkMessages` over each fixture: expected message-num distribution, every record has a `timestamp`, CRC validates, no thrown errors. |
| `fit-roundtrip.test.ts` | Parse → encode → parse — bytes bit-identical except for `file_id.time_created` + `serial_number` (drift expected per AGENTS.md §4.6). |
| `fit-rewrite.test.ts` | `dropRecords / trimToRange / splitAt` — point counts match expected, byte size shrinks, file still parses, CRCs OK. |
| `merge.test.ts` | `mergeFit(a, b)` output parses, growth ratio ≤ 1.05× (the LRU guard), session/activity counts agree. Plus 3-file and 4-file inputs. |
| `cleanJitter.test.ts` | On a fixture with seeded clusters: cleaned output has zero clusters when re-detected. |
| `detectors/<id>.test.ts` | One file per detector (`elevation`, `trim`, `spikes-hr`, `spikes-power`, `loops`, `privacy`, `timeshift`, `strip`). Each: load N fixtures, assert `run(activity)` returns the expected suggestion ids + confidences. Snapshot body strings in **both** locales. **One Suggestion max per detector run.** |
| `edits/<kind>.test.ts` | One file per edit kind. Each: apply on fixture, assert determinism (run twice → identical bytes), idempotence where defined, summary deltas (e.g. `forceNetZero` → ascent − descent ≈ 0). |
| `fitToGpx.test.ts` | Output validates against GPX 1.1 XSD, `trkpt` count == record count with valid lat/lon, TrackPointExtension v2 fields present when source had them. |
| `tcx-import.test.ts` | Parse Polar Flow + Garmin Connect TCX fixtures into `NormalizedActivity`; meta + first/last point match expected. |
| `tcx-export.test.ts` | FIT → TCX round-trip, schema-valid, lossy fields documented. |
| `dual-target.test.ts` | **Static guard.** Walk every file under `src/lib/` (excluding `persist.ts`, `download.ts`, `usePreview.ts`, `*.tsx`, `edits/*/Panel.tsx`) and fail if it imports `react`, `react-i18next`, or references `window / document / localStorage / URL.createObjectURL / FileReader`. Protects the MCP-extraction promise from day one. |

**Fixture sourcing:**
- 6 hand-picked FITs covering: outdoor cycling, outdoor running, indoor
  Zwift, multi-lap intervals, suspicious-trim ride, known-jitter
  parkrun.
- 2 TCX (Polar Flow run, old Edge cycling).
- 1 GPX for round-trip re-import (we don't import GPX yet, but the
  exporter's output should round-trip in our own future GPX path).
- Stored in `tests/fixtures/` with a README listing source + license.
  GoldenCheetah's `examples/` is public-domain and a good well of
  cross-vendor files.
- Where we can't legally redistribute: a `tests/fixtures/synth.ts`
  builder that emits valid FIT bytes from a declarative shape — useful
  for edge cases (force a 30-def file to exercise the LRU, force a
  big-endian re-encode like Garmin Connect produces).

### 3. UI tests — Playwright

Layout: `tests/e2e/`. `playwright.config.ts` runs against `npm run
preview` (stable build), **not** the dev server — HMR makes specs flaky.

| Spec | Asserts |
| --- | --- |
| `editor-load.spec.ts` | Drop FIT → editor renders, summary card values match the **API** result for the same fixture (cross-checks parser + UI). |
| `editor-tcx.spec.ts` | Drop TCX → editor loads; legacy 3-tile home is hidden. |
| `editor-error.spec.ts` | Drop random bytes → red error, no crash, app navigable back home. |
| `undo-redo.spec.ts` | Apply edit → undo restores prior summary → redo replays. |
| `detector-cards.spec.ts` | Per-detector smoke: load the detector's fixture, assert the suggestion card title appears, click "Open tool" → its subpage mounts (validates the no-Apply-on-card rule + sub-page navigation rule). |
| `manual-tool.spec.ts` | Open each manual tool subpage, assert map + summary persist. |
| `download.spec.ts` | Apply an edit, click each export button (FIT / GPX / TCX), assert downloads complete with non-zero size. Use Playwright's `download` event. |
| `locale-switch.spec.ts` | Toggle en ↔ cs in header, assert advisor card titles re-render translated. |
| `pwa-offline.spec.ts` | After load, go offline (`context.setOffline(true)`), drop a file, assert editor still works. Optional in CI; flake-prone. |
| `legacy-fallback.spec.ts` | Drop two FITs → legacy MergeView; one FIT → both Editor and legacy panels visible. |

**Visual regression** (low effort): one Playwright snapshot per major
view (home, editor empty, editor with-detection, manual-tool subpage).
Threshold 0.1 %. Update by hand on intentional design changes.

### 4. Quality gates / CI

- GitHub Actions: `lint`, `tsc --noEmit`, `vitest run`, `playwright test
  --reporter=github`. Cache `node_modules` and the Playwright browser
  binary.
- PR can't merge unless all four pass. Coverage report (`vitest
  --coverage`) uploaded as artifact; no hard gate yet — we want the
  suite to settle first.
- Bundle-size budget (140 KB gzipped per AGENTS.md) becomes a CI assert:
  fail if `dist/assets/*.js` total exceeds 200 KB gzipped. Cheap and
  catches accidental regressions.

### 5. Other things worth doing for a quality tool

Not strictly tests but they belong in the same sweep:

- **Type safety hardening.** `strict` is already on via
  `tsconfig.app.json`. Add `tsconfig.scripts.json` so the `scripts/`
  folder stays typed once we wire its content into vitest.
- **Lint as error in CI** (currently warning-only). Promote
  `unused-vars`, `no-explicit-any`, and `react-hooks/exhaustive-deps`
  to errors — the codebase already follows them.
- **A11y smoke** via Playwright + axe-core: one assertion per major
  view, zero serious/critical findings. Advisor cards + manual-tool
  subpages are the risky bits.
- **Performance budget** in `tests/api/perf.test.ts`:
  - parse the 357 KB Edge-500 fixture < 50 ms,
  - `getFitStats` < 25 ms,
  - `mergeFit` on 2× 1 MB inputs < 250 ms.
  Run vitest with a fixed budget; mark `.skip` in CI by default, run
  weekly via `/schedule` since shared runners flake on absolute time.
- **Sample-file fuzz**: pull every public-domain FIT we can (GoldenCheetah
  `examples/`, fit-sdk samples) and just run `walkMessages +
  parseActivity` over them in a single `it.each` test. Catches walker
  breakage on unfamiliar manufacturer ids without enumerating them.
- **MCP-readiness check** = the dual-target guard above + a Node-only
  smoke that imports each `src/lib/` module under `tsx` and asserts
  nothing browser-only is in the import graph.

## Phasing

1. ✅ **(done)** vitest + jsdom + dual-target guard, parser + rewrite +
   merge LRU regression tests on the Edge 500 fixture.
2. ✅ **(done)** cleanJitter / fitToGpx / fitStats + per-detector smoke
   (loops/spikes/trim/elevation) + per-edit determinism
   (timeshift/spikes/privacy). Plus 3 sourced fixtures
   (indoor-zwift, multi-lap-intervals, garmin-tcx-export) with
   positive-case tests; TCX import runs in the jsdom project because
   `parseTcxActivity` uses browser DOMParser (TODO before MCP
   extraction — track in MCP_SERVER_BACKLOG.md Phase 0).
3. ✅ **(done)** Playwright e2e: editor-load, editor-error (×2),
   download. Runs against `vite preview` on 127.0.0.1:4173.
4. ✅ **(done)** bundle-size gate (200 KB gzipped budget, currently 189
   KB) + GitHub Actions workflow `.github/workflows/ci.yml`.

**Where we landed: 17 vitest files, 65 unit/integration tests; 4
Playwright specs; CI green locally.** Rule going forward: every new
detector / edit lands with its own `tests/api/<name>.test.ts` **and**
`tests/e2e/<name>.spec.ts` in the same PR, or it doesn't merge.

## Still open (post-phase-4 backlog)

- **Positive cases for detectors** that need known-bad fixtures:
  `forerunner-jitter.fit` (phantom loops), `parkrun-clean.fit` (loops
  negative), `suspicious-trim.fit`, `polar-flow-run.tcx`. None
  publicly downloadable; the unblock is `tests/fixtures/synth.ts` — a
  declarative builder that emits valid FIT bytes for edge cases (see
  `tests/fixtures/README.md`).
- **DOMParser → @xmldom/xmldom** in `parseTcxActivity` so the TCX
  import path runs in pure Node (currently excluded from
  `dual-target.test.ts` with a comment pointing at MCP_SERVER_BACKLOG
  Phase 0). Once swapped, move the test from `tests/dom/` to
  `tests/api/`.
- **a11y smoke** via Playwright + axe-core on the editor-load spec.
- **Performance budget** in `tests/api/perf.test.ts` running weekly
  via `/schedule` (CI is too noisy for absolute-time asserts).
- **Visual regression snapshots** — one Playwright snapshot per major
  view, threshold 0.1 %.
- **GPX import + round-trip** once we land it, exporter output should
  re-import in the future GPX path.

## Out of scope for this plan

- Migrating legacy `MergeView / CleanView / GpxView` under the editor —
  separate refactor, currently still useful for 2+ FIT input.
- Real device round-trip (re-uploading test outputs to Garmin Connect /
  Strava). That stays manual smoke.
- DEM-based elevation correction — no implementation yet, no tests yet.
- `packages/core/` extraction itself. The dual-target guard makes the
  extraction safe **whenever** we do it; the guard does not depend on
  the move happening first.
