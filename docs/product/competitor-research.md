> **Status:** research — informs scope and positioning  
> **Audience:** future contributors, AI agents, anyone evaluating where to take FitFix next  
> **TL;DR:** snapshot of the FIT/TCX/GPX editor landscape, where the market gaps are, and which features are differentiators vs. table-stakes catch-up.

# FIT / TCX / GPX editor landscape — competitor research

_Last updated: 2026-04-28._

This is a snapshot of the existing tooling around `.fit` (and to a lesser
degree `.tcx` / `.gpx`) activity files, written to answer one question:
**is there a real gap for an open-source, local-only, browser-based FIT
editor with a unified upload → detect → fix → export flow?** The short
answer is **yes**, and the strongest differentiator is auto-detecting
problems (loops, bad start/end, GPS jitter) and offering them as one-click
fixes instead of asking the user to find them manually.

## Feature legend

- **V** — view + map
- **L** — auto-detect loops / back-and-forth segments
- **M** — merge two or more activity files into one
- **T** — trim / crop start or end
- **E** — multi-format export (at least two of FIT / TCX / GPX)

## Tools matrix

| Tool | License | Local / Cloud | Platform | V | L | M | T | E | UX impression |
|---|---|---|---|---|---|---|---|---|---|
| [fitfiletools.com](https://www.fitfiletools.com/) | Closed (free) | Cloud upload | Web | ✓ | ✗ | ✓ | ✓ (Section Remover, Time Adjuster) | mostly FIT only | Functional but ugly per-tool tile UX, no unified flow |
| [FIT File Editor (jasonkuperberg.com)](https://jasonkuperberg.com/fit-file-editor) | Closed (free) | Local in-browser | Web | ✓ | ✗ | ✗ | ✓ | FIT only | Modern UI, clean, but no merge |
| [fitfileviewer.com](https://www.fitfileviewer.com/) | Closed (free) | Local in-browser | Web | ✓ | ✗ | ✗ | limited | limited | View-first, repair only |
| [GOTOES Combine GPX/TCX/FIT](https://gotoes.org/strava/Combine_GPX_TCX_FIT_Files.php) | Closed (free) | Cloud upload | Web | ✓ | ✗ | **✓** (de-facto standard) | some | FIT/TCX/GPX | Functional, dated UI; the standard merge solution |
| [GoldenCheetah](https://www.goldencheetah.org/) | GPL OSS | Local desktop | Win / Mac / Linux | ✓ | ✗ | ✓ (Activity → Merge wizard) | ✓ (Ride Editor row delete) | FIT export quirks | Power-user, training-focused, steep learning curve |
| [FitFileExplorer](https://apps.apple.com/us/app/fit-file-explorer/id1244431640) (roznet) | OSS Swift | Local | macOS only | ✓ (raw fields, map, charts) | ✗ | ✗ | ✗ | CSV only | Developer-oriented inspector, not an editor |
| fit-tool / python-fitparse / jonblack/cmpfit | OSS libs | Local | CLI / lib | ✗ | ✗ | ✗ | ✗ | ✗ | Building blocks, not products |
| Garmin FIT SDK / FIT CSV Tool | Permissive | Local | CLI | ✗ | ✗ | ✗ | ✗ | FIT ↔ CSV | Roundtrip debugging only |
| Sport-Calculator FIT Editor | Closed | Cloud | Web | ✓ | ✗ | limited | ✓ | some | Similar to fitfiletools |
| [Garmin Connect](https://connect.garmin.com/) | Closed | Cloud | Web / mobile | ✓ | ✗ | ✗ | ✓ | ✗ | Trim only, no merge |
| [Strava](https://www.strava.com/) | Closed | Cloud | Web / mobile | ✓ | ✗ | **✗** (support docs send users to GOTOES) | crop only | ✗ | Polished but limited edit |
| [rubiTrack 6](https://www.rubitrack.com/) | Closed paid | Local | macOS / iOS | ✓ | ✗ | manual stitching | ✓ | ✓ | Polished consumer app, broad features, not focused on editing |
| [RunGap](https://rungap.com/) | Closed paid | Local | iOS only | ✓ | ✗ | limited | limited | ✓ | Sync / backup oriented, not a deep editor |
| [FitTrackee](https://github.com/SamR1/FitTrackee) | OSS AGPL | Self-host server | Web | ✓ | ✗ | ✗ | ✗ | ✗ | Strava-clone, not an editor |
| TrackEddi | OSS | Local | Android | ✓ | ✗ | limited | some | GPX-focused | Track editor, not FIT-focused |
| **FitFix** (this project) | OSS | Local browser | Web (PWA) | ✓ | **✓** (Clean already ships GPS-jitter + back-and-forth detection) | ✓ (Merge ships) | planned | FIT + GPX (TCX planned) | Unified flow target |

## Feature coverage by capability

- **Trim start / end** — table-stakes. Covered by Garmin Connect, Strava,
  fitfiletools, jasonkuperberg, sport-calculator, GoldenCheetah.
- **Merge two files** — GOTOES dominates (cloud); GoldenCheetah does it
  locally but clunky; fitfiletools has it (cloud). **No polished
  local-OSS web tool ships this besides FitFix.**
- **Multi-format export FIT / TCX / GPX** — GOTOES yes; most others limit
  to FIT or one-way GPX.
- **Auto-detect loops / back-and-forth** — **no other tool ships this.**
  Closest is the manual "Section Remover" in fitfiletools where the user
  picks the segment themselves.
- **Auto-detect bad ascent / descent** (Garmin barometer drift, ascent
  and descent that don't match the map, non-zero net elevation when the
  user started and ended at the same point) — **no other tool flags
  this automatically.** GoldenCheetah has a manual "fix elevation"
  routine; everyone else makes the user notice and fix it themselves.
- **Local-only + OSS + modern UI + all five features** — empty quadrant.
  GoldenCheetah is local+OSS but desktop-only and not approachable.
  jasonkuperberg / fitfileviewer are local+browser+modern but closed
  and missing merge. **FitFix targets this exact gap.**

## Where the gap is

The dominant merge tool (GOTOES) is cloud-upload with a 2010-era UI. The
dominant general edit tool (fitfiletools) is closed-source with cloud
upload and per-tool fragmented flows. The dominant local OSS option
(GoldenCheetah) is a power-user training analytics suite where editing
is buried, with no web or mobile story. The polished local-browser tools
(jasonkuperberg, fitfileviewer) are closed and missing merge.

## Differentiators, in priority order

1. **Auto-detect problems and offer them as fixes** — back-and-forth
   loops, suspicious start/end (mode-of-transport jumps before the real
   activity starts or after it ends), GPS jitter. Nobody ships this. It
   is the most defensible feature and the most "share with a friend"
   moment.
2. **Local-only + open source + browser** — privacy-first matters for
   fitness / health data and is a rare combination (only fitfileviewer
   and jasonkuperberg are local-browser, both closed).
3. **One unified flow** — upload → see issues → fix → export — instead
   of fitfiletools' tile-per-task UX.
4. **Multi-format I/O (FIT + TCX + GPX)** — GOTOES has it, most others
   don't.

## Features beyond the canonical six (what else competitors do)

A second pass on the same tools, looking specifically for capabilities
that aren't in our V/L/M/T/E + elevation set. The full list of
GoldenCheetah's `Fix*` plugins is the canonical "things people want to
fix in activity files":

> FixGPS, FixElevation, FixGaps, FixHRSpikes, FixSpikes (power),
> FixSpeed, FixFreewheeling, FixTorque, FixDeriveDistance,
> FixDerivePower, FixDeriveTorque, FixDeriveHeadwind, FixRunningCadence,
> FixRunningPower, FixLapSwim, FixSmO2, FixMoxy, FixAeroPod, FixPy
> (user-scriptable).

`fitfiletools` ships these tiles: Adjuster (time-shift), Booster
(elevation), Changer (sport / device / serial / gear swap), Combiner
(merge), CTF (custom training file), Peak (power-spike fixer), Remover
(section / segment removal), Stripper (drop HR / power / cadence / GPS
streams), Convert (format).

`GOTOES` also offers Time-Shift, GPS Race Repair (rebuild missing GPS
from a course file), Shrink (downsample to fit Strava limits), Waypoint
Filter, FIT→CSV.

`Strava` / `Garmin Connect` add: change sport type, edit title /
description, gear / shoes tagging, hide start / end (privacy zones,
geofences), mute from feed, split activity, edit lap times, recompute
calories.

### Shortlist worth integrating into FitFix (ranked)

1. **Strip data streams** (drop HR / power / cadence / GPS / temp /
   barometer). Table-stakes for FIT editors, **and Strava can't do
   this**, so it's also a differentiator on its own.
2. **Privacy zones / hide start-end** by geofence. The local-only
   browser model is the *correct* place for privacy edits — the data
   never leaves the device. Strong differentiator.
3. **Split activity** at a chosen point or lap. Cheap given trim
   infrastructure already exists.
4. **Sport-type & metadata editor** (sport, sub-sport, name,
   description, gear / device serial). fitfiletools' "Changer" is
   popular and survives roundtrip; small code.
5. **Spike fixer** for power + HR + speed with adjustable threshold and
   live preview, unifying GoldenCheetah's `FixSpikes` / `FixHRSpikes`
   / `FixSpeed` into one panel.
6. **Time-shift / timezone repair** — common pain when device TZ is
   wrong on upload. One-line transform, big quality-of-life win.
7. **Lap editor** — add / remove / rename / merge laps and recompute
   lap stats. Neither Strava nor Garmin lets you add laps post-hoc; a
   clear differentiator for runners doing manual interval recovery.
8. **Shrink / downsample** (1 Hz throttle, drop redundant fields) for
   files that are too big for Strava upload. Niche but loved; pairs
   with the stripper.

### Differentiators vs. catch-up

- **Differentiators:** privacy zones, lap editor, spike fixer with
  live preview, sport / gear changer that round-trips cleanly.
- **Table-stakes catch-up:** stripper, split, time-shift, shrink.

### Skipped / deferred

- **Calorie / TSS recompute** — depends on per-user FTP / HR-zone
  state, out of scope for a stateless local editor.
- **GPS race repair from course file** (GOTOES) — niche, v3+.
- **`FixPy` user scripting** — over-scoped for v2.
- **FIT → CSV** — already covered by multi-format export.
- **Cloud gear / equipment lifecycle** (rubiTrack / RunGap) — violates
  the local-only model.

## Product positioning — what FitFix is *not*

A clear statement of scope, since the feature catalog above could
easily justify a 3-year Cheetah-clone roadmap. FitFix is deliberately
not that.

- **Not a training analytics platform.** No FTP, no zones, no TSS, no
  power curves, no aerobic decoupling, no PMC. If you want that, use
  GoldenCheetah.
- **Not a power-user editor.** No scripting, no raw-record table
  editing, no per-channel formula language. The eight `Fix*` plugins
  we ship cover the 90 % case in one panel each; for the long tail of
  GoldenCheetah's 19 `Fix*` plugins, we send the user to GoldenCheetah.
- **Not a sync / library / archive tool.** No accounts, no cloud, no
  history of past activities. One file in, one file out.
- **Not a viewer.** The detail view exists to support editing, not as
  a destination. People who just want to look at their activity have
  Strava and Garmin Connect.

What FitFix **is**: an advisor-led, single-file, browser-only fixer.
The user drops a file, the advisor proposes the small number of fixes
that are likely to be relevant, the user applies the ones they want,
and they export. The whole interaction should be doable in 60 seconds
without reading any docs.

The comparison matrix at the top of this document should make this
positioning obvious — for any feature outside FitFix's scope, the
matrix should explicitly point readers to the tool that does it well
(usually GoldenCheetah for power-user work, GOTOES for niche merge
cases, fitfiletools for one-off cloud edits).

## Reference source: GoldenCheetah

GoldenCheetah is the canonical open-source reference for FIT-file
edits and we treat it as authoritative for correctness, even though it
is not a competitor in the same product slot.

- Repository: <https://github.com/GoldenCheetah/GoldenCheetah>
- Licence: GPL — compatible with reading and porting algorithms as
  long as derivative work is also GPL or the algorithm is reimplemented
  cleanly from documented behaviour.
- Useful subtrees:
  - `src/FileIO/` — FIT / TCX / GPX / SRM / PWX parsers and writers,
    canonical reference for round-trip fidelity.
  - `src/FileIO/Fix*.cpp` — the 19 `Fix*` plugins, one file each.
    Read these when implementing a fix to see what edge cases the
    Cheetah authors hit.
  - `src/Core/RideFile.cpp` — the in-memory activity representation;
    a good model for FitFix's normalised internal type.

Practical use: when in doubt about how to handle a malformed field,
an unusual sport sub-type, or a sensor-specific quirk, consult the
matching Cheetah file before inventing behaviour. We are a different
product but the underlying data model is the same.

## Demand validation — Reddit / forum signal

We sampled ~157 high-upvote posts across r/Garmin, r/Strava, r/cycling,
r/running, r/AdvancedRunning, r/triathlon, r/Wahoofitness, r/MTB,
r/fenix, r/bikecommuting and tagged each by complaint type. Frequency
counts in the sample (most frequent first):

| Pain point | Posts | Frequency | FitFix feature | Match |
|---|---|---|---|---|
| Watch died / split into two files | 35 | weekly | merge | direct hit |
| Elevation wrong (Garmin vs Strava vs DEM) | 24 | weekly | elevation fix | direct hit |
| Forgot to start or stop activity | 10 | monthly+ | trim, suspicious start/end | direct hit |
| HR / power spikes ruining metrics | 9 | monthly | spike fixer, strip streams | direct hit |
| Privacy zones / hide home | 9 | monthly | privacy zones | direct hit |
| Forgot to stop, drove home | 6 | monthly | trim + suspicious end | direct hit |
| Split activity (brick / multisport) | 3 | occasional | split | modest |
| Timezone wrong | 2 | rare | time-shift | small |

Representative quotes:

- *"It is not uncommon for someone to forget to 'start' or 'stop' their
  activity… it would be insanely helpful to allow to 'crop' an activity
  by time"* — r/Strava, 48 upvotes
- *"At the end of a hike I remember to quit the activity only after I
  start driving"* — r/Garmin
- *"My VO2 max spiked up 10 points in one run… no way to remove this
  permanent metric anomaly"* — r/Garmin
- *"Privacy zones are a privacy facade"* — r/Strava, 10 upvotes (users
  want stronger client-side scrubbing)
- Strava's own support page links users to third-party FIT spike
  removers — they admit they don't solve it

### Features with near-zero demand in the sample

This is the uncomfortable part of the research and the most useful one:

- **GPS jitter / "watch sat still and GPS wandered" / loop-detect**:
  **0 matching posts.** Users do complain about GPS drift, but in
  caves, dense forests, urban canyons — *while moving*, not while
  stationary at a café. The "sat still and the track meandered"
  framing — which is the spec for FitFix's existing Clean feature
  *and* the proposed back-and-forth detector — is a developer-observed
  problem, not a community complaint. **This is significant: we have
  been positioning loop-detection as the wedge differentiator, and the
  forum signal does not validate that positioning.** Either the
  detector needs to be reframed against the actual complaint (drift
  while moving, not while still), or the wedge needs to be moved
  elsewhere.
- **Lap editor** (add laps post-hoc): 1 match, and that one was about
  Strava recording from phone, not editing FIT laps. Niche.
- **Shrink / file-too-big-for-Strava**: 0 matches. Strava's 25 MB
  limit is rarely hit.
- **Sport-type changer**: 0 matches. Strava's web UI already lets you
  change sport type trivially — not a real pain.

### Complaints surfacing repeatedly but NOT on the FitFix roadmap

These are v3 signal — features people actually want that we haven't
considered:

- **"Mark as virtual / strip GPS" for indoor / Zwift activities**
  flagged by Strava as "in a vehicle". One of these posts had 84
  upvotes. Easy to ship: a one-click "this is indoor, drop GPS"
  action, which is essentially a focused use of the existing strip
  feature.
- **Undo a bad HR sample that poisoned Garmin Connect's training
  metrics** (VO2 max, recovery, training status). Hard product —
  requires Garmin Connect re-upload flow; the underlying file fix is
  trivial but the round-trip story isn't. Defer.
- **Wrong gear assignment** (indoor vs outdoor bike logged to same
  gear). Garmin Connect side, not file side. Skip.

### Honest take

FitFix's top three intended features (merge, elevation fix, trim)
match the top three user complaints exactly. Spike fixer and privacy
zones are also validated. **But the GPS-jitter / loop-detect detector,
which we had been treating as the headline differentiator, doesn't
appear in the forum signal.** The advisor-led, local-only,
60-second-flow UX is still a real wedge — but the *content* of the
flagship suggestion needs revisiting.

## Market sizing

Quick calibration on audience size (StatShow / Similarweb / SERP
analysis, no paid tooling):

- **fitfiletools.com**: ~36 k monthly visitors, ~80 k pageviews, 11
  years old, ad-free, single-purpose. This is the floor for "people
  genuinely need this."
- **gotoes.org**: estimates vary 30 k–139 k/month; real number
  probably 30 k–80 k/month.
- **jasonkuperberg, fitfileviewer, fitedit.io, sport-calculator**:
  no public traffic data; collectively another 20 k–80 k/month.

Total addressable category: roughly **100 k–200 k visitors/month
worldwide**, fragmented across 6–8 tools. Not the floor, the ceiling.

Realistic FitFix capture at maturity, with polish + SEO + a DC
Rainmaker / the5krunner / FIT File Podcast mention: **5 k–15 k
visitors/month**. Counter-pressures: Strava and Garmin Connect both
keep adding native edits (Strava added vehicle-detection auto-flag in
Feb 2025); mobile-first users won't use a browser tool.

Honest framing: meaningful for one motivated maintainer, not
meaningful as a business. The user explicitly does not need to
monetize, so the "people will use it and get value" bar is well above
hobby-traffic — that's already validated.

## Multi-vendor support — surprisingly cheap

FIT-the-format is genuinely universal across vendors. Wahoo, Coros,
Polar, Bryton, Lezyne, Hammerhead Karoo, Stages Dash, Suunto-modern,
Zwift — all parse with the same stock FIT message profile. Only the
`manufacturer` field varies; the message schemas are shared.
Vendor-proprietary developer fields (Polar Training Load, Coros HRV)
should be treated as opaque pass-through, not interpreted.

GPX 1.1 with `TrackPointExtension` v1/v2 covers Strava, Komoot,
RideWithGPS, Outdooractive, and Apple Health route GPX. TCX from
Polar Flow and older Garmin parses cleanly.

**v1 import surface (no extra parser cost):**
- Any FIT regardless of manufacturer
- GPX 1.1 (with extensions preserved but uninterpreted)
- TCX

**Defer to v2 / skip:**
- Apple Health full ZIP export (UX complexity, not parser complexity —
  500 MB+ XML bundles need streaming).
- Suunto `.sml` legacy format (separate parser, small audience).

This means FitFix can market as "any FIT file" honestly, with the GPX
caveat that vendor extensions are preserved but not interpreted. Costs
roughly nothing extra to ship.

## Licensing — green light for MIT

The official **Garmin FIT SDK** (Java / C / C++ / JS / Swift,
including `garmin/fit-javascript-sdk`) ships under the proprietary
"FIT Protocol License Agreement", which explicitly forbids OSS
redistribution (§2c, §2d) and grants Garmin perpetual rights over any
modifications (§5). It is **not OSS-compatible** and cannot be bundled
in an MIT/Apache-2.0 PWA.

**FitFix is already clean.** The repo's `package.json` has zero FIT
parser dependencies — the parser is hand-written in
`src/lib/fit.ts` + `src/lib/merge.ts` (528 LOC, byte-level encoder).
This is the same pattern GoldenCheetah uses (`src/FileIO/FitRideFile.cpp`
is clean-room from the public protocol docs).

**Verdict**: keep MIT, keep the in-house parser, never import the
Garmin SDK. If a JS parser is ever wanted, `fit-file-parser` (MIT)
and `@markw65/fit-file-parser` (MIT) are clean. The FIT binary
**format** is openly documented and using it is permitted (§1); only
the SDK source code is restricted.

Watch-outs:
1. Don't paste enums, message numbers, or test fixtures from the
   Garmin SDK source. Re-derive from public protocol docs (allowed).
2. Don't use Garmin trademarks / logos. Descriptive nominative use
   ("works with Garmin Connect", ".FIT files") is fine.
3. Reject any contributor PR that adds the Garmin SDK as a dependency.
4. Add a "not affiliated with Garmin" disclaimer in the README.

GPX is public domain. TCX schema is freely usable.

## Recommendation

Worth building, with the wedge **revised** based on the demand
research:

- **Original wedge** (loop-detection / GPS jitter): not validated by
  forum signal. People do not complain about "I sat still and the
  watch wandered". Keep the detector — it's still useful when it
  fires — but stop treating it as the marketing centrepiece.
- **Revised wedge**: the **advisor-led 60-second flow**, applied to
  the four complaints that actually trend on Reddit and the Garmin /
  Strava forums:
  1. Merge the file your watch split when the battery died.
  2. Fix the elevation that doesn't match the map.
  3. Trim the start / end you forgot.
  4. Strip / fix the spike that's poisoning your metrics.
  All four already exist in the proposed roadmap. The product
  positioning should lead with **these four**, not with loop
  detection.
- **Bonus differentiators** that the research surfaced: privacy
  zones (genuine pain, "privacy facade" complaints recurring), and
  "mark as virtual / strip GPS" for Zwift activities flagged as
  in-vehicle (84-upvote post, easy ship via the strip feature).

Stay ruthless about scope: skip lap editor, shrink, sport-type
changer, calorie / TSS recompute. They surfaced in zero or one Reddit
threads; we'd be solving developer-imagined problems.

The audience is real (~30 k–100 k people/month touch this category)
but small. Build it because users will get value, not because it'll
scale. Both the licensing and the multi-vendor format situation are
green-lit — there is no IP or technical blocker to shipping a polished
MIT-licensed PWA that handles every common FIT/GPX/TCX file.
