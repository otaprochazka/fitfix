/**
 * Zigzag apply — composes cleanJitter (stationary) and dropRecords (moving)
 * into a single Edit.apply byte transformation.
 *
 * Two modes only — fix or keep. The underlying algorithm is picked from
 * the cluster source so the user doesn't have to think about it:
 *   - stationary cluster + fix  → cleanJitter pin (collapse to centroid)
 *   - moving loop      + fix  → dropRecords (straight line through)
 *   - any              + keep → no-op
 */

import { cleanJitter, type Resolution } from '../../cleanJitter'
import { dropRecords } from '../../rewrite'
import type { ZigzagFinding, ZigzagMode } from './findings'

export interface ZigzagPicks {
  [findingNumber: number]: ZigzagMode
}

export function buildZigzagApply(
  findings: ZigzagFinding[],
  picks: ZigzagPicks,
): (prev: Uint8Array) => Uint8Array {
  const stationaryRes: Record<number, Resolution> = {}
  const movingDropped = new Set<number>()

  for (const f of findings) {
    const mode: ZigzagMode = picks[f.number] ?? 'keep'
    if (mode === 'keep') continue
    if (f.source === 'stationary' && f.jitter) {
      stationaryRes[f.jitter.number] = 'pin'
    } else if (f.source === 'moving' && f.loop) {
      for (const idx of f.loop.droppedIndices) movingDropped.add(idx)
    }
  }

  return (prev) => {
    let next = prev
    if (Object.keys(stationaryRes).length > 0) {
      next = cleanJitter(next, { resolutions: stationaryRes }).output
    }
    if (movingDropped.size > 0) {
      next = dropRecords(next, ({ index }) => !movingDropped.has(index))
    }
    return next
  }
}

export function countByMode(
  findings: ZigzagFinding[],
  picks: ZigzagPicks,
): { fix: number; keep: number } {
  const counts = { fix: 0, keep: 0 }
  for (const f of findings) counts[picks[f.number] ?? 'keep']++
  return counts
}

export function totalSelectedSavingM(
  findings: ZigzagFinding[],
  picks: ZigzagPicks,
): number {
  let saving = 0
  for (const f of findings) {
    if ((picks[f.number] ?? 'keep') === 'fix') saving += f.estimatedSavingM
  }
  return saving
}
