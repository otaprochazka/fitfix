/**
 * FIT → TCX 1.0 (Garmin TrainingCenterDatabase v2) converter.
 *
 * Walks the raw FIT byte stream with `walkMessages` + `readField` — the same
 * pattern as `fitToGpx.ts` — and produces a valid TCX XML string. No external
 * XML library; all output is hand-rolled string concatenation.
 *
 * ## Lossy fields / caveats
 * - **Temperature** is dropped: TCX has no standard element for it.
 * - **FIT laps are flattened** to a single TCX `<Lap>`.  Multi-lap TCX export
 *   is deferred to v2 (Phase 17+).
 * - **Developer fields**, **Garmin-proprietary extensions**, and all message
 *   types other than record (20), session (18) and file_id (0) are ignored.
 * - **Indoor activities** (no GPS) produce `<Trackpoint>` elements without
 *   `<Position>` — this is valid per the TCX schema.
 * - FIT `enhanced_altitude` (field 78) and `enhanced_speed` (field 73) are
 *   preferred over their standard counterparts when present, exactly as
 *   `fitToGpx.ts` does.
 *
 * ## Sport mapping
 * FIT session sport (msg 18, field 5):
 *   1 → "Running", 2 → "Biking", anything else → "Other"
 */

import {
  walkMessages, readField, FIT_EPOCH_S, SC_TO_DEG, type FitDef,
} from '../../fit'

// ---- FIT message / field constants -------------------------------------

const MSG_RECORD  = 20
const MSG_SESSION = 18

// ---- TCX sport mapping -------------------------------------------------

function fitSportToTcx(sport: number | null): string {
  if (sport === 1) return 'Running'
  if (sport === 2) return 'Biking'
  return 'Other'
}

// ---- Altitude / speed helpers (mirrors fitToGpx.ts) --------------------

function readEle(data: Uint8Array, body: number, def: FitDef): number | undefined {
  // Prefer enhanced_altitude (field 78, uint32, scale 5, offset 500)
  const enh = readField(data, body, def, 78, 'uint32')
  if (enh != null) return enh / 5 - 500
  const alt = readField(data, body, def, 2, 'uint16')
  if (alt != null) return alt / 5 - 500
  return undefined
}

function readSpeed(data: Uint8Array, body: number, def: FitDef): number | undefined {
  // Prefer enhanced_speed (field 73, uint32, scale 1000)
  const enh = readField(data, body, def, 73, 'uint32')
  if (enh != null) return enh / 1000
  const sp = readField(data, body, def, 6, 'uint16')
  if (sp != null) return sp / 1000
  return undefined
}

// ---- XML helpers -------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function tag(name: string, value: string | number): string {
  return `<${name}>${value}</${name}>`
}

// ---- Internal point shape ----------------------------------------------

interface TcxPoint {
  ts: Date
  lat?: number
  lon?: number
  altM?: number
  distM?: number
  hr?: number
  cadence?: number
  speedMs?: number
  watts?: number
}

// ---- Return type -------------------------------------------------------

export interface FitToTcxResult {
  tcx: string
  pointCount: number
  distanceM: number
  elapsedS: number
}

// ---- Main export -------------------------------------------------------

/**
 * Convert a FIT byte stream to a Garmin TCX 1.0 (TrainingCenterDatabase v2)
 * XML string.
 *
 * @param bytes Raw FIT file bytes.
 * @returns `{ tcx, pointCount, distanceM, elapsedS }`
 *
 * **Lossy fields** (see module-level JSDoc for full list):
 * - Temperature is dropped (no standard TCX element).
 * - All FIT laps are flattened into one TCX `<Lap>`.
 * - Developer fields and proprietary extensions are ignored.
 */
export function fitToTcx(bytes: Uint8Array): FitToTcxResult {
  const points: TcxPoint[] = []
  let sportNum: number | null = null
  let sessionCalories: number | undefined
  let sessionDistCm: number | undefined  // raw uint32 from session, cm

  for (const m of walkMessages(bytes)) {
    if (m.kind !== 'data') continue
    const { def } = m
    const body = m.bodyOffset

    // --- Session (18) ---------------------------------------------------
    if (def.globalNum === MSG_SESSION) {
      if (sportNum == null) {
        sportNum = readField(bytes, body, def, 5, 'uint8')
      }
      const cal = readField(bytes, body, def, 11, 'uint16')
      if (cal != null) sessionCalories = cal

      const distRaw = readField(bytes, body, def, 9, 'uint32')
      if (distRaw != null) sessionDistCm = distRaw
      continue
    }

    // --- Record (20) ----------------------------------------------------
    if (def.globalNum !== MSG_RECORD) continue

    const tsRaw = readField(bytes, body, def, 253, 'uint32')
    if (tsRaw == null) continue

    const ts = new Date((FIT_EPOCH_S + tsRaw) * 1000)

    const latSc = readField(bytes, body, def, 0, 'sint32')
    const lonSc = readField(bytes, body, def, 1, 'sint32')
    const lat = latSc != null ? latSc * SC_TO_DEG : undefined
    const lon = lonSc != null ? lonSc * SC_TO_DEG : undefined

    const distRaw = readField(bytes, body, def, 5, 'uint32')
    const distM = distRaw != null ? distRaw / 100 : undefined

    const hrRaw = readField(bytes, body, def, 3, 'uint8')
    const hr = hrRaw != null && hrRaw !== 0xff ? hrRaw : undefined

    const cadence = readField(bytes, body, def, 4, 'uint8') ?? undefined
    const altM = readEle(bytes, body, def)
    const speedMs = readSpeed(bytes, body, def)
    const wattsRaw = readField(bytes, body, def, 7, 'uint16')
    const watts = wattsRaw != null ? wattsRaw : undefined

    points.push({ ts, lat, lon, altM, distM, hr, cadence, speedMs, watts })
  }

  // Sort chronologically (FIT definitions can be re-emitted mid-stream)
  points.sort((a, b) => a.ts.getTime() - b.ts.getTime())

  // ---- Aggregate stats --------------------------------------------------
  const firstTs = points[0]?.ts
  const lastTs  = points[points.length - 1]?.ts
  const elapsedS = (firstTs && lastTs)
    ? (lastTs.getTime() - firstTs.getTime()) / 1000
    : 0

  // Prefer session distance; fall back to last record's cumulative distance
  const distanceM = sessionDistCm != null
    ? sessionDistCm / 100
    : (points[points.length - 1]?.distM ?? 0)

  let maxSpeed = 0
  let hrSum = 0; let hrCount = 0; let maxHr = 0
  for (const p of points) {
    if (p.speedMs != null && p.speedMs > maxSpeed) maxSpeed = p.speedMs
    if (p.hr != null) {
      hrSum += p.hr; hrCount++
      if (p.hr > maxHr) maxHr = p.hr
    }
  }
  const avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : undefined

  // ---- TCX sport --------------------------------------------------------
  const tcxSport = fitSportToTcx(sportNum)
  const lapStartTime = firstTs?.toISOString() ?? new Date().toISOString()

  // ---- Build XML --------------------------------------------------------
  const L: string[] = []

  L.push('<?xml version="1.0" encoding="UTF-8"?>')
  L.push(
    '<TrainingCenterDatabase' +
    ' xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2' +
    ' http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"' +
    ' xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:tpx="http://www.garmin.com/xmlschemas/ActivityExtension/v2">',
  )
  L.push('  <Activities>')
  L.push(`    <Activity Sport="${esc(tcxSport)}">`)
  L.push(`      ${tag('Id', esc(lapStartTime))}`)
  L.push(`      <Lap StartTime="${esc(lapStartTime)}">`)
  L.push(`        ${tag('TotalTimeSeconds', elapsedS.toFixed(0))}`)
  L.push(`        ${tag('DistanceMeters', distanceM.toFixed(2))}`)
  if (maxSpeed > 0) L.push(`        ${tag('MaximumSpeed', maxSpeed.toFixed(3))}`)
  if (sessionCalories != null) L.push(`        ${tag('Calories', sessionCalories)}`)
  if (avgHr != null) L.push(`        <AverageHeartRateBpm>${tag('Value', avgHr)}</AverageHeartRateBpm>`)
  if (maxHr > 0)    L.push(`        <MaximumHeartRateBpm>${tag('Value', maxHr)}</MaximumHeartRateBpm>`)
  L.push(`        ${tag('Intensity', 'Active')}`)
  L.push(`        ${tag('TriggerMethod', 'Manual')}`)
  L.push('        <Track>')

  for (const p of points) {
    L.push('          <Trackpoint>')
    L.push(`            ${tag('Time', p.ts.toISOString())}`)
    if (p.lat != null && p.lon != null) {
      L.push('            <Position>')
      L.push(`              ${tag('LatitudeDegrees', p.lat.toFixed(7))}`)
      L.push(`              ${tag('LongitudeDegrees', p.lon.toFixed(7))}`)
      L.push('            </Position>')
    }
    if (p.altM != null)  L.push(`            ${tag('AltitudeMeters', p.altM.toFixed(2))}`)
    if (p.distM != null) L.push(`            ${tag('DistanceMeters', p.distM.toFixed(2))}`)
    if (p.hr != null)    L.push(`            <HeartRateBpm>${tag('Value', p.hr)}</HeartRateBpm>`)
    if (p.cadence != null) L.push(`            ${tag('Cadence', p.cadence)}`)

    // Extensions: Speed and/or Watts
    if (p.speedMs != null || p.watts != null) {
      L.push('            <Extensions>')
      L.push('              <tpx:TPX>')
      if (p.speedMs != null) L.push(`                ${tag('tpx:Speed', p.speedMs.toFixed(3))}`)
      if (p.watts != null)   L.push(`                ${tag('tpx:Watts', p.watts)}`)
      L.push('              </tpx:TPX>')
      L.push('            </Extensions>')
    }

    L.push('          </Trackpoint>')
  }

  L.push('        </Track>')
  L.push('      </Lap>')
  L.push('    </Activity>')
  L.push('  </Activities>')
  L.push('</TrainingCenterDatabase>')

  return {
    tcx: L.join('\n') + '\n',
    pointCount: points.length,
    distanceM,
    elapsedS,
  }
}
