> **Status:** lesson — investigation closed, hotfix shipped  
> **Audience:** future contributors hitting "merge is slow" symptoms, AI agents tempted to optimize app code first  
> **TL;DR:** the spike was dev-mode React + React DevTools serializing a 16k-element prop, not the merge algorithm. Benchmark in Node and reproduce in `npm run preview` before optimizing app code.

# Perf investigation: "100% CPU spike on merge" (April 2026)

Status: closed. Root cause was dev-mode React, not application code.

> ## Active hotfix in tree
>
> **`<StrictMode>` is currently disabled** in `src/main.tsx`. This is a
> deliberate, documented workaround — not an oversight. With the current
> activity shape (16k+ `Date` objects + multi-MB `Uint8Array` flowing
> through the prop tree) StrictMode's dev-time double-invoke pushed
> Firefox tabs into 30s+ commit phases and OOM on merge. Production
> builds were never affected. Re-enable StrictMode if/when `activity` is
> moved out of React state (see "What we considered and rejected" below)
> or if you specifically need its dev-time double-invoke checks for a
> refactor — preferably in `npm run preview`.

This doc exists so the next person who chases a "merge is hanging the browser"
report doesn't repeat the multi-hour rabbit hole. Read it first.

## TL;DR

- **In `npm run dev`, merging two real Garmin files (1.27 MB + 587 KB → 1.82 MB
  merged, ~16k records) hung the browser for 30+ seconds and eventually OOM'd
  the tab.**
- **In `npm run build && npm run preview`, the exact same merge takes 118 ms
  end-to-end.** No spike, no OOM.
- The application code is fine. The dev artefact comes from React's
  development build + `<StrictMode>` doubling renders/effects + the
  React DevTools extension serializing the activity prop tree on every
  commit. With ~16k `Date` objects and a 1.8 MB `Uint8Array` flowing
  through the prop tree, that combination is what eats CPU and memory.
- Real users who hit a production build (Vercel/CDN/etc.) do not see this.

## Numbers

Bench (`scripts/bench-merge.ts`, Node 24, the same two files):

| Operation | Time |
|---|---|
| `mergeFitMany` | 80 ms |
| `parseActivity` (post-merge) | 19 ms |
| `bytesToB64` (1.8 MB) | 9 ms |
| `detectLoops` | 5 ms |
| `detectSpikes` × 3 streams | 19 ms |
| `runTrimDetector` | 5 ms |
| `detectNetDelta` + `detectStationaryClimb` | <1 ms |
| `scanFitForClusters` (jitter) | 17 ms |
| **Sum of pure JS work** | **~155 ms** |

Browser, instrumented `[merge]` logs:

| Build | mergeFitMany | parseActivity | click→done |
|---|---|---|---|
| `npm run dev` | 246 ms | 236 ms | **never — OOM in `react-dom-client.development.js`** |
| `npm run preview` (prod) | 80 ms | 27 ms | **118 ms** |

## What we tried while looking in the wrong place

These changes were committed during the hunt and are still in the tree.
Some are real wins independent of the misdiagnosis:

1. **`ActivityStore` persistence debounce** (`src/state/ActivityStore.tsx`).
   Dropped the redundant synchronous `updateSession` call inside `apply()` —
   the `useEffect([cursor, history])` already persists. Effect now waits
   1500 ms after the last edit and skips writes when the byte ref already
   matches `lastPersistedBytesRef`. **Real win:** rapid undo/redo no longer
   triggers per-click base64+localStorage writes of multi-MB strings.

2. **`bytesToB64` chunking** (`src/lib/persist.ts`). Switched the per-chunk
   `String.fromCharCode(...subarray)` spread to `apply` form to avoid the
   wide-argv path on engines that cap arg count. Marginal win.

3. **`ActivityTimeline` memoization** (`src/components/ActivityTimeline.tsx`).
   `visible = activity.points.slice(...)` was a fresh array on every render
   (cursor scrub fired this 60×/s), which busted the `domains` `useMemo` and
   re-walked 60k points × 5 streams per move. Wrapped `visible` in
   `useMemo([activity, i0, i1])` and added a `paths` `useMemo` so SVG path
   strings cache between cursor scrubs. **Real win** (especially for cursor
   scrubbing on long activities).

4. **`TrackPreview` split into base + overlay LayerGroups**
   (`src/components/TrackPreview.tsx`). Was: one polyline-rebuild effect
   keyed on `[data, activity, streamColor, extraTracks, maxPoints]`, so any
   prop change cleared and re-added 200 colored Leaflet segments. Now:
   `baseGroupRef` rebuilds only on `[data, activity, streamColor, maxPoints]`,
   `overlayGroupRef` rebuilds only on `[extraTracks, maxPoints]`. Cursor
   stays on its own ref. Also memoized stream `lo`/`hi` so cursor scrub
   doesn't re-walk 60k points to recolor the cursor marker. **Real win** —
   matches the recommendation already written into `LIVE_PREVIEW_HANDOFF.md`.

5. **Stable `extraTracks` reference** in `EditorView.ToolSubpage` —
   `useMemo(() => mergePreview ? [mergePreview] : undefined, [mergePreview])`.
   Without it, every parent render produced a new array and re-fired
   `TrackPreview`'s overlay effect. **Real win** (small but free).

None of these fixed the merge hang because the merge hang was not in our
code. They are still valuable; keep them.

## Root cause, in detail

`npm run dev` ships:

- The development build of React (`react-dom-client.development.js`),
  which is unminified and emits dev-only fiber-tree allocations + warnings.
- `<StrictMode>` enabled (`src/main.tsx`), which **double-invokes
  components and effects** to surface unsafe lifecycle behavior.
- A globally-installed React DevTools browser extension, if the user has
  one. DevTools attaches `Performance.measure` markers and recursively
  walks/serializes prop trees for its component panel and profiler.

When the activity reference changes (Apply, undo, redo), React reconciles
the editor's prop tree, which carries a `NormalizedActivity`:

```
{
  bytes: Uint8Array,    // 1.8 MB after merge
  filename: string,
  meta: {...},
  points: ActivityPoint[]   // ~16k objects, each with a Date
}
```

In the production build, React reconciles this in a few ms because:
- The minified runtime skips dev warnings/measure-markers.
- StrictMode is a no-op.
- DevTools, if attached, has no dev-only hooks to call.

In the dev build, every commit:
- Allocates a doubled fiber tree (StrictMode).
- Walks the activity prop on every fiber that receives it (and we pass it
  to several: `MapCard`, `ActivityTimeline`, `AdvisorPanel`, `MergePanel`,
  `CollapsibleSummary`).
- DevTools (if installed) recursively serializes the prop into its
  internal store so the inspector panel can show the value, which means
  walking 16k `Date` instances on every commit.

That's the 30-second hang. The OOM is the same allocation pressure
hitting the Firefox tab's memory ceiling. The Firefox profile we captured
showed 67% of CPU in `commitPassiveMountOnFiber` /
`recursivelyTraversePassiveMountEffects`, with `logComponentRender` and
`addObjectDiffToProperties` (DevTools internals) at the same level —
that's the smoking gun.

## What is and isn't the fix

The fix for **users** is: ship a production build. Already true.

The fix for **developers** is one of:

- **Use `npm run preview` to test heavy scenarios.** `npm run dev` is for
  UI iteration, not for measuring perf or stress-testing large files.
  This is standard React workflow advice.
- **Disable React DevTools in the dev profile** if you have it installed
  globally and don't need it. The prop-walking overhead vanishes.
- **Drop `<StrictMode>`** in `src/main.tsx` if dev mode becomes
  unbearable. You lose dev-time double-invoke safety checks for unsafe
  lifecycle patterns. Trade-off, not a free win.

These are *workflow* changes, not code changes. Don't refactor the app to
work around dev-mode overhead.

## What we considered and rejected: moving `activity` out of React state

A common "fix" suggested in this situation is to keep large data
(`activity.points`, `activity.bytes`) in an external store
(zustand/jotai/useRef + custom subscribe) so React never sees it as
prop/state and thus never reconciles it. That works, but:

- It would not help dev-mode StrictMode-doubling (StrictMode doubles the
  whole tree regardless of where the data lives).
- It would not help DevTools prop-walking unless we also explicitly stop
  passing `activity` to children — i.e., a substantial refactor of every
  consumer to subscribe via selectors.
- Real users on prod builds don't have a problem.
- We'd lose the simplicity of "React state is the source of truth", which
  makes undo/redo, derivations, and detector hooks straightforward.

**Verdict: keep current architecture.** Revisit the external-store
migration only if one of the following starts to bite *in production*:

- Activities routinely exceed ~100k points (multi-hour 1 Hz × many
  streams).
- Cursor scrub becomes laggy in production.
- Mobile memory ceilings start OOM-ing real users.
- We want structural-sharing undo/redo (immer-style) to cut history
  memory.

Until then this is YAGNI.

## Lessons

1. **Benchmark in Node before blaming the algorithm.** A 5-minute
   `scripts/bench-merge.ts` that ran the actual production functions on
   the actual user files would have shown 155 ms total in the first
   conversation turn. We instead chased UI memoization for several turns.
2. **Reproduce in `npm run preview` before optimizing dev artefacts.** If
   the prod build is fast and the dev build is slow, the bottleneck is
   tooling overhead, not application code. Stop iterating on the app.
3. **A Firefox profile of `commitPassiveMountOnFiber` dominating the
   trace is the signature of dev-mode React + heavy props.** It is *not*
   a signal that you need to micromanage `useEffect` dependencies — it's
   a signal to retest in prod first.
4. **`StrictMode` is great until your data shape is large.** It doubles
   *all* allocation pressure during reconciliation. For apps that hold
   tens of thousands of objects in state, dev-mode UX with StrictMode is
   noticeably worse than prod. That doesn't mean drop StrictMode; it
   means use the prod build for stress tests.
5. **React DevTools makes the dev experience worse for data-heavy apps.**
   The extension serializes everything it sees. For most apps this is
   invisible; for apps shipping a 16k-element array as a prop, it is the
   single largest cost.

## Files touched during this hunt

- `src/state/ActivityStore.tsx` — debounced + skip-if-unchanged persist
- `src/lib/persist.ts` — `bytesToB64` chunking switch
- `src/components/ActivityTimeline.tsx` — memo `visible` and `paths`
- `src/components/TrackPreview.tsx` — base + overlay layer groups, memo
  `streamRange`
- `src/components/EditorView.tsx` — memo `extraTracks`, merge preview
  subscribe wiring (also added the merge-tool seed handoff for the
  multi-file home drop)
- `src/components/HomeView.tsx` — multi-file drop → editor + merge seed
- `src/lib/edits/merge/seed.ts` — one-shot file handoff slot
- `src/lib/edits/merge/preview.ts` — pub-sub for the pending merge
  preview overlay
- `src/lib/edits/merge/Panel.tsx` — consume seed, publish preview
- `src/App.tsx` — `View.editor` got `mergeWith?: File[]`
- `scripts/bench-merge.ts` — kept; useful regression baseline
- `scripts/analyze-profile.ts` — kept; reads Firefox profiler JSON.gz

## Reproducing the bench

```bash
node_modules/.bin/tsx scripts/bench-merge.ts
```

Path constants at the top of the script point to the two real Garmin
files used in this investigation. Update them to repro on different
inputs.

## Reproducing the prod-vs-dev gap

```bash
# Slow (30s+, OOM with DevTools attached)
npm run dev

# Fast (~118 ms total, sub-second feel)
npm run build && npm run preview
```
