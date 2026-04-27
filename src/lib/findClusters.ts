/**
 * GPS jitter cluster detection. Direct port of the Python find_jitter logic:
 * sliding-window centroid; emit a cluster when ≥N consecutive points stay
 * within `radiusM` of the running centroid for ≥`minDurationS`.
 */

import { haversine, walkMessages, readField, FIT_EPOCH_S, SC_TO_DEG, type FitDef } from './fit'

export interface RecordPoint {
  recordIdx: number   // index in the records list
  ts: Date
  lat: number         // degrees
  lon: number         // degrees
  // Original byte location, useful for byte-level patching later
  bodyOffset: number
  defRef: FitDef
}

export interface JitterCluster {
  number: number              // 1-based
  idxStart: number            // first record index in cluster
  idxEnd: number              // last record index (inclusive)
  startTs: Date
  endTs: Date
  durationS: number
  nPoints: number
  centroid: { lat: number; lon: number }
  maxExcursionM: number       // max distance any point sits from centroid
  pathLengthM: number         // cumulative segment length walked inside the jitter
  points: { lat: number; lon: number }[]
}

export interface ScanResult {
  records: RecordPoint[]
  clusters: JitterCluster[]
}

export interface ClusterOptions {
  radiusM?: number
  minDurationS?: number
  minPoints?: number
}

const DEFAULTS: Required<ClusterOptions> = {
  radiusM: 25,
  minDurationS: 180,
  minPoints: 20,
}

/** Walk a FIT file and pull out every GPS-bearing record. */
export function extractRecords(data: Uint8Array): RecordPoint[] {
  const records: RecordPoint[] = []
  let recordIdx = 0
  for (const m of walkMessages(data)) {
    if (m.kind !== 'data' || m.def.globalNum !== 20) continue
    const ts = readField(data, m.bodyOffset, m.def, 253, 'uint32')
    const latSc = readField(data, m.bodyOffset, m.def, 0, 'sint32')
    const lonSc = readField(data, m.bodyOffset, m.def, 1, 'sint32')
    if (ts == null || latSc == null || lonSc == null) {
      recordIdx++
      continue
    }
    records.push({
      recordIdx: recordIdx++,
      ts: new Date((FIT_EPOCH_S + ts) * 1000),
      lat: latSc * SC_TO_DEG,
      lon: lonSc * SC_TO_DEG,
      bodyOffset: m.bodyOffset,
      defRef: m.def,
    })
  }
  records.sort((a, b) => a.ts.getTime() - b.ts.getTime())
  // Reindex after sort
  records.forEach((r, i) => { r.recordIdx = i })
  return records
}

export function findClusters(
  records: RecordPoint[],
  opts: ClusterOptions = {},
): JitterCluster[] {
  const { radiusM, minDurationS, minPoints } = { ...DEFAULTS, ...opts }
  const clusters: JitterCluster[] = []
  const n = records.length
  let i = 0
  while (i < n) {
    let sumLat = records[i].lat
    let sumLon = records[i].lon
    let count = 1
    let j = i + 1
    while (j < n) {
      const cx = sumLat / count
      const cy = sumLon / count
      if (haversine(cx, cy, records[j].lat, records[j].lon) > radiusM) break
      sumLat += records[j].lat
      sumLon += records[j].lon
      count += 1
      j += 1
    }
    const startTs = records[i].ts
    const endTs = records[j - 1].ts
    const durationS = (endTs.getTime() - startTs.getTime()) / 1000
    if (durationS >= minDurationS && count >= minPoints) {
      const cx = sumLat / count
      const cy = sumLon / count
      const points = records.slice(i, j).map(r => ({ lat: r.lat, lon: r.lon }))
      let maxD = 0
      for (const p of points) {
        const d = haversine(cx, cy, p.lat, p.lon)
        if (d > maxD) maxD = d
      }
      let pathM = 0
      for (let k = 0; k < points.length - 1; k++) {
        pathM += haversine(points[k].lat, points[k].lon, points[k + 1].lat, points[k + 1].lon)
      }
      clusters.push({
        number: clusters.length + 1,
        idxStart: i,
        idxEnd: j - 1,
        startTs, endTs, durationS,
        nPoints: count,
        centroid: { lat: cx, lon: cy },
        maxExcursionM: maxD,
        pathLengthM: pathM,
        points,
      })
      i = j
    } else {
      i += 1
    }
  }
  return clusters
}

export function scanFitForClusters(data: Uint8Array, opts?: ClusterOptions): ScanResult {
  const records = extractRecords(data)
  const clusters = findClusters(records, opts)
  return { records, clusters }
}
