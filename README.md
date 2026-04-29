# FitFix

**FIT activity toolkit, in your browser.** Fix, merge and convert `.fit`
files from Garmin, Wahoo, Coros, Polar, Bryton, Lezyne, Hammerhead, Stages,
Zwift, Suunto and any other device that writes the FIT format. 100 %
local — your files never touch a server.

🔗 **[fitfix.vercel.app](https://fitfix.vercel.app)** · 📦 PWA (works offline)

---

## Why

Watches and bike computers split long activities into two `.fit` files
(battery save, firmware quirks, mid-activity reboot). When you stop for a
break, GPS keeps recording and your position drifts in spaghetti loops —
or it bounces between canyon walls and draws phantom kilometres while
you're moving. Barometric elevation drifts indoors. Activities flagged
"in a vehicle" by Strava when they were just indoor on Zwift. Forgot to
start. Forgot to stop and drove home with the watch on.

**FitFix** is one unified editor for all of that. Drop a file, get
suggested fixes, apply the ones you want, export.

## How it works

- **Pure browser app.** Vite + React + TypeScript, deployed as a static PWA on Vercel. No backend, no API, no upload — your `.fit` bytes stay in your tab.
- **Byte-level FIT manipulation.** Custom walker reads the FIT binary directly so we can preserve every vendor-proprietary undocumented message during round-trip. The output file matches the input bit-for-bit except for the fields we explicitly modify. Vendor-specific developer fields from Polar / Coros / Wahoo are passed through opaquely.
- **Endianness aware.** Watches write little-endian; Garmin Connect re-encodes uploads as big-endian. The walker reads the per-definition `arch` flag.
- **CRC recomputation.** Header and file CRCs are recalculated using the standard FIT polynomial after edits.
- **Re-upload friendly.** `file_id.time_created` and `serial_number` are bumped on every output so Garmin Connect, Strava, etc. treat the result as a new activity instead of refusing it as a duplicate.
- **No FIT SDK dependency.** We do not bundle the proprietary [Garmin FIT SDK](https://developer.garmin.com/fit/), which forbids OSS redistribution. The parser is hand-written from the public protocol documentation, the same approach [GoldenCheetah](https://www.goldencheetah.org/) takes.

## Privacy

- 🔒 Files are processed entirely client-side. There is no upload endpoint.
- 🌐 Map tiles come from CartoDB / Esri / OpenTopoMap. Those servers see the tile coordinates you're viewing while the map is on screen — same as any web map. They do **not** see your activity data.
- 🚫 No analytics, no tracking pixels, no third-party scripts beyond what you can see in the bundle.
- ✅ Open source under MIT — audit anything.

## Run locally

```bash
git clone https://github.com/otaprochazka/fitfix.git
cd fitfix
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

Tests (Vitest):

```bash
npm test               # one-shot
npm run test:watch     # watch mode
npm run test:coverage  # with coverage
```

## Deploy

Anywhere static. The `dist/` directory is a self-contained PWA. Vercel autodetects Vite — just import the repo.

## Acknowledgments

- [Garmin FIT SDK](https://developer.garmin.com/fit/) for the open file format.
- [Leaflet](https://leafletjs.com/) for the map.
- [CartoDB](https://carto.com/attribution/), [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org/about), [Esri](https://www.esri.com/) for tiles.

## Roadmap

- **MCP server** for Claude Desktop / Claude Code — drive FitFix's
  detectors and edits by prompt, files stay on your disk (stdio transport,
  distributed via `npx`). Tracked in
  [docs/roadmap/mcp-server.md](docs/roadmap/mcp-server.md).
- **Garmin Connect integration** — link a Garmin account, pull activities
  into the editor, push fixes back. Tracked in
  [docs/roadmap/garmin-connect.md](docs/roadmap/garmin-connect.md).

For background research and engineering lessons, see
[`docs/`](docs/README.md).

## Contributing / agents

Working on the codebase (human or AI)? Read **[AGENTS.md](AGENTS.md)** first
— it covers the repo layout, the FIT format gotchas, the encoder LRU bug
that keeps trying to come back, the dev / build / deploy commands, and the
PR workflow. Saves a few hours of re-deriving them.

Claude Code reads `AGENTS.md` directly when no `CLAUDE.md` is present, so
the same file orients both human contributors and AI agents — no need for
a parallel CLAUDE.md.

## License

MIT — see [LICENSE](LICENSE).
