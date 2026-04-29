/**
 * Phantom-loop detector — Phase 9.
 *
 * Detects on-the-move GPS hallucinations where the recorded track bounces
 * back and forth over the same ~30 m grid cell multiple times within a short
 * window (≤10 minutes). Classic symptom: post-event analysis reveals several
 * km of fake distance that the runner never actually ran.
 *
 * Algorithm
 * ---------
 * 1. Bucket every GPS record into a coarse grid cell (~30 m side).
 * 2. Walk records in time order, counting **visits** per cell. A visit ends
 *    when the track leaves the cell for >EXIT_GAP consecutive records.
 * 3. When a single cell accumulates ≥MIN_VISITS visits and the entire span
 *    (first visit start → last visit end) covers ≤MAX_WINDOW_MS of elapsed
 *    time, it is a loop candidate.
 * 4. Within the candidate we also require multiple direction reversals to
 *    avoid flagging genuine intentional loops (track races, parkrun, etc.)
 * 5. The "phantom" records — those between the first cell-exit and the last
 *    cell-entry — are collected into a droppedIndices Set; the apply step
 *    hands that set to dropRecords().
 *
 * Confidence
 * ----------
 * high   : phantom distance > 500 m
 * medium : 200–500 m
 * low    : < 200 m
 */

import { haversine } from '../../fit'
import { dropRecords } from '../../rewrite'
import type { NormalizedActivity, ActivityPoint } from '../../activity'
import type { Suggestion } from '../../plugins/types'
import i18n from '../../../i18n'

// ─── Tunable constants ────────────────────────────────────────────────────────
/** Grid-cell side in degrees (lat). ~30 m at equator. */
const CELL_DEG = 30 / 111_000

/** Number of consecutive records outside a cell that ends a visit. */
const EXIT_GAP = 3

/** Minimum distinct visits to the same cell to flag as a loop. */
const MIN_VISITS = 3

/** Maximum elapsed time across the whole loop candidate (ms). */
const MAX_WINDOW_MS = 10 * 60 * 1_000   // 10 minutes

/** Minimum direction reversals inside the candidate to guard against
 *  genuine intentional loops (parkrun, etc.). */
const MIN_REVERSALS = 2

// ─── Types ───────────────────────────────────────────────────────────────────

interface CellKey { row: number; col: number }

interface Visit {
  startIdx: number   // index into gpsPoints
  endIdx: number
  startTs: Date
  endTs: Date
}

export interface LoopCandidate {
  cell: CellKey
  visits: Visit[]
  /** Index of the first record in the window (gpsPoints-relative). */
  windowStart: number
  /** Index of the last record in the window (inclusive). */
  windowEnd: number
  startTs: Date
  endTs: Date
  /** Raw record indices (into a.points) that should be dropped. */
  droppedIndices: Set<number>
  /** Haversine distance of the dropped segment, metres. */
  phantomDistanceM: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cellKey(lat: number, lon: number): string {
  const row = Math.floor(lat / CELL_DEG)
  const lonDeg = CELL_DEG / Math.cos((lat * Math.PI) / 180)
  const col = Math.floor(lon / lonDeg)
  return `${row}:${col}`
}

/** Count bearing direction changes in a sequence of lat/lon points.
 *  A reversal is a dot-product sign flip between consecutive movement vectors. */
function countReversals(pts: ActivityPoint[]): number {
  let reversals = 0
  if (pts.length < 3) return 0
  let prevDlat = pts[1].lat! - pts[0].lat!
  let prevDlon = pts[1].lon! - pts[0].lon!
  for (let i = 2; i < pts.length; i++) {
    const dlat = pts[i].lat! - pts[i - 1].lat!
    const dlon = pts[i].lon! - pts[i - 1].lon!
    const dot = prevDlat * dlat + prevDlon * dlon
    if (dot < 0) reversals++
    prevDlat = dlat
    prevDlon = dlon
  }
  return reversals
}

/** Compute haversine path length across a subset of gps-bearing points. */
function pathLength(pts: ActivityPoint[], from: number, to: number): number {
  let dist = 0
  for (let i = from + 1; i <= to; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
      dist += haversine(a.lat, a.lon, b.lat, b.lon)
    }
  }
  return dist
}

// ─── Core detection ──────────────────────────────────────────────────────────

export function detectLoops(a: NormalizedActivity): LoopCandidate[] {
  // Only GPS-bearing records matter.
  const gps = a.points.filter(p => p.lat != null && p.lon != null)
  if (gps.length < 50) return []

  // Build per-cell visit lists.
  const cellVisits = new Map<string, Visit[]>()

  let i = 0
  while (i < gps.length) {
    const key = cellKey(gps[i].lat!, gps[i].lon!)
    // Extend visit while we stay in this cell (or have a short gap).
    let j = i + 1
    let gap = 0
    while (j < gps.length) {
      if (cellKey(gps[j].lat!, gps[j].lon!) === key) {
        gap = 0
        j++
      } else {
        gap++
        if (gap > EXIT_GAP) break
        j++
      }
    }
    // The actual visit ends at the last record that matched the cell.
    let visitEnd = j - 1
    while (visitEnd > i && cellKey(gps[visitEnd].lat!, gps[visitEnd].lon!) !== key) {
      visitEnd--
    }

    const visit: Visit = {
      startIdx: i,
      endIdx: visitEnd,
      startTs: gps[i].ts,
      endTs: gps[visitEnd].ts,
    }
    const existing = cellVisits.get(key) ?? []
    existing.push(visit)
    cellVisits.set(key, existing)

    i = visitEnd + 1
  }

  const candidates: LoopCandidate[] = []

  for (const [, visits] of cellVisits) {
    if (visits.length < MIN_VISITS) continue

    // Consider all groups of ≥MIN_VISITS consecutive visits within the window.
    for (let s = 0; s <= visits.length - MIN_VISITS; s++) {
      for (let e = s + MIN_VISITS - 1; e < visits.length; e++) {
        const windowStartTs = visits[s].startTs
        const windowEndTs = visits[e].endTs
        const elapsed = windowEndTs.getTime() - windowStartTs.getTime()
        if (elapsed > MAX_WINDOW_MS) break  // visits are ordered; no point extending

        const windowStartIdx = visits[s].startIdx
        const windowEndIdx = visits[e].endIdx

        const windowPts = gps.slice(windowStartIdx, windowEndIdx + 1)
        if (countReversals(windowPts) < MIN_REVERSALS) continue

        // The "phantom" middle: from the end of the first visit to the start
        // of the last visit (exclusive — keep first and last crossing).
        const dropFrom = visits[s].endIdx + 1
        const dropTo = visits[e].startIdx - 1

        if (dropFrom > dropTo) continue   // nothing to drop

        // Collect raw recordIdx values for the dropped segment.
        const droppedSet = new Set<number>()
        for (let k = dropFrom; k <= dropTo; k++) {
          droppedSet.add(gps[k].recordIdx)
        }

        const phantomDist = pathLength(gps, dropFrom - 1, dropTo + 1)

        candidates.push({
          cell: { row: 0, col: 0 },   // used for deduplication key above; not stored meaningfully
          visits: visits.slice(s, e + 1),
          windowStart: windowStartIdx,
          windowEnd: windowEndIdx,
          startTs: windowStartTs,
          endTs: windowEndTs,
          droppedIndices: droppedSet,
          phantomDistanceM: phantomDist,
        })
      }
    }
  }

  // Deduplicate: if two candidates share a large overlap in dropped indices,
  // keep the one with the larger phantom distance.
  return dedup(candidates)
}

function dedup(candidates: LoopCandidate[]): LoopCandidate[] {
  candidates.sort((a, b) => b.phantomDistanceM - a.phantomDistanceM)
  const kept: LoopCandidate[] = []
  for (const c of candidates) {
    const overlaps = kept.some(k => {
      let shared = 0
      for (const idx of c.droppedIndices) {
        if (k.droppedIndices.has(idx)) shared++
      }
      return shared > c.droppedIndices.size * 0.5
    })
    if (!overlaps) kept.push(c)
  }
  return kept
}

// ─── Suggestion builder ──────────────────────────────────────────────────────

export function buildSuggestions(
  _a: NormalizedActivity,
  candidates: LoopCandidate[],
): Suggestion[] {
  if (candidates.length === 0) return []

  const totalPhantomM = candidates.reduce((s, c) => s + c.phantomDistanceM, 0)
  const km = (totalPhantomM / 1000).toFixed(2)
  const count = candidates.length

  // Merge all dropped indices for the auto-fix (drop everything).
  const allDropped = new Set<number>()
  for (const c of candidates) {
    for (const idx of c.droppedIndices) allDropped.add(idx)
  }

  const confidence =
    totalPhantomM > 500 ? 'high' : totalPhantomM > 200 ? 'medium' : 'low'

  const suggestion: Suggestion = {
    id: 'loops:0',
    detectorId: 'loops',
    title: i18n.t('editor.loops.title', { km }),
    body: i18n.t('editor.loops.body', { count, km }),
    confidence,
    range: {
      startTs: candidates[0].startTs,
      endTs: candidates[candidates.length - 1].endTs,
    },
    edit: {
      kind: 'loops:drop',
      label: `Drop ${count} phantom loop(s) — ${km} km`,
      apply: (prev) => dropRecords(prev, ({ index }) => !allDropped.has(index)),
    },
  }

  return [suggestion]
}
