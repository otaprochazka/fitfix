# AGENTS.md — onboarding for AI coding agents

This file orients an agent who has never touched the FitFix repo before.
Read it once before starting work; you will save several round-trips.

> **This is a public repository.** Do not commit secrets, API keys, personal
> data, real activity files, or anything you would not paste into a public
> Slack channel. The repo lives at <https://github.com/otaprochazka/fitfix>.

---

## 1. What FitFix is

A privacy-first, browser-only PWA that operates on Garmin **.fit activity
files**. Three user-facing functions, all run 100 % client-side:

| Icon | Function | What it does |
|---|---|---|
| 🧵 | **Merge** | Stitch 2+ .fit files into one continuous activity (e.g. activity that the watch split because of a battery save / restart). |
| 🧹 | **Clean** | Detect "GPS jitter" clusters where the watch sat still but GPS kept wandering, and let the user collapse each one (Pin / Smooth / Keep). |
| 📍 | **GPX** | Convert .fit to GPX 1.1 with HR / cadence / altitude / temperature via Garmin TrackPointExtension v2. |

Both Merge and Clean also offer a one-click "Also as .gpx" secondary download.

**Hosting**: deployed on Vercel from `main`. Every merge to main triggers an
auto-deploy. Live URL: <https://fitfix.vercel.app>.

---

## 2. Tech stack

- **Vite 8 + React 19 + TypeScript** (strict mode).
- **Tailwind 3** for styling. Brand colour is `brand-*` (teal scale, defined
  in `tailwind.config.js`). Reserve `brand-500/600` for primary CTAs only.
- **Leaflet** for maps. Tile providers are CartoDB (default), OpenTopoMap,
  Esri Satellite, Esri Topo. They all allow the `file://` and HTTPS referers
  we need; do not switch to raw OSM tiles (they 403 without referer).
- **vite-plugin-pwa** (peer deps lag behind Vite 8, so `.npmrc` pins
  `legacy-peer-deps=true` — keep it).
- **i18next** with `i18next-browser-languagedetector`. Default `en`,
  fallback `en`, second locale `cs`. Add new strings to **both**
  `src/locales/{en,cs}.json` whenever you introduce a key.
- **No backend.** Don't add one. The product promise is "your files never
  leave your device" and the trust bar literally says so.

---

## 3. Repo layout

```
fitfix/
├── public/                       # static assets served as-is
│   ├── favicon.svg               # source SVG (mushroom + GPS watch)
│   ├── icon-{192,512,512-maskable}.png   # PWA icons (rasterised from favicon.svg)
│   ├── apple-touch-icon.png
│   └── screenshot-clean.png      # used in the HowItWorks section
├── avatar/                       # off-site brand assets (Buy Me a Coffee
│                                 # profile photo, NOT served by Vite)
├── scripts/
│   └── test-merge.ts             # node script: merge two FITs, report sizes + parse-back
├── src/
│   ├── lib/                      # pure logic, framework-free, well-tested
│   │   ├── fit.ts                # ★ byte-level FIT walker (parser + encoder primitives)
│   │   ├── findClusters.ts       # GPS jitter cluster detection
│   │   ├── cleanJitter.ts        # apply per-cluster fix modes, recompute distances
│   │   ├── merge.ts              # ★ FitEncoder (LRU) + sessionsynth + N-file merge
│   │   ├── fitToGpx.ts           # FIT → GPX 1.1 + TrackPointExtension v2
│   │   ├── fitStats.ts           # fast summary (sport / distance / duration / point count)
│   │   └── download.ts           # tiny browser blob-download helper
│   ├── components/
│   │   ├── App.tsx               # view router (state, no react-router)
│   │   ├── Header.tsx            # logo, language picker, ☕ donate, GitHub
│   │   ├── TrustBar.tsx          # 100% local · open source · no ads · works offline
│   │   ├── Footer.tsx
│   │   ├── DropZone.tsx          # drag & drop / file picker for .fit
│   │   ├── HomeView.tsx          # landing, foldable feature panels, file stats
│   │   ├── MergeView.tsx         # merge result + drag-to-reorder + track preview
│   │   ├── CleanView.tsx         # cluster modes + map + freshen-id checkbox
│   │   ├── GpxView.tsx           # one-click FIT → GPX
│   │   ├── JitterMap.tsx         # Leaflet map with numbered cluster markers
│   │   ├── TrackPreview.tsx      # Leaflet map with single track polyline + start/end
│   │   ├── SecurityBadges.tsx    # 4-card explainer below HowItWorks
│   │   └── HowItWorks.tsx        # 3 step cards + screenshot in mock browser frame
│   ├── locales/{en,cs}.json
│   ├── i18n.ts
│   ├── index.css                 # Tailwind layers + Leaflet dark-theme overrides
│   ├── main.tsx
│   └── App.tsx                   # see components/App.tsx note above
├── vite.config.ts                # PWA manifest + service worker config
├── vercel.json                   # static cache headers, security headers
├── tailwind.config.js
├── postcss.config.js
├── README.md                     # public-facing
└── AGENTS.md                     # ← you are here
```

The `src/lib/` modules are deliberately framework-agnostic so they can be
unit-tested with `tsx` and re-used in CLI scripts.

---

## 4. Mental model of the FIT format (read once)

A FIT file is a stream of binary "messages". Each message is identified by:

- **Global mesg num** — a number from the FIT spec (`record`=20, `lap`=19,
  `session`=18, `activity`=34, `file_id`=0, `file_creator`=49, `event`=21,
  `device_info`=23, `gps_metadata`=160, `sport`=12 …).
- **Local mesg num** — a 4-bit slot (0–15) bound to a global num + field
  layout via a "definition message". Up to 16 layouts can be active at a
  time; new ones evict an old slot.

Two flavours of message:

- **Definition message** (header byte bit 6 = 1) declares: arch (LE/BE),
  global num, list of fields with their `(field_num, size, base_type)`.
- **Data message** (bit 6 = 0) just contains the field bytes in the order
  the active definition declared.

**Critical gotchas the codebase already handles:**

1. **Endianness per definition.** Watches write little-endian, but Garmin
   Connect re-encodes uploads as **big-endian**. `readField` / `writeField`
   in `fit.ts` use the per-def `arch` flag — never hardcode LE.
2. **Garmin proprietary messages** (mesg_num 233, 325, 326, 394, 499 …) have
   no published schema. We don't decode them — we copy them through verbatim
   in `mergeFit`'s byte-level encoder. Don't try to interpret their fields.
3. **CRC.** FIT uses a non-standard CRC-16 (table-based, polynomial 0x1021).
   Implementation in `fit.ts` (`fitCrc16`). Header has its own CRC at bytes
   12-13; file CRC is the last 2 bytes. Both must be recomputed after edits.
4. **FIT epoch** is **1989-12-31 00:00:00 UTC** (`FIT_EPOCH_S` constant), not
   the Unix epoch. Timestamps are seconds since then.
5. **Positions** are stored as `int32` "semicircles" (= 1 / 2³¹ of a degree),
   not floats. Use `SC_TO_DEG` / `DEG_TO_SC` constants.
6. **`file_id.serial_number` + `time_created` dedup.** Garmin Connect refuses
   duplicate file IDs. After any modification, bump both unless the user
   ticks the freshen-id checkbox off.

If you find yourself confused by a byte-level operation, the official Garmin
FIT SDK profile docs are the source of truth. Field numbers in
`cleanJitter.ts` / `merge.ts` / `fitToGpx.ts` reference these directly with
inline comments (e.g. `// total_distance (scale 100)`).

---

## 5. The encoder LRU — the bug that keeps trying to come back

`merge.ts` has its own `FitEncoder` because we need to write FITs from
scratch, not just patch them. The encoder maintains a 16-slot table of
"currently active definitions" mapping local mesg num → def signature.

**The trap**: when all 16 slots are full and a new def arrives, evicting
the wrong slot causes massive re-emission. A naive "evict slot 0" policy
turned a 1.86 MB merge into a 4.3 MB output (2.31× growth) on real activity
files because the file alternates between 30+ unique defs.

**The fix**: proper LRU. Each slot has a `lastUsedTick`. Evict the slot with
the smallest tick. Touch the tick on every use (both definition emit and
data emit). Sanity-check by running:

```bash
./node_modules/.bin/tsx scripts/test-merge.ts a.fit b.fit /tmp/out.fit
```

The "growth ratio" line should report ≤ 1.05× on healthy inputs. If you
see > 1.5×, you broke the LRU.

The `ByteBuf` typed-array also matters. Don't replace it with `number[]` —
that allocates dense JS arrays and copies are O(n²) in practice on multi-MB
outputs.

---

## 6. Dev commands

```bash
# install
npm install                       # (.npmrc enables legacy-peer-deps)

# dev server (Vite, HMR)
npm run dev                       # http://localhost:5173

# typecheck only
npx tsc --noEmit -p tsconfig.app.json

# production build (also runs tsc)
npm run build                     # outputs dist/

# preview the production build locally
npm run preview

# lint (ESLint, currently warning-only)
npm run lint

# repro / regression-test the merge encoder
./node_modules/.bin/tsx scripts/test-merge.ts \
  ~/path/to/in1.fit ~/path/to/in2.fit /tmp/out.fit
```

`tsx` is in devDeps; do NOT use `npx tsx` (a host shell wrapper intercepts
and breaks it). Always call `./node_modules/.bin/tsx` directly.

Build size budget: keep the gzipped JS under 200 KB. As of the last commit
it sits around 140 KB.

---

## 7. Deployment

- **Vercel** is connected to GitHub `main`. Every merge to `main` triggers
  an auto-deploy (no manual step).
- Vercel autodetects Vite — no project settings to maintain.
- `vercel.json` sets immutable caching for `/assets/*` and `must-revalidate`
  for `/sw.js`, plus security headers.
- Service worker is generated by `vite-plugin-pwa` and includes runtime
  caching for the three tile providers so the app stays usable offline
  for areas the user has already viewed.

Do not deploy preview builds for cosmetic changes — open a PR and let
Vercel preview the branch.

---

## 8. Branching & PR workflow

- `main` is protected. **Direct pushes to main are denied.**
- Always create a feature branch: `feat/short-name`, `fix/short-name`, or
  `docs/short-name`. (`init` is reserved.)
- Open a PR with `gh pr create --base main --head <branch>`.
- After CI/typecheck/build passes, `gh pr merge <n> --merge --delete-branch`
  is the normal path. Squash is fine too, just be consistent within a PR.
- Never `git push --force` to a remote branch you didn't just create.
- Don't delete remote branches that aren't yours.

Recent PR history (numerical, not chronological):
- #1 v2 — per-cluster modes + landing
- #2 GPX export + drag-to-reorder
- #3 cross-export + colour rebalance + trust bar
- #4 foldable feature panels + file stats + bigger fonts
- #5 ★ encoder LRU fix + richer merge stats + track map

If you're unsure why something looks the way it does, check the commit
message of the matching PR.

---

## 9. i18n discipline

- New UI string ⇒ new key in **both** `src/locales/en.json` AND
  `src/locales/cs.json`. CI doesn't catch missing CS keys; they fall
  back to the key name on screen.
- Use namespaced keys (`clean.modes.pin`, not `pinModeLabel`).
- Browser detection picks `cs` for `cs-*` languages, falls back to `en`.
  Persisted in `localStorage`.

---

## 10. UX guardrails learned the hard way

- **Reserve bright `brand-*` for primary actions.** Mode pickers, secondary
  buttons, info pills should use slate. The user told us off twice for
  putting brand colour on too many things at once.
- **Foldable feature panels on Home auto-open** when the current file count
  matches their requirement (1 file → Clean + GPX open, 2+ → Merge).
- **Show file stats inline** in the upload list (sport, distance, duration,
  point count, date). `getFitStats(bytes)` is fast — < 50 ms for 15k
  records.
- **Trust bar at the top of every page.** It's load-bearing for the
  privacy-first promise.
- **Screenshots in HowItWorks must look like illustrations**, not live UI:
  framed mock browser window, opacity-90, `pointer-events-none`.

---

## 11. Where to plug things in

Adding a new function ("📈 Lap split", "📦 Batch processing", …):

1. Pure logic in `src/lib/<name>.ts` (no React imports).
2. UI component `src/components/<Name>View.tsx`. Mirror an existing view
   for back button, file loading, and download patterns.
3. Add `'name'` kind to the `View` union in `src/App.tsx` and route to it.
4. Add a 4th foldable card in `HomeView.tsx` (with `requires` hint) and a
   matching action button.
5. Add `home.<name>.*` and `errors.<name>_needs_*` keys to both locale
   files.
6. Wire a corresponding download path through `src/lib/download.ts` if you
   produce a file.

For a new merge / clean output **format**, drop a converter in
`src/lib/fitTo<Format>.ts` and add a secondary "Also as .<ext>" button on
both MergeView and CleanView.

---

## 12. Things deliberately NOT in the project

- No backend, no API. Adding one would break the privacy promise.
- No analytics, no tracking pixels, no third-party scripts beyond what's
  in the bundle (Leaflet, i18next).
- No accounts, no login, no persistence beyond `localStorage` for the
  language pick + workbox tile cache.
- No Sentry / error tracker. (If you want crash-reporting, raise it as an
  issue first — has to be 100% client-side and opt-in.)

---

## 13. When in doubt

- Read `merge.ts` end-to-end before touching the encoder.
- Read `fit.ts` end-to-end before touching anything binary.
- Run `scripts/test-merge.ts` against a real .fit pair after any merge
  change.
- Match `en.json` and `cs.json` keys.
- Open a PR; never push to main.

Welcome aboard. 🍄
