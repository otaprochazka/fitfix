/**
 * TCX (Training Center XML) importer for FitFix.
 *
 * Produces the same `NormalizedActivity` shape as `parseFitActivity` so that
 * all downstream detectors, panels, and exporters work unmodified.
 *
 * @remarks
 * **Byte mutability**: `NormalizedActivity.bytes` holds the original TCX text
 * bytes. FIT-level edits (writeField / recomputeFileCrc) cannot be applied to
 * XML; they are a no-op for TCX files. Read-only operations — the advisor scan,
 * the map view, GPX export, and future TCX export — work fine. Phase 17 will
 * add a TCX-aware edit path if needed.
 *
 * **Sport mapping**: TCX uses free-text sport strings ("Running", "Biking",
 * "Other"). FIT uses a uint8 enum (0 = generic, 1 = running, 2 = cycling …).
 * A translation table is left as a TODO for v2; `meta.sport` is always null
 * in this parser. `meta.subSport` is similarly null.
 *
 * **Multi-activity files**: only the first `<Activity>` element is parsed.
 * A console warning is emitted when additional activities are present.
 *
 * **Integration note** (Phase 13 → Phase 17): `parseActivity` in
 * `src/lib/activity.ts` currently throws on `.tcx`. Phase 17 will import
 * `parseTcxActivity` from this file and add a dispatch branch. Do NOT edit
 * `activity.ts` in this phase.
 */

import { DOMParser as XmldomParser } from '@xmldom/xmldom'
import type { NormalizedActivity, ActivityPoint, ActivityMeta } from '../../activity'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the text content of the first matching element inside `parent`, or null. */
function getText(parent: Element, localName: string): string | null {
  // getElementsByTagName respects namespace prefixes on some parsers; using
  // localName matching via getElementsByTagName with wildcard is more robust.
  const els = parent.getElementsByTagName(localName)
  if (els.length === 0) return null
  const text = els[0].textContent
  return text?.trim() ?? null
}

/** Parse a float from an element's text content; return null on failure. */
function getFloat(parent: Element, localName: string): number | null {
  const t = getText(parent, localName)
  if (t == null) return null
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

/** Parse an int from an element's text content; return null on failure. */
function getInt(parent: Element, localName: string): number | null {
  const t = getText(parent, localName)
  if (t == null) return null
  const n = parseInt(t, 10)
  return isNaN(n) ? null : n
}

/**
 * Find a `<Speed>` (or `<Watts>`) value inside Garmin's namespaced `<TPX>`
 * extension block. DOMParser exposes `localName` regardless of namespace
 * prefix, so we use getElementsByTagName with the unprefixed tag name and
 * also try the namespace-aware form.
 */
function getExtValue(trackpoint: Element, localName: string): number | null {
  // Try direct tag name first (most parsers strip ns prefix from localName)
  const els = trackpoint.getElementsByTagName(localName)
  if (els.length > 0) {
    const t = els[0].textContent?.trim()
    if (t) {
      const n = parseFloat(t)
      return isNaN(n) ? null : n
    }
  }
  // Fallback: namespace-aware lookup for Garmin ActivityExtension v2
  const NS = 'http://www.garmin.com/xmlschemas/ActivityExtension/v2'
  const nsEls = trackpoint.getElementsByTagNameNS(NS, localName)
  if (nsEls.length > 0) {
    const t = nsEls[0].textContent?.trim()
    if (t) {
      const n = parseFloat(t)
      return isNaN(n) ? null : n
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Trackpoint parser
// ---------------------------------------------------------------------------

function parseTrackpoint(tp: Element, idx: number): ActivityPoint | null {
  const timeText = getText(tp, 'Time')
  if (!timeText) return null
  const ts = new Date(timeText)
  if (isNaN(ts.getTime())) return null

  const latText = getText(tp, 'LatitudeDegrees')
  const lonText = getText(tp, 'LongitudeDegrees')
  const lat = latText != null ? parseFloat(latText) : null
  const lon = lonText != null ? parseFloat(lonText) : null

  const altitude = getFloat(tp, 'AltitudeMeters')
  const distance = getFloat(tp, 'DistanceMeters')
  const cadence = getInt(tp, 'Cadence')

  // HeartRateBpm wraps Value in a child element
  let hr: number | null = null
  const hrBpm = tp.getElementsByTagName('HeartRateBpm')
  if (hrBpm.length > 0) {
    const v = getText(hrBpm[0] as Element, 'Value')
    if (v != null) {
      const n = parseInt(v, 10)
      if (!isNaN(n)) hr = n
    }
  }

  const speed = getExtValue(tp, 'Speed')
  const power = getExtValue(tp, 'Watts')

  return {
    recordIdx: idx,
    ts,
    lat: lat != null && !isNaN(lat) ? lat : null,
    lon: lon != null && !isNaN(lon) ? lon : null,
    altitude,
    speed,
    hr,
    cadence,
    power,
    temperature: null, // TCX has no standard temperature field
    distance,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a TCX file (as raw bytes) into a `NormalizedActivity`.
 *
 * @param bytes - Raw file bytes; decoded as UTF-8 before XML parsing.
 * @param filename - Original filename, surfaced in the UI.
 */
export function parseTcxActivity(bytes: Uint8Array, filename: string): NormalizedActivity {
  const xml = new TextDecoder('utf-8').decode(bytes)

  // xmldom is a pure-JS DOMParser — works in browser, jsdom, plain Node, and
  // future MCP server runtimes alike. Keeps src/lib/ Node-runnable per the
  // dual-target guard in tests/api/dual-target.test.ts.
  const doc = new XmldomParser().parseFromString(xml, 'application/xml') as unknown as Document

  // Check for parse errors (browsers inject a <parsererror> element)
  const parseErr = doc.getElementsByTagName('parsererror')
  if (parseErr.length > 0) {
    throw new Error(`TCX parse error: ${parseErr[0].textContent?.trim()}`)
  }

  const allActivities = doc.getElementsByTagName('Activity')
  if (allActivities.length === 0) {
    throw new Error('TCX file contains no <Activity> elements.')
  }
  if (allActivities.length > 1) {
    console.warn(
      `[fitfix/tcx-import] File "${filename}" contains ${allActivities.length} <Activity> elements; ` +
      'only the first one will be imported. Multi-activity TCX support is planned for v2.',
    )
  }

  const activity = allActivities[0] as Element

  // Collect all trackpoints across all laps, preserving order
  const allPoints: ActivityPoint[] = []
  const laps = activity.getElementsByTagName('Lap')

  let lapCalories = 0
  let lapDistanceM: number | null = null

  for (let li = 0; li < laps.length; li++) {
    const lap = laps[li] as Element

    // Accumulate calories per lap
    const cal = getFloat(lap, 'Calories')
    if (cal != null) lapCalories += cal

    // Last lap's cumulative distance (or per-lap; we'll prefer trackpoint-derived below)
    const lapDist = getFloat(lap, 'DistanceMeters')
    if (lapDist != null) lapDistanceM = (lapDistanceM ?? 0) + lapDist

    // Parse trackpoints in this lap
    const tracks = lap.getElementsByTagName('Track')
    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti] as Element
      const tps = track.getElementsByTagName('Trackpoint')
      for (let pi = 0; pi < tps.length; pi++) {
        const pt = parseTrackpoint(tps[pi] as Element, allPoints.length)
        if (pt != null) allPoints.push(pt)
      }
    }
  }

  // Sort by timestamp (should already be ordered, but guard against edge cases)
  allPoints.sort((a, b) => a.ts.getTime() - b.ts.getTime())
  allPoints.forEach((p, i) => { p.recordIdx = i })

  // Derive ascent / descent from altitude stream
  let totalAscentM = 0
  let totalDescentM = 0
  for (let i = 1; i < allPoints.length; i++) {
    const prev = allPoints[i - 1].altitude
    const curr = allPoints[i].altitude
    if (prev != null && curr != null) {
      const delta = curr - prev
      if (delta > 0) totalAscentM += delta
      else totalDescentM += Math.abs(delta)
    }
  }

  // Prefer last trackpoint's cumulative distance over sum of lap distances,
  // since some devices reset DistanceMeters per lap.
  const lastDistFromPoints = allPoints.length > 0
    ? allPoints[allPoints.length - 1].distance
    : null

  // indoor = true if every trackpoint lacks a <Position>
  const hasGps = allPoints.some(p => p.lat != null && p.lon != null)

  const meta: ActivityMeta = {
    source: 'tcx',
    // TODO(v2): map TCX sport strings ("Running", "Biking", "Other") to FIT
    // uint8 enum values. Requires a translation table. Left null for v1.
    sport: null,
    subSport: null,
    // TCX files do not carry device manufacturer / product info in a
    // standardised field (it lives in Creator/Name free text). Left null.
    manufacturer: null,
    product: null,
    startTs: allPoints.length > 0 ? allPoints[0].ts : null,
    endTs: allPoints.length > 0 ? allPoints[allPoints.length - 1].ts : null,
    totalDistanceM: lastDistFromPoints ?? lapDistanceM,
    totalAscentM: totalAscentM > 0 ? totalAscentM : null,
    totalDescentM: totalDescentM > 0 ? totalDescentM : null,
    totalCalories: lapCalories > 0 ? lapCalories : null,
    indoor: !hasGps,
  }

  return { bytes, filename, meta, points: allPoints }
}
