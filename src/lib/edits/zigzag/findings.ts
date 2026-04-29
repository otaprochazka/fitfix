/**
 * Zigzag findings — unified shape over the two underlying detectors.
 *
 * Stationary clusters (`source: 'stationary'`) come from `scanFitForClusters`
 * and represent GPS that wandered while the watch sat still.
 * Moving loops    (`source: 'moving'`)    come from `detectLoops` and
 * represent on-the-move phantom back-and-forth.
 *
 * Both share the user-facing question "what should we do with this zigzag?"
 * — see `ZigzagMode` for the three answers.
 */

import { scanFitForClusters, type JitterCluster } from '../../findClusters'
import { detectLoops, type LoopCandidate } from '../loops/detector'
import { previewSavings } from '../../cleanJitter'
import { haversine } from '../../fit'
import type { NormalizedActivity } from '../../activity'

export type ZigzagSource = 'stationary' | 'moving'
export type ZigzagMode = 'fix' | 'keep'

export interface ZigzagFinding {
  /** 1-based, unified across both sources for stable React keys / picks. */
  number: number
  source: ZigzagSource
  startTs: Date
  endTs: Date
  durationS: number
  centroid: { lat: number; lon: number }
  /** Estimated phantom distance the fix would remove (metres). */
  estimatedSavingM: number
  /** Length of the recorded path inside the finding, before any fix (metres). */
  originalLengthM: number
  /** Length of the polyline the fix would leave behind (metres). */
  newLengthM: number
  /**
   * The polyline that REPLACES the zigzag once the fix is applied — drawn
   * on the map as a teal preview so the user sees what they'll get.
   * Stationary: [recordBefore, centroid, recordAfter].
   * Moving:    [recordBefore, centroid, recordAfter] (lollipop tag to the cell).
   */
  newLine: { lat: number; lon: number }[]
  /** Source-specific carry-through used by the apply step. */
  jitter?: JitterCluster
  loop?: LoopCandidate
}

export function defaultModeFor(_source: ZigzagSource): ZigzagMode {
  // Default: fix everything. The underlying algorithm is chosen from the
  // cluster source (stationary → pin to centroid; moving → drop redundant
  // points so the line goes straight through).
  return 'fix'
}

export interface ScanZigzagResult {
  findings: ZigzagFinding[]
  /** Total estimated phantom distance across all findings (metres). */
  totalSavingM: number
}

export function scanZigzag(activity: NormalizedActivity): ScanZigzagResult {
  const findings: ZigzagFinding[] = []

  // Stationary jitter clusters.
  const { clusters, records } = scanFitForClusters(activity.bytes)
  if (clusters.length > 0) {
    // Use cleanJitter's pin-all preview to estimate per-cluster saved distance.
    const allPin: Record<number, 'pin'> = {}
    for (const c of clusters) allPin[c.number] = 'pin'
    const preview = previewSavings(clusters, allPin)
    for (const c of clusters) {
      const perCluster = preview.perCluster.find((p) => p.number === c.number)
      const before = records[c.idxStart - 1]
      const after = records[c.idxEnd + 1]
      const newLine: { lat: number; lon: number }[] = []
      if (before) newLine.push({ lat: before.lat, lon: before.lon })
      newLine.push(c.centroid)
      if (after) newLine.push({ lat: after.lat, lon: after.lon })
      findings.push({
        number: 0, // assigned after merge
        source: 'stationary',
        startTs: c.startTs,
        endTs: c.endTs,
        durationS: c.durationS,
        centroid: c.centroid,
        estimatedSavingM: perCluster?.savedM ?? 0,
        originalLengthM: c.pathLengthM,
        newLengthM: polylineLengthM(newLine),
        newLine,
        jitter: c,
      })
    }
  }

  // Moving phantom loops.
  const loops = detectLoops(activity)
  for (const l of loops) {
    const sorted = [...l.droppedIndices].sort((a, b) => a - b)
    const minIdx = sorted[0]
    const maxIdx = sorted[sorted.length - 1]
    const before = activity.points[minIdx - 1] ?? activity.points[minIdx]
    const after = activity.points[maxIdx + 1] ?? activity.points[maxIdx]
    const centroid = centroidFromLoop(l, activity)
    // Lollipop preview: main path → centroid → main path. Showing the
    // detour (instead of a straight bypass) matches what the post-fix
    // file actually contains — entry and exit visit records sit in the
    // same ~30 m cell as the centroid — and stops the preview from
    // looking like the area was deleted entirely.
    const newLine: { lat: number; lon: number }[] = []
    if (before?.lat != null && before.lon != null) {
      newLine.push({ lat: before.lat, lon: before.lon })
    }
    if (Number.isFinite(centroid.lat) && Number.isFinite(centroid.lon)) {
      newLine.push(centroid)
    }
    if (after?.lat != null && after.lon != null) {
      newLine.push({ lat: after.lat, lon: after.lon })
    }
    const originalLengthM = recordedLengthM(activity, sorted)
    findings.push({
      number: 0,
      source: 'moving',
      startTs: l.startTs,
      endTs: l.endTs,
      durationS: Math.max(
        1,
        Math.round((l.endTs.getTime() - l.startTs.getTime()) / 1000),
      ),
      centroid,
      estimatedSavingM: l.phantomDistanceM,
      originalLengthM,
      newLengthM: polylineLengthM(newLine),
      newLine,
      loop: l,
    })
  }

  // Both detectors can flag the same region (a slow zigzag passes
  // stationary AND moving heuristics) and adjacent zigzags can share a
  // boundary record. The previous "drop on any time-overlap" rule
  // collapsed both cases, hiding genuine adjacent zigzags. Replace with
  // a time-window Jaccard test: only treat two findings as the same
  // event when their windows overlap substantially.
  const sortedByScore = [...findings].sort((a, b) => {
    if (b.estimatedSavingM !== a.estimatedSavingM) {
      return b.estimatedSavingM - a.estimatedSavingM
    }
    // Tie: stationary wins (its centroid pin is more informative than a
    // straight-line drop preview).
    if (a.source === b.source) return 0
    return a.source === 'stationary' ? -1 : 1
  })
  const deduped: ZigzagFinding[] = []
  for (const f of sortedByScore) {
    if (deduped.some((k) => timeJaccard(f, k) >= 0.5)) continue
    deduped.push(f)
  }
  deduped.sort((a, b) => a.startTs.getTime() - b.startTs.getTime())
  deduped.forEach((f, i) => {
    f.number = i + 1
  })

  const totalSavingM = deduped.reduce((s, f) => s + f.estimatedSavingM, 0)
  return { findings: deduped, totalSavingM }
}

function polylineLengthM(line: { lat: number; lon: number }[]): number {
  let d = 0
  for (let i = 1; i < line.length; i++) {
    d += haversine(line[i - 1].lat, line[i - 1].lon, line[i].lat, line[i].lon)
  }
  return d
}

function recordedLengthM(
  activity: NormalizedActivity,
  sortedIdxs: number[],
): number {
  let d = 0
  let prevLat: number | null = null
  let prevLon: number | null = null
  for (const i of sortedIdxs) {
    const p = activity.points[i]
    if (p?.lat == null || p?.lon == null) continue
    if (prevLat != null && prevLon != null) {
      d += haversine(prevLat, prevLon, p.lat, p.lon)
    }
    prevLat = p.lat
    prevLon = p.lon
  }
  return d
}

function timeJaccard(a: ZigzagFinding, b: ZigzagFinding): number {
  const aStart = a.startTs.getTime()
  const aEnd = a.endTs.getTime()
  const bStart = b.startTs.getTime()
  const bEnd = b.endTs.getTime()
  const interLo = Math.max(aStart, bStart)
  const interHi = Math.min(aEnd, bEnd)
  if (interLo > interHi) return 0
  const inter = interHi - interLo
  const union = Math.max(aEnd, bEnd) - Math.min(aStart, bStart)
  return union > 0 ? inter / union : 0
}

function centroidFromLoop(
  loop: LoopCandidate,
  activity: NormalizedActivity,
): { lat: number; lon: number } {
  let lat = 0
  let lon = 0
  let n = 0
  for (const i of loop.droppedIndices) {
    const p = activity.points[i]
    if (p?.lat != null && p?.lon != null) {
      lat += p.lat
      lon += p.lon
      n++
    }
  }
  if (n === 0) return { lat: 0, lon: 0 }
  return { lat: lat / n, lon: lon / n }
}
