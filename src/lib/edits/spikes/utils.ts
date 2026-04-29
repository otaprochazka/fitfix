/**
 * Shared statistical utilities for the spikes phase.
 * Kept separate so detector.ts and action.ts can both import without circles.
 */

/** Compute the median of a numeric array (non-destructive). */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}
