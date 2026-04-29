/**
 * GPX 1.1 importer for FitFix.
 *
 * Produces the same `NormalizedActivity` shape as `parseFitActivity` so
 * detectors, panels, and exporters work unmodified.
 *
 * @remarks
 * **Byte mutability**: `NormalizedActivity.bytes` holds the original GPX text
 * bytes. FIT-level edits (writeField / recomputeFileCrc) cannot be applied to
 * XML; they are a no-op for GPX files. Read-only operations — the advisor
 * scan, the map view, and re-export to GPX/TCX — work fine. Edit tools that
 * re-emit a fresh file from points (privacy clip, trim, split, strip-stream)
 * also work because they don't depend on FIT bytes.
 *
 * **Sport mapping**: GPX has no standardised sport field. `meta.sport` is
 * always null in this parser.
 *
 * **Multi-track files**: all `<trk>` and `<trkseg>` elements are flattened
 * into a single point stream in document order.
 *
 * **Extensions**: the parser recognises Garmin TrackPointExtension v1/v2
 * (`gpxtpx:hr`, `gpxtpx:cad`, `gpxtpx:atemp`, `gpxtpx:speed`) and a plain
 * `<power>` element used by some bike computers.
 */

import { DOMParser as XmldomParser } from '@xmldom/xmldom'
import type { NormalizedActivity, ActivityPoint, ActivityMeta } from '../../activity'

const TPX_NS_V2 = 'http://www.garmin.com/xmlschemas/TrackPointExtension/v2'
const TPX_NS_V1 = 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1'

function getText(parent: Element, localName: string): string | null {
  const els = parent.getElementsByTagName(localName)
  if (els.length === 0) return null
  return els[0].textContent?.trim() ?? null
}

function getFloatAttr(el: Element, name: string): number | null {
  const v = el.getAttribute(name)
  if (v == null) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

/** Read a number from a TrackPointExtension child by local name, trying
 * both the prefixed-tag and namespaced lookups (xmldom keeps the prefix on
 * `tagName` but exposes `localName` separately). */
function readTpxNumber(tp: Element, localName: string): number | null {
  // Try common prefixed names first — these match `getElementsByTagName`
  // on xmldom regardless of which namespace the file declares.
  for (const tag of [`gpxtpx:${localName}`, `ns3:${localName}`, localName]) {
    const els = tp.getElementsByTagName(tag)
    if (els.length > 0) {
      const txt = els[0].textContent?.trim()
      if (txt) {
        const n = parseFloat(txt)
        if (!isNaN(n)) return n
      }
    }
  }
  for (const ns of [TPX_NS_V2, TPX_NS_V1]) {
    const els = tp.getElementsByTagNameNS(ns, localName)
    if (els.length > 0) {
      const txt = els[0].textContent?.trim()
      if (txt) {
        const n = parseFloat(txt)
        if (!isNaN(n)) return n
      }
    }
  }
  return null
}

function parseTrackpoint(tp: Element, idx: number): ActivityPoint | null {
  const timeText = getText(tp, 'time')
  if (!timeText) return null
  const ts = new Date(timeText)
  if (isNaN(ts.getTime())) return null

  const lat = getFloatAttr(tp, 'lat')
  const lon = getFloatAttr(tp, 'lon')

  const eleText = getText(tp, 'ele')
  const altitude = eleText != null && !isNaN(parseFloat(eleText))
    ? parseFloat(eleText)
    : null

  const hrRaw = readTpxNumber(tp, 'hr')
  const hr = hrRaw != null ? Math.round(hrRaw) : null
  const cadRaw = readTpxNumber(tp, 'cad')
  const cadence = cadRaw != null ? Math.round(cadRaw) : null
  const temperature = readTpxNumber(tp, 'atemp')
  const speed = readTpxNumber(tp, 'speed')

  // <power> is a flat element on some bike-computer exports (no namespace).
  let power: number | null = null
  const powerEls = tp.getElementsByTagName('power')
  if (powerEls.length > 0) {
    const v = powerEls[0].textContent?.trim()
    if (v) {
      const n = parseFloat(v)
      if (!isNaN(n)) power = n
    }
  }

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
    temperature,
    distance: null, // GPX does not carry cumulative distance per trackpoint
  }
}

/**
 * Parse a GPX file (raw bytes) into a `NormalizedActivity`.
 *
 * @param bytes - Raw file bytes; decoded as UTF-8 before XML parsing.
 * @param filename - Original filename, surfaced in the UI.
 */
export function parseGpxActivity(bytes: Uint8Array, filename: string): NormalizedActivity {
  const xml = new TextDecoder('utf-8').decode(bytes)
  const doc = new XmldomParser().parseFromString(xml, 'application/xml') as unknown as Document

  const parseErr = doc.getElementsByTagName('parsererror')
  if (parseErr.length > 0) {
    throw new Error(`GPX parse error: ${parseErr[0].textContent?.trim()}`)
  }

  const tracks = doc.getElementsByTagName('trk')
  if (tracks.length === 0) {
    throw new Error('GPX file contains no <trk> elements.')
  }

  const allPoints: ActivityPoint[] = []
  for (let ti = 0; ti < tracks.length; ti++) {
    const trk = tracks[ti] as Element
    const segs = trk.getElementsByTagName('trkseg')
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si] as Element
      const pts = seg.getElementsByTagName('trkpt')
      for (let pi = 0; pi < pts.length; pi++) {
        const pt = parseTrackpoint(pts[pi] as Element, allPoints.length)
        if (pt != null) allPoints.push(pt)
      }
    }
  }

  allPoints.sort((a, b) => a.ts.getTime() - b.ts.getTime())
  allPoints.forEach((p, i) => { p.recordIdx = i })

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

  // Cumulative distance from haversine over consecutive points with GPS.
  let totalDistanceM: number | null = null
  let acc = 0
  let any = false
  for (let i = 1; i < allPoints.length; i++) {
    const a = allPoints[i - 1]
    const b = allPoints[i]
    if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue
    acc += haversineM(a.lat, a.lon, b.lat, b.lon)
    any = true
  }
  if (any) totalDistanceM = acc

  const hasGps = allPoints.some(p => p.lat != null && p.lon != null)

  const meta: ActivityMeta = {
    source: 'gpx',
    sport: null,
    subSport: null,
    manufacturer: null,
    product: null,
    startTs: allPoints.length > 0 ? allPoints[0].ts : null,
    endTs: allPoints.length > 0 ? allPoints[allPoints.length - 1].ts : null,
    totalDistanceM,
    totalAscentM: totalAscentM > 0 ? totalAscentM : null,
    totalDescentM: totalDescentM > 0 ? totalDescentM : null,
    totalCalories: null,
    indoor: !hasGps,
  }

  return { bytes, filename, meta, points: allPoints }
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}
