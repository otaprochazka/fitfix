> **Status:** open — design sketch, not yet started  
> **Audience:** future contributors who want to expose FitFix to LLM clients  
> **TL;DR:** ship `@fitfix/mcp-server` so Claude Desktop / Code can drive FitFix edits via natural language. Files stay on the user's disk via stdio + absolute paths.

# FitFix MCP Server — Backlog

Goal: expose FitFix's track-editing capabilities to Claude Desktop / Claude
Code (and any other MCP-aware client) so users can drive edits via natural
language. Files stay on the user's machine — distributed as a local stdio
server via `npx`.

## Why

- The PWA runs in a browser sandbox → it can't host an MCP server itself.
- Logic in `src/lib/` is mostly pure TS without React deps → reusable.
- Claude Desktop / Code users can then say "clean jitter in this FIT, trim
  the first 2 km and export as GPX" without clicking through the UI.

## Architecture

```
┌─────────────────┐   stdio/JSON-RPC   ┌────────────────────┐
│ Claude Desktop  │ ◄────────────────► │ @fitfix/mcp-server │
│ / Claude Code   │                    │ (Node.js process)  │
└─────────────────┘                    └─────────┬──────────┘
                                                 │ imports
                                                 ▼
                                       ┌────────────────────┐
                                       │ @fitfix/core       │
                                       │ (extracted lib)    │
                                       └────────────────────┘
                                                 ▲
                                                 │ imports
                                       ┌─────────┴──────────┐
                                       │ PWA (src/)         │
                                       └────────────────────┘
```

- Files read directly from disk via absolute paths — no upload.
- Same code runs in browser and Node (no `window` / `document` in core).

## Phase 0 — Prep (extract core)

- [ ] Audit `src/lib/` — find spots using `window`, `URL.createObjectURL`,
  `FileReader`, `localStorage`. Either isolate behind an adapter or move
  out of core.
- [ ] Create `packages/core/` (npm workspace) — move: `edits/`, `loops/`,
  `jitter/`, `spikes/`, `merge/`, `split/`, `trim/`, `timeshift/`,
  `strip/`, `privacy/`, `elevation/`, `track/`, `tcx-import/`,
  `tcx-export/`, `fit.ts`, `fitToGpx.ts`, `fitStats.ts`, `rewrite.ts`,
  `cleanJitter.ts`, `findClusters.ts`, `streamColors.ts`, `merge.ts`.
- [ ] PWA imports from `@fitfix/core`.
- [ ] CI: build + test core standalone so browser-only code can never
  sneak back in.

## Phase 1 — MCP server skeleton

- [ ] `packages/mcp-server/` with `@modelcontextprotocol/sdk` (TypeScript).
- [ ] Stdio transport, `tools/list` + `tools/call`.
- [ ] Session store: in-memory `trackId → ParsedTrack` map (LRU, max ~10
  tracks, eviction matching the encoder LRU pattern).
- [ ] Logging to stderr (stdout is reserved for JSON-RPC).
- [ ] Schemas via `zod` → JSON Schema for `inputSchema`.

## Phase 2 — I/O tools

- [ ] `load_track({ path }) → { trackId, format, stats }` — reads from
  disk, detects format.
- [ ] `list_tracks() → [{ trackId, name, points, distance }]`.
- [ ] `get_track({ trackId, fields? }) → { ...stats }` — metadata only,
  no full stream.
- [ ] `export_track({ trackId, format: gpx|fit|tcx, path })` — writes to
  disk.
- [ ] `diff_tracks({ a, b }) → { pointsDelta, distanceDelta, segments[] }`
  — helps an AI see what an edit actually did.

## Phase 3 — Detection tools (read-only)

- [ ] `track_stats({ trackId })` — wrap `fitStats.ts`.
- [ ] `detect_jitter({ trackId, threshold? })` — wrap `cleanJitter.ts` +
  `findClusters.ts`. Returns clusters, not raw points.
- [ ] `detect_loops({ trackId })` — wrap `loops/`.
- [ ] `detect_spikes({ trackId, sensitivity? })` — wrap `spikes/`.
- [ ] `detect_pauses({ trackId, minSeconds? })`.
- [ ] `detect_privacy_zones({ trackId, radius?, knownAddresses? })`
  — wrap `privacy/`.
- [ ] `preview_segment({ trackId, start, end, sample? })` — returns ~N
  sampled points, not the full stream.

## Phase 4 — Edit tools (mutations, return new trackId)

Convention: every edit returns `{ newTrackId, summary }`. The original
track stays; the client can keep its own history.

- [ ] `clean_jitter({ trackId, clusterIds?, threshold? })`.
- [ ] `remove_loops({ trackId, loopIds? | bbox? })`.
- [ ] `smooth_spikes({ trackId, window?, sensitivity? })`.
- [ ] `trim({ trackId, start, end })` — by time or distance.
- [ ] `split({ trackId, at }) → { trackIds: [a, b] }`.
- [ ] `time_shift({ trackId, offsetSeconds })`.
- [ ] `strip_metadata({ trackId, fields: [hr|cad|power|temp|device|...] })`.
- [ ] `fix_elevation({ trackId, source: dem|smooth })` — DEM optionally
  via an external API (cached).
- [ ] `merge_tracks({ trackIds, gapStrategy? })` — wrap `merge.ts`.
- [ ] `crop_privacy({ trackId, zones })`.

## Phase 5 — Session & UX

- [ ] `undo({ trackId })` / `redo({ trackId })` — leverage `persist.ts`
  history.
- [ ] Return errors as structured content (code, hint, example), not just
  a string.
- [ ] `tools/list` descriptions written for the LLM, not for humans —
  short, with examples of when to use.
- [ ] Resource: `track://{trackId}/preview` — map snapshot? (consider;
  needs a renderer).

## Phase 6 — Distribution

- [ ] Publish `@fitfix/mcp-server` to npm.
- [ ] README with config snippet:
  ```json
  {
    "mcpServers": {
      "fitfix": { "command": "npx", "args": ["-y", "@fitfix/mcp-server"] }
    }
  }
  ```
- [ ] Claude Code plugin in a separate marketplace repo (`fitfix-mcp`
  plugin bundles the config).
- [ ] Register in the MCP registry.
- [ ] Demo video / GIF: "open Claude Desktop, drag a FIT, say 'clean it
  and export'".

## Phase 7 — Cloud / SaaS (optional, later)

- [ ] HTTP/SSE variant of the server for FitFix Cloud.
- [ ] Presigned upload URLs (base64 over JSON-RPC hurts for 50 MB FITs).
- [ ] OAuth for auth, per-user storage, sharing tracks across sessions.
- [ ] Hybrid: local stdio server, heavy compute (DEM, OSM matching)
  delegated to a cloud endpoint.

## Open questions

- **Edit granularity**: one tool per edit, or one `apply_edit({ kind,
  params })`? The first is AI-friendlier (better tool descriptions,
  schema validation), the second is DRY. → Probably the first.
- **Track ID lifecycle**: persist across MCP sessions, or in-memory only?
  In-memory is simpler; persist via `~/.fitfix/sessions/` later.
- **Output size**: a FIT with 50k points is ~2 MB of JSON. Detect tools
  must aggregate (clusters, not points). Preview tools must sample.
- **Privacy zones**: read `~/.fitfix/known-addresses.json` (shared with
  the PWA), or accept as per-call argument.
- **Error model**: what if a user calls `clean_jitter` on a track with no
  detected clusters? Soft fail with a "run detect_jitter first" hint —
  not an exception.

## Non-goals

- Realtime sync with a running PWA tab (WebSocket bridge) — fragile for
  no real reason.
- Headless Chromium driving the PWA — `src/lib/` is pure, this is
  unnecessary.
- Browser extension → MCP — that's a claude-in-chrome use case, not FitFix.

## Success criteria

1. A user with Claude Desktop installed adds `npx -y @fitfix/mcp-server`
   to their config, restarts, and can say "load /tmp/ride.fit, clean
   jitter, export as gpx to /tmp/clean.gpx" — works end-to-end.
2. PWA build size doesn't grow (core extraction is neutral).
3. No browser-only code in `@fitfix/core` (enforced by CI).
