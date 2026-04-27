/**
 * FIT → GPX 1.1 converter. Reads records (timestamp / position / altitude /
 * heart rate / cadence / temperature / speed) and emits a single <trk> with
 * one <trkseg>. Garmin TrackPointExtension v2 namespace is used for
 * non-standard fields.
 *
 * Self-contained: no XML library, just string concatenation. The output is
 * UTF-8 valid XML with all attribute and text values properly escaped.
 */

import {
  walkMessages, readField, FIT_EPOCH_S, SC_TO_DEG, type FitDef,
} from './fit'

const RECORD = 20
const SESSION = 18
const FILE_ID = 0
const SPORT_MSG = 12

// FIT sport enum → GPX <type> string (Strava and other consumers recognise these)
const SPORT_TO_GPX: Record<number, string> = {
  0: 'Generic',
  1: 'Running',
  2: 'Cycling',
  3: 'Transition',
  4: 'Fitness Equipment',
  5: 'Swimming',
  6: 'Basketball',
  7: 'Soccer',
  8: 'Tennis',
  9: 'American Football',
  10: 'Training',
  11: 'Walking',
  12: 'Cross Country Skiing',
  13: 'Alpine Skiing',
  14: 'Snowboarding',
  15: 'Rowing',
  16: 'Mountaineering',
  17: 'Hiking',
  18: 'Multisport',
  19: 'Paddling',
  20: 'Flying',
  21: 'E-Biking',
  22: 'Motorcycling',
  23: 'Boating',
  24: 'Driving',
  25: 'Golf',
  26: 'Hang Gliding',
  27: 'Horseback Riding',
  28: 'Hunting',
  29: 'Fishing',
  30: 'Inline Skating',
  31: 'Rock Climbing',
  32: 'Sailing',
  33: 'Ice Skating',
  34: 'Sky Diving',
  35: 'Snowshoeing',
  36: 'Snowmobiling',
  37: 'Stand Up Paddleboarding',
  38: 'Surfing',
  39: 'Wakeboarding',
  40: 'Water Skiing',
  41: 'Kayaking',
  42: 'Rafting',
  43: 'Windsurfing',
  44: 'Kitesurfing',
}

interface TrackPoint {
  lat: number
  lon: number
  ts: Date
  ele?: number     // meters
  hr?: number      // bpm
  cad?: number     // rpm
  temp?: number    // °C
  speed?: number   // m/s
}

export interface FitToGpxOptions {
  /** Override the activity name in <metadata>/<name>. */
  name?: string
  /** Override the creator string in <gpx creator="…">. */
  creator?: string
}

export interface FitToGpxResult {
  gpx: string
  pointCount: number
  sport?: string
  startTs?: Date
  endTs?: Date
  totalDistanceM?: number
}

export function fitToGpx(data: Uint8Array, opts: FitToGpxOptions = {}): FitToGpxResult {
  const points: TrackPoint[] = []
  let sportNum: number | null = null
  let totalDistanceM: number | undefined

  for (const m of walkMessages(data)) {
    if (m.kind !== 'data') continue
    const def = m.def
    const body = m.bodyOffset
    if (def.globalNum === RECORD) {
      const tsRaw = readField(data, body, def, 253, 'uint32')
      const latSc = readField(data, body, def, 0, 'sint32')
      const lonSc = readField(data, body, def, 1, 'sint32')
      if (tsRaw == null || latSc == null || lonSc == null) continue
      points.push({
        lat: latSc * SC_TO_DEG,
        lon: lonSc * SC_TO_DEG,
        ts: new Date((FIT_EPOCH_S + tsRaw) * 1000),
        ele: readEle(data, body, def),
        hr:  readField(data, body, def, 3, 'uint8') ?? undefined,
        cad: readField(data, body, def, 4, 'uint8') ?? undefined,
        temp: readField(data, body, def, 13, 'sint8') ?? undefined,
        speed: readSpeed(data, body, def),
      })
    } else if (def.globalNum === SESSION) {
      sportNum = readField(data, body, def, 5, 'uint8')
      const distRaw = readField(data, body, def, 9, 'uint32')
      if (distRaw != null) totalDistanceM = distRaw / 100
    } else if (def.globalNum === SPORT_MSG && sportNum == null) {
      sportNum = readField(data, body, def, 0, 'uint8')
    }
  }

  points.sort((a, b) => a.ts.getTime() - b.ts.getTime())

  const sportLabel = sportNum != null ? SPORT_TO_GPX[sportNum] ?? 'Activity' : 'Activity'
  const name = opts.name ?? `${sportLabel} ${formatDate(points[0]?.ts)}`.trim()
  const creator = opts.creator ?? 'FitFix (https://fitfix.vercel.app)'

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(
    '<gpx version="1.1" ' +
    `creator="${esc(creator)}" ` +
    'xmlns="http://www.topografix.com/GPX/1/1" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v2" ' +
    'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd ' +
    'http://www.garmin.com/xmlschemas/TrackPointExtension/v2 http://www.garmin.com/xmlschemas/TrackPointExtensionv2.xsd">',
  )
  lines.push('  <metadata>')
  lines.push(`    <name>${esc(name)}</name>`)
  if (points.length > 0) lines.push(`    <time>${points[0].ts.toISOString()}</time>`)
  lines.push('  </metadata>')
  lines.push('  <trk>')
  lines.push(`    <name>${esc(name)}</name>`)
  lines.push(`    <type>${esc(sportLabel)}</type>`)
  lines.push('    <trkseg>')
  for (const p of points) {
    lines.push(`      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">`)
    if (p.ele != null) lines.push(`        <ele>${p.ele.toFixed(2)}</ele>`)
    lines.push(`        <time>${p.ts.toISOString()}</time>`)
    const ext = trackPointExt(p)
    if (ext) lines.push(ext)
    lines.push('      </trkpt>')
  }
  lines.push('    </trkseg>')
  lines.push('  </trk>')
  lines.push('</gpx>')

  return {
    gpx: lines.join('\n') + '\n',
    pointCount: points.length,
    sport: sportNum != null ? sportLabel : undefined,
    startTs: points[0]?.ts,
    endTs: points[points.length - 1]?.ts,
    totalDistanceM,
  }
}

function readEle(data: Uint8Array, body: number, def: FitDef): number | undefined {
  // Prefer enhanced_altitude (field 78) over altitude (field 2). Both: scale 5, offset 500
  const enh = readField(data, body, def, 78, 'uint32')
  if (enh != null) return enh / 5 - 500
  const alt = readField(data, body, def, 2, 'uint16')
  if (alt != null) return alt / 5 - 500
  return undefined
}

function readSpeed(data: Uint8Array, body: number, def: FitDef): number | undefined {
  // Prefer enhanced_speed (field 73, scale 1000) over speed (field 6, scale 1000)
  const enh = readField(data, body, def, 73, 'uint32')
  if (enh != null) return enh / 1000
  const sp = readField(data, body, def, 6, 'uint16')
  if (sp != null) return sp / 1000
  return undefined
}

function trackPointExt(p: TrackPoint): string | null {
  const inner: string[] = []
  if (p.hr != null) inner.push(`          <gpxtpx:hr>${p.hr}</gpxtpx:hr>`)
  if (p.cad != null) inner.push(`          <gpxtpx:cad>${p.cad}</gpxtpx:cad>`)
  if (p.temp != null) inner.push(`          <gpxtpx:atemp>${p.temp}</gpxtpx:atemp>`)
  if (p.speed != null) inner.push(`          <gpxtpx:speed>${p.speed.toFixed(3)}</gpxtpx:speed>`)
  if (!inner.length) return null
  return [
    '        <extensions>',
    '          <gpxtpx:TrackPointExtension>',
    ...inner,
    '          </gpxtpx:TrackPointExtension>',
    '        </extensions>',
  ].join('\n')
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDate(d?: Date): string {
  if (!d) return ''
  const yy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// Mark unused for tree-shaking-friendly clarity
void FILE_ID
