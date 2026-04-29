# Test fixtures

This folder is intentionally **almost empty** — phase 1 reuses the single
public-domain fixture already shipped under `public/samples/`. As more
detector / edit tests come online (phase 2 in `docs/TESTING_PLAN.md`),
fixtures will live here so they don't bloat the PWA bundle.

## Currently used by the suite

| Fixture | Source | License | Notes |
| --- | --- | --- | --- |
| `public/samples/garmin-edge-500-cycling.fit` | Edge 500 demo file (already shipped on the homepage) | Public domain | 357 KB outdoor cycling, multi-lap, no HR/power. **Surfaced as the cycling sample on the homepage.** |
| `public/samples/garmin-fenix2-running.fit` + `tests/fixtures/fenix2-running-outdoor.fit` | `activity-small-fenix2-run.fit` from [python-fitparse](https://github.com/dtcooper/python-fitparse/blob/master/tests/files/activity-small-fenix2-run.fit) | MIT (© 2011-2025 David Cooper, Carey Metcalfe) | 119 KB, sport=1 (running), Fenix 2, **9 km outdoor with HR + cadence**, 2809 records. **Surfaced as the running sample on the homepage** + drives the running smoke test. |
| `public/samples/garmin-pool-swimming.fit` + `tests/fixtures/event-swimming-pool.fit` | `event_timestamp.fit` from [python-fitparse](https://github.com/dtcooper/python-fitparse/blob/master/tests/files/event_timestamp.fit) | MIT (same as above) | 87 KB, sport=5 (swimming) / sub_sport=17 (lap_swimming), pool indoor activity, 4376 records, 2.6 km. **Surfaced as the swimming sample on the homepage** + exercises the indoor flag. |
| `tests/fixtures/edge810-cycling-vector.fit` | `Edge810-Vector-2013-08-16-15-35-10.fit` from [python-fitparse](https://github.com/dtcooper/python-fitparse/blob/master/tests/files/Edge810-Vector-2013-08-16-15-35-10.fit) | MIT (same as above) | 145 KB, sport=2 (cycling), Edge 810 + Vector pedals, **41 km outdoor with power**, 4700 records. Test-only — covers older Edge firmware + power-meter fields. |
| `tests/fixtures/indoor-zwift.fit` | `sample-activity-indoor-trainer.fit` from [python-fitparse](https://github.com/dtcooper/python-fitparse/blob/master/tests/files/sample-activity-indoor-trainer.fit) | MIT (same as above) | 28 KB, cycling trainer, **5 manual laps, zero GPS records**. Use for strip-GPS detector + `indoor=true` meta flag. |
| `tests/fixtures/multi-lap-intervals.fit` | `fit_format_test_File.FIT` from [firefly-cpp/sport-activities-features](https://github.com/firefly-cpp/sport-activities-features/blob/main/datasets/fit_format_test_File.FIT) | MIT (© firefly-cpp) | 14 KB, running, **5 × 1 km distance-triggered laps + GPS** (despite the original README claim). Use for lap-aggregate recompute path. |
| `tests/fixtures/garmin-tcx-export.tcx` | `sup_activity_1.tcx` from [alenrajsp/tcxreader](https://github.com/alenrajsp/tcxreader/blob/main/example_data/sup_activity_1.tcx) | MIT (© 2020 Alen Rajšp) | 67 KB, Garmin TrainingCenterDatabase v2 schema, Sport="Other", HR data, 1 lap. Use for TCX import path + Garmin-schema validation. |

Smoke coverage for every `.fit` in this folder lives in
`tests/api/fixtures-smoke.test.ts` — asserts each parses through
`parseFitActivity` with the expected sport / indoor flag / record count.

## Still needed (phase 2)

Add as `tests/fixtures/<name>.fit` (or `.tcx`, `.gpx`) and document
provenance in this table. Don't commit anything you don't have rights to
redistribute publicly — this is an MIT-licensed repo.

| Fixture | Why we need it | Search note |
| --- | --- | --- |
| `suspicious-trim.fit` | Trim detector — drive-to-trailhead start, drive-home end. | Not yet sourced. |
| `parkrun-loops-clean.fit` | Negative case for the loops detector (genuine track loops must NOT fire). | No public-domain parkrun FIT found. parkrun repos (sargant/dfyb.run BSD-3, willie-engelbrecht/parkrun-parse Apache-2) contain no FIT fixture files. Alternative: synthesize via `tests/fixtures/synth.ts` — generate a 5 km loop track with 5 clean laps at consistent spacing. |
| `forerunner-jitter.fit` | Phantom-loop GPS-glitch positive case. Match the FR265s 24h-race profile from `memory/project_loop_glitch_value.md`. | No public FIT with known GPS-jitter clusters found. All outdoor FIT files in MIT repos (python-fitparse, sport-activities-features) have clean moving tracks. Alternative: synthesize via `tests/fixtures/synth.ts` — inject stationary noise bursts (±30 m oscillations at 0 km/h intervals). |
| `polar-flow-run.tcx` | TCX import path — Polar-dialect variation (different xmlns, no Garmin extensions). | Polar TCX files are only available via Polar Flow login export; no MIT/CC0 public Polar TCX found. The `garmin-tcx-export.tcx` fixture covers the basic Garmin TCX path. For Polar dialect: synthesize via `tests/fixtures/synth.ts` using Polar's TCX namespace (`http://www.polarpersonaltrainer.com`). |
| `gpx-roundtrip.gpx` | Once we land GPX import, this validates the round-trip from our own `fitToGpx` exporter. | Not yet sourced. |

Where a real-world fixture is impossible to source publicly, use the
synthetic builder in `tests/fixtures/synth.ts`. It emits valid FIT bytes
from a declarative `points` array using the same primitives the
production encoder relies on (`writeField`, `fitCrc16`), so synth output
round-trips through `parseFitActivity` exactly like real Garmin output.

```ts
import { buildFit, synthOutdoorRide } from './synth'

// Clean baseline ride.
const bytes = synthOutdoorRide({ km: 5, durationS: 1500 })

// Custom point stream — drop a phantom-loop burst into the middle, etc.
const custom = buildFit({
  points: [
    { t: 0, lat: 50.07, lon: 14.43, distance: 0,  speed: 4 },
    { t: 1, lat: 50.07, lon: 14.43, distance: 4,  speed: 4 },
    // …
  ],
})
```

Round-trip guard lives in `tests/api/synth.test.ts`; if you extend the
generator (laps, events, big-endian arch, etc.) add a case there too.

## Don't commit

- Personal activity files. The repo is public — anything uploaded
  here is uploaded to the world.
- Files larger than ~1 MB unless absolutely necessary. Tests should
  exercise edge cases, not load times.
