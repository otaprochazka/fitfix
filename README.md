# FitFix

**Garmin .FIT toolkit, in your browser.** Merge split activities. Remove GPS jitter from break spots. 100 % local — your files never touch a server.

🔗 **[fitfix.vercel.app](https://fitfix.vercel.app)** · 📦 PWA (works offline)

---

## Why

Garmin watches sometimes split a long activity into two .fit files (battery save, firmware quirks, mid-activity reboot). Garmin Connect has no built-in way to stitch them back together.

A different problem: when you stop somewhere for a break, GPS keeps recording but the position drifts in random circles around the spot. Garmin counts those few hundred meters of "wander" toward your total distance, and your map looks like a plate of spaghetti at every rest stop.

**FitFix** does both: merge two consecutive .fit files into one continuous activity, and identify + flatten GPS jitter clusters so the resulting track looks like the route you actually took.

## How it works

- **Pure browser app.** Vite + React + TypeScript, deployed as a static PWA on Vercel. No backend, no API, no upload — your .fit bytes stay in your tab.
- **Byte-level FIT manipulation.** Custom walker reads the FIT binary directly so we can preserve every Garmin-proprietary undocumented message during round-trip. The output file matches the input bit-for-bit except for the fields we explicitly modify.
- **Endianness aware.** Watches write little-endian; Garmin Connect re-encodes uploads as big-endian. The walker reads the per-definition `arch` flag.
- **CRC recomputation.** Header and file CRCs are recalculated using the standard FIT polynomial after edits.
- **Garmin Connect dedup avoidance.** `file_id.time_created` and `serial_number` are bumped on every output so Connect treats the result as a new activity.

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

## Deploy

Anywhere static. The `dist/` directory is a self-contained PWA. Vercel autodetects Vite — just import the repo.

## Acknowledgments

- [Garmin FIT SDK](https://developer.garmin.com/fit/) for the open file format.
- [Leaflet](https://leafletjs.com/) for the map.
- [CartoDB](https://carto.com/attribution/), [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org/about), [Esri](https://www.esri.com/) for tiles.

## Contributing / agents

Working on the codebase (human or AI)? Read **[AGENTS.md](AGENTS.md)** first
— it covers the repo layout, the FIT format gotchas, the encoder LRU bug
that keeps trying to come back, the dev / build / deploy commands, and the
PR workflow. Saves a few hours of re-deriving them.

## License

MIT — see [LICENSE](LICENSE).
