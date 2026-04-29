# Manual QA report — 2026-04-29

Dev server: `http://localhost:5173`. Test file: `tests/fixtures/edge810-cycling-vector.fit` (the same kind of file fed via the upload input on the home page → editor view). Each finding is reproducible cold.

## Critical bugs

### 1. Breadcrumb "filename" crumb does not exit the tool — the tool stays rendered

**Repro**
1. Upload a `.fit` file → editor overview opens.
2. Click any advisor finding (e.g. *GPS jitter at 1 stop(s)*) → tool subpage opens. Breadcrumb is `🏠 Home / garmin-edge-500-cycling.fit / 📍 GPS drifted while you stood still`.
3. Click `garmin-edge-500-cycling.fit` in the breadcrumb.

**Actual**
- Breadcrumb collapses to `🏠 Home / garmin-edge-500-cycling.fit` (filename is no longer a button — it becomes a non-clickable `<span>`).
- The tool subpage body is **still mounted and visible**: "What 'GPS jitter' does", the map with the cluster, "Apply selected fixes" — all still on screen.
- Editor overview ("What we found", findings list) is **not** visible.

**Expected** — clicking the filename crumb should return to the editor overview (advisor findings list, no tool body).

**Root cause** — `App.tsx`:
- `onClearTool={() => setTool(null)}` clears only the *crumb* state in App.tsx.
- `EditorView` owns its own `mode` state (`'overview' | 'tool'`) and the parent has no way to push it back to `'overview'`.
- Result: the parent thinks the tool is closed (so the third crumb disappears, and `detailIsClickable` flips off, turning the filename into a span), while `EditorView` still renders `mode === 'tool'`.

**Suggested fix** — make tool state controlled by the parent (lift `mode` to App, or pass a `clearToolSignal`/imperative ref into EditorView), or have `EditorView` listen to the parent's `tool` prop becoming `null` and reset its mode in a `useEffect`.

### 2. "Activity summary" cannot be folded inside any tool subpage

**Repro**
1. Open any tool subpage where a preview is published (GPS jitter, HR spikes, Speed spikes — all do).
2. Click the ▶ "Activity summary" header.

**Actual** — `aria-expanded` stays `"true"` no matter how many times you click. The card never collapses. (Verified programmatically: 3 successive clicks all report `true`.)

**Root cause** — `EditorView.tsx:684`:
```ts
const showStats = expanded || hasDiff || !!secondary
```
In a tool view, `previewActivity` produces stats with `previewValue`, so `hasDiff = true` and `showStats` is forced open regardless of the user's `expanded` toggle. The chevron flips `expanded` (you can see the rotation animate briefly) but the body doesn't react.

**Suggested fix** — auto-open on first transition into preview (`useEffect` that sets `expanded = true` once when `hasDiff` flips from false to true), but then let `showStats = expanded` so the user can collapse it.

### 3. "What I'm editing" and "what its impact is" are 600+ px apart in tool view

**Repro** — Open GPS jitter tool with the cycling sample. Window 1400×900, default zoom.

**Measured layout** (document Y of each section's top):
| Section                               | Y top |
| ------------------------------------- | ----- |
| Activity summary header (impact preview) | 212  |
| Values over time                      | 511   |
| "What 'GPS jitter' does" explainer    | 593   |
| Map (with cluster #1 — what is being edited) | 798 |
| Right-side "Will remove …" impact box | 811   |
| "Apply selected fixes" CTA            | 1179  |

The map is **1161 px tall × 864 px wide** (forced square aspect). Activity summary is at the top, the map starts at 798 px — they cannot be in the viewport together at any practical desktop window size. The `1161 × 864` map dwarfs the right-side controls panel and its empty whitespace is the dominant visual.

The user's complaint "I see what I am editing and its impact somewhere else" is exactly this: the *global* impact (Activity summary delta with `PREVIEW` badge) and the *local* edit (cluster on the map + per-cluster choice) are vertically separated, never co-visible. The "What 'GPS jitter' does" explainer pushes them further apart and is also redundant with the home-page how-it-works section.

**Suggested fix** — sticky/2-column tool layout: left = map (constrained to viewport height, not square-content), right = sticky control column showing Activity summary delta on top, per-cluster controls in the middle, Apply at the bottom. Hide or collapse the explainer by default after first use.

## High-priority gaps

### 4. The middle breadcrumb level is just the filename — should read as "Editor"

`App.tsx` builds `detailLabel = view.file.name`. There is no `Editor` prefix or wrapper. The user expected `Editor (garmin-edge-500-cycling.fit)` so the breadcrumb communicates *the section* (Editor / Merge / Clean / GPX), and the filename is the disambiguator for that section.

**Suggested fix** — `detailLabel` for `view.kind === 'editor'` should be `Editor (${view.file.name})` (truncate the filename middle, full name in `title`), or render `Editor` as the second crumb and the filename as a subtitle.

### 5. No way to switch tools without going through the editor overview

Inside the GPS jitter tool, the only siblings of the tool are *Activity summary*, *Values over time*, the explainer, the map, and the per-cluster panel. There is no list of *other* findings (HR spikes, Speed spikes, …) on the page. To pick another tool you must:
1. Use the broken breadcrumb (bug #1) — doesn't work.
2. Click "🏠 Home" — destroys the working file.
3. Click the back arrow — same as Home.

There is no "back to advisor list" action that survives. This is the practical consequence of bug #1, but even without that bug the lack of in-tool tool-switching is a UX gap on a flow where ~4 tools are typically queued.

### 6. Map oversized in tool view

The Leaflet container in the GPS jitter tool measures **1161 × 864 px** (~1 MP of map) for a workflow whose interaction surface is one numbered marker. Most of that map is outside any cluster. A `min(viewport - controls, 600 px)` height with a "fit clusters" auto-zoom would be enough.

## Smaller observations

- **Vitest didn't catch any of #1–#3** because the existing tests stub state and don't render the full App→EditorView wiring. Specifically the integration that needs coverage:
  - `App.onClearTool` actually closes the tool body in `EditorView` (regression test for #1).
  - `Activity summary` chevron toggles `aria-expanded` and the stats grid in tool view (#2).
  - Layout test asserting Activity summary header and map first-cluster marker land within one viewport at 1280×800 (#3).
- **No console errors** during the flows tested.
- **`PREVIEW` badge** on Activity summary is good, but with the card frozen open (bug #2) it acts like a banner the user can't dismiss.

## Reproduction transcript

```
GET /                                   ✓ home renders, EN/CS toggle visible
upload edge810-cycling-vector.fit       ✓ → editor overview, breadcrumb "Home / <file>"
click "GPS jitter at 1 stop(s)" finding ✓ → tool subpage, breadcrumb adds "📍 GPS drifted…"
click filename crumb                    ✗ tool stays open, crumb collapses to Home/<filename-as-span>
click "Activity summary" header (×3)    ✗ aria-expanded stays "true" each time
measure layout                          ✗ Activity summary @212, map @798, apply @1179
```
