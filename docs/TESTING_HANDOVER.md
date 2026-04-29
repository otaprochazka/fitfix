# FitFix testing handover

> **Status (2026-04-28):** This document is the **manual QA smoke
> checklist** for the unified-editor PR. For automated tests (vitest,
> Playwright, CI gates, dual-target guard) see
> [TESTING_PLAN.md](TESTING_PLAN.md) — that's the source of truth.
> Sections below are still ~80 % usable as a human-driven walkthrough,
> but a few have drifted: see the "Why this is partly stale" table at
> the top of `TESTING_PLAN.md` before treating any step as a regression.

The unified-editor redesign (Phases 1–15 + 17) added a lot of moving
parts in one PR. This document is the test plan for the next agent or
human to verify the work before we ship to `main`.

## TL;DR — what changed

Before: three single-purpose tiles (Merge / Clean / GPX) on the home
page; FIT only.

After: a **unified editor** at `/editor` (single-file flow) with a
suggestion advisor, ten detector / action plugins, multi-format I/O
(FIT + TCX read; FIT + GPX + TCX write), undo/redo, a read-only
data-track waveform, and the original three legacy tiles still
accessible as a fallback for `.fit` files only.

Locale strings updated for English and Czech. The Garmin SDK is **not**
bundled — the parser is hand-written.

## Setup

```bash
cd /home/ota/repos/fitfix
npm install   # if you haven't already (legacy-peer-deps is in .npmrc)
npm run dev   # vite dev server on http://localhost:5173
```

Sanity:
- `npx tsc --noEmit` — must pass with zero errors.
- `npm run build` — must complete (one pre-existing chunk-size warning
  is acceptable; everything else must be clean).

## Test inputs you'll need

You don't have any committed in the repo (privacy). Source from:

1. **Your own Garmin / Wahoo / Coros / Polar `.fit` files**. Best for
   round-trip realism. A dual-stop ride / run shows merge value, a
   driven-home-after-hike shows trim, etc.
2. **A short Zwift `.fit`** (no GPS) — covers the indoor one-click.
3. **A `.tcx` from Polar Flow or older Garmin** — covers TCX import.
4. **A multi-lap `.fit`** (intervals, lap-press during ride) — covers
   lap aggregate recompute.
5. If you don't have one: GoldenCheetah ships sample files in its repo
   under `examples/` — those are public-domain test fixtures.

Drop one file at a time for the editor. Drop two or more `.fit` files
for the legacy merge path.

## What to verify

Each phase below has its own checklist. Mark anything that fails and
file it in `docs/TESTING_RESULTS.md` (create if missing).

### Foundation

- [ ] Drop a `.fit` from the home page → "Open in Editor" panel
      appears with the brand teal accent.
- [ ] Click "Open in Editor" → editor view loads, summary card shows
      reasonable values (points, distance, duration, ascent, descent,
      indoor flag).
- [ ] Map shows the track with green start / red end markers.
- [ ] Click ↶ (undo) and ↷ (redo) — disabled when there's nothing to
      undo / redo. After applying an edit, undo restores the previous
      bytes; redo replays.
- [ ] Drop a `.tcx` → goes straight to the editor. Legacy three tiles
      stay hidden when any non-FIT file is loaded.
- [ ] Drop a corrupt / non-FIT / non-TCX file → red error in the
      editor; app does not crash.

### Phase 4 — Elevation

- [ ] Activity that starts and ends at the same place but reports
      non-zero net elevation: advisor card "Elevation totals don't
      match" appears, body cites the delta in metres. Confidence dot:
      green for >100 m, amber for 30–100 m, grey for 20–30 m.
- [ ] Apply "Force net = 0" — `total_ascent − total_descent` becomes
      ~0 in the summary. Map track unchanged (only altitudes shifted).
- [ ] Open "More tools → Fix elevation". Pick "Smooth (rolling
      median)", scrub the window slider 3 → 15. Apply → ascent /
      descent decrease (less noise).
- [ ] An indoor session with monotone altitude drift triggers the
      "Stationary climb detected" card.

### Phase 5 — Trim

- [ ] Activity with the first 5 minutes recorded while driving to the
      trailhead → "First N min looks like driving — trim?" card.
      Apply → records before that timestamp removed; total distance
      and elapsed time drop accordingly.
- [ ] Same for end-of-activity drive home.
- [ ] Manual "Trim activity" panel: set "from start" = 2, "from end"
      = 3, summary line updates live, Apply trims correctly.
- [ ] Indoor activity does NOT auto-suggest trim (detector is
      gated on outdoor sport types).

### Phase 6 — Spikes

- [ ] HR-spike file: card "HR spikes detected" with count. Apply →
      spike values replaced by local median; max HR in summary drops.
- [ ] Manual panel: toggle each stream, scrub threshold (2σ–8σ) and
      window (5–30) sliders. Live preview updates the spike count.
      Apply with all three streams enabled, undo, replay — bytes
      identical (deterministic).

### Phase 7 — Strip + indoor one-click

- [ ] A Zwift / treadmill activity (no GPS, sport = run/cycling): card
      "Looks like an indoor activity flagged as outdoor". Apply →
      lat/lon become null in every record (verify in editor's data
      track or by re-uploading to Strava — sport flagging should be
      gone).
- [ ] Manual "Strip data streams" panel: enable HR + power, Apply →
      both streams gone in the data-track view.

### Phase 8 — Privacy zones

- [ ] Open "More tools → Privacy zones" with no zones saved → empty
      state.
- [ ] Add a zone: label "Home", click "Use start point", radius 200 m,
      Save → zone appears in the list.
- [ ] Reload the page (zones are persisted to localStorage). The zone
      survives.
- [ ] Apply now → records inside the zone have lat/lon nulled. Total
      distance recomputed lower.
- [ ] If start/end is inside a saved zone, the advisor card fires
      automatically.

### Phase 9 — Phantom loops

- [ ] You'll need an activity with on-the-move GPS glitches (the
      Forerunner-265 24h-race style). If you don't have one: skip and
      flag as "no test fixture available — manual smoke only".
- [ ] On a clean activity (parkrun / track session intentionally
      looping the same spot): detector should NOT fire (window cap +
      reversal-count guard).

### Phase 10 — Time-shift

- [ ] Manually edit a `.fit` (via hex editor) to shift `file_id.time_created`
      to next year, OR find any old activity → "Activity timestamp is
      in the future" / "old upload" advisor card fires.
- [ ] Manual panel: set days = 1, hours = 0, summary previews "from
      X to X+1d". Apply → all timestamps shifted; sanity check by
      re-importing the output and reading the summary.

### Phase 11 — Split

- [ ] Open "More tools → Split activity". Slider scrubs through time;
      Before / After counts update live.
- [ ] Apply → second half downloads immediately; in-memory activity
      becomes the first half (summary updates).
- [ ] Two filename inputs are honoured (rename them, apply, second
      file downloads under the new name).
- [ ] Slide all the way to the start / end → Apply disabled with red
      message.

### Phase 12 — Data track waveform

- [ ] Open "More tools → Data track". All non-empty channels appear as
      stacked canvas lanes (speed, elevation, HR, cadence, power,
      temperature).
- [ ] Drag the zoom range handles → lanes redraw cleanly. At full
      zoom: envelope mode (min/max bands). At 1-minute zoom: actual
      polylines.
- [ ] Hover → cursor and tooltip show channel values at that
      timestamp.
- [ ] Indoor activity (no speed at the GPS-derived rate) just hides
      that lane, doesn't render an empty band.

### Phase 13 / 15 — TCX I/O

- [ ] Drop a Polar Flow `.tcx` → editor loads. Summary shows distance,
      duration, ascent, descent, indoor flag.
- [ ] Map shows the track (assuming the TCX has positions).
- [ ] Export panel: TCX-source activity shows "Download .tcx" only;
      no FIT or GPX buttons (we don't synthesise FIT from TCX in v1).
- [ ] FIT-source activity: Export panel shows FIT, GPX, TCX. Each
      downloads a non-empty file. Re-import the GPX into Strava /
      Komoot → renders correctly. Re-import the TCX into Polar Flow
      → renders correctly.

### Phase 14 — Multi-vendor branding

- [ ] Home headline reads "Fix, merge & convert any FIT activity"
      (English) / "Oprav, sluč & převeď libovolný FIT" (Czech).
- [ ] README mentions Wahoo, Coros, Polar, Bryton, Hammerhead, Stages,
      Zwift, Suunto.
- [ ] No "Garmin only" copy left in active surfaces. ("Garmin
      Connect", ".FIT", and the Garmin SDK link in README are all OK
      — descriptive use.)

### Legacy fallback (still must work)

- [ ] Drop two `.fit` files → home page legacy panels appear. Click
      Merge → original MergeView UX still works.
- [ ] Drop one `.fit` → both "Open in Editor" and the three legacy
      panels are visible. The user can pick.
- [ ] Click Clean (legacy) → cluster map + per-cluster modes still
      work.
- [ ] Click GPX (legacy) → one-click FIT → GPX still works.

### Cross-cutting

- [ ] Apply 3 different edits in sequence (e.g. trim → spike fix →
      privacy clip). Undo all 3 — original bytes restored. Redo all 3
      — final state matches first run (deterministic).
- [ ] Apply an edit, then drop a different file — store clears; old
      activity's history is gone.
- [ ] Switch language en ↔ cs (header dropdown). All editor strings
      translate; advisor cards re-render in the new language.
- [ ] Browser refresh while in the editor — the activity is gone
      (no persistence by design); home page reappears.
- [ ] PWA: install as PWA, go offline, drop a file → still works.

## Known scope gaps (do NOT file as bugs)

- **Phase 16 (per-feature SEO landing pages + `/vs` comparison)** is
  not in this PR. Routing is still state-based; URLs do not change.
- The unified editor takes one file at a time. Merge of two-or-more
  files still routes through legacy `MergeView`. Folding merge into
  the editor is a follow-up.
- TCX / GPX export is **lossy** (TCX has no temperature, no
  multi-lap; GPX drops sport-specific data). Documented per exporter.
- "Recompute elevation from GPS only" currently runs the same rolling
  median as the smooth mode. DEM-based recompute is opt-in v2.
- Apple Health full ZIP export and Suunto `.sml` are NOT supported.
  Only standard FIT + TCX 1.0 import in v1.

## Reporting

When something breaks:

1. Save the input file to a private location (NOT the repo — repo is
   public).
2. Note the exact action (which advisor card / which manual panel /
   which slider value).
3. Attach a screenshot if it's a visual issue.
4. Add a section to `docs/TESTING_RESULTS.md` with reproduction
   steps. Include browser + OS + locale.
5. For TypeScript or build regressions, paste the failing
   `npm run build` output.

If a detector fires on an activity it shouldn't, that's a tuning
issue, not a bug — log the threshold + activity profile so we can
calibrate.
