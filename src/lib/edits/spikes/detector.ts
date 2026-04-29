/**
 * Spike detector for HR, power, and speed streams.
 *
 * A "spike" is any sample whose value exceeds the rolling median of its
 * surrounding window by more than N standard deviations. This catches the
 * single-sample blips that wreck VO2max / IF / TSS computations.
 */

import type { NormalizedActivity, ActivityPoint } from '../../activity'
import { median } from './utils'

export interface SpikeDetectionResult {
  hrSpikes: number
  powerSpikes: number
  speedSpikes: number
}

export type SpikeStream = 'hr' | 'power' | 'speed'

export interface SpikeSample {
  stream: SpikeStream
  index: number
  ts: Date
  value: number
  neighbourMedian: number
  sigmas: number   // how many σ above the rolling median
}

export interface SpikeDetailedResult extends SpikeDetectionResult {
  /** Top examples (largest σ-deviation first), capped per stream. */
  examples: {
    hr: SpikeSample[]
    power: SpikeSample[]
    speed: SpikeSample[]
  }
}

/** Compute population standard deviation. */
function stddev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0
  const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

/**
 * Count spikes in a numeric stream.
 * @param values  Array of values; null entries are ignored.
 * @param nStddev Threshold in standard deviations above the rolling median.
 * @param window  Rolling window half-width (total window = 2*half+1).
 */
export function countSpikes(
  values: (number | null)[],
  nStddev = 4,
  windowSize = 11,
): number {
  const half = Math.floor(windowSize / 2)
  let count = 0

  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) continue

    // Collect neighbours (excluding the current sample)
    const neighbours: number[] = []
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      if (j === i) continue
      const nv = values[j]
      if (nv != null) neighbours.push(nv)
    }
    if (neighbours.length < 3) continue  // not enough context

    const med = median(neighbours)
    const mean = neighbours.reduce((a, b) => a + b, 0) / neighbours.length
    const sd = stddev(neighbours, mean)

    if (sd > 0 && v > med + nStddev * sd) {
      count++
    }
  }
  return count
}

export function detectSpikes(
  activity: NormalizedActivity,
  nStddev = 4,
  windowSize = 11,
): SpikeDetectionResult {
  const pts: ActivityPoint[] = activity.points

  const hrValues    = pts.map(p => p.hr)
  const powerValues = pts.map(p => p.power)
  // speed is stored as m/s in ActivityPoint; compare in same unit
  const speedValues = pts.map(p => p.speed)

  return {
    hrSpikes:    countSpikes(hrValues,    nStddev, windowSize),
    powerSpikes: countSpikes(powerValues, nStddev, windowSize),
    speedSpikes: countSpikes(speedValues, nStddev, windowSize),
  }
}

/**
 * Locate spikes and return concrete details (timestamp, value, neighbour
 * median, σ deviation) for the worst offenders per stream. Used by the
 * panel to show users WHAT was actually detected, not just a count.
 */
function findSpikeSamples(
  values: (number | null)[],
  pts: ActivityPoint[],
  stream: SpikeStream,
  nStddev: number,
  windowSize: number,
  cap = 5,
): { count: number; top: SpikeSample[] } {
  const half = Math.floor(windowSize / 2)
  const all: SpikeSample[] = []

  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) continue

    const neighbours: number[] = []
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      if (j === i) continue
      const nv = values[j]
      if (nv != null) neighbours.push(nv)
    }
    if (neighbours.length < 3) continue

    const med = median(neighbours)
    const mean = neighbours.reduce((a, b) => a + b, 0) / neighbours.length
    const sd = stddev(neighbours, mean)

    if (sd > 0 && v > med + nStddev * sd) {
      all.push({
        stream,
        index: i,
        ts: pts[i].ts,
        value: v,
        neighbourMedian: med,
        sigmas: (v - med) / sd,
      })
    }
  }

  // sort largest σ first, slice
  all.sort((a, b) => b.sigmas - a.sigmas)
  return { count: all.length, top: all.slice(0, cap) }
}

export function detectSpikesDetailed(
  activity: NormalizedActivity,
  nStddev = 4,
  windowSize = 11,
): SpikeDetailedResult {
  const pts = activity.points
  const hr    = findSpikeSamples(pts.map(p => p.hr),    pts, 'hr',    nStddev, windowSize)
  const power = findSpikeSamples(pts.map(p => p.power), pts, 'power', nStddev, windowSize)
  const speed = findSpikeSamples(pts.map(p => p.speed), pts, 'speed', nStddev, windowSize)
  return {
    hrSpikes:    hr.count,
    powerSpikes: power.count,
    speedSpikes: speed.count,
    examples: { hr: hr.top, power: power.top, speed: speed.top },
  }
}
