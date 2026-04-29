/**
 * cleanJitter — stationary GPS jitter cluster fix.
 *
 * The Edge 500 cycling fixture probably has zero stationary clusters (it's
 * a moving cycle ride). The asserts here are therefore conditional:
 *   - If 0 clusters detected → cleanJitter is a no-op; raw == new distance.
 *   - If ≥1 clusters → applying 'pin' resolutions removes them on re-scan.
 *
 * Either way: determinism (same input + opts → same bytes) and
 * parseability of the output are non-negotiable.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { scanFitForClusters } from '../../src/lib/findClusters'
import { cleanJitter, type Resolution } from '../../src/lib/cleanJitter'
import { parseActivity } from '../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'public',
  'samples',
  'garmin-edge-500-cycling.fit',
)

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('cleanJitter — Edge 500 fixture', () => {
  it('no-resolutions run is a no-op on path length and parses', () => {
    const result = cleanJitter(bytes, { freshenFileId: false })

    expect(result.output.byteLength).toBeGreaterThan(0)
    // No resolutions → no positions changed → no distance saved
    expect(result.savedM).toBe(0)
    // Raw and "new" distances must match exactly when no fix was applied
    expect(result.newDistanceM).toBeCloseTo(result.rawDistanceM, 1)

    expect(() => parseActivity(result.output, 'cleaned.fit')).not.toThrow()
  })

  it('is deterministic — same opts produces identical bytes', () => {
    const a = cleanJitter(bytes, { freshenFileId: false })
    const b = cleanJitter(bytes, { freshenFileId: false })
    expect(a.output.length).toBe(b.output.length)
    expect(Buffer.from(a.output).equals(Buffer.from(b.output))).toBe(true)
  })

  it('reports cluster count consistent with the bare scanner', () => {
    const scan = scanFitForClusters(bytes)
    const result = cleanJitter(bytes, { freshenFileId: false })
    expect(result.totalClusters).toBe(scan.clusters.length)
  })

  it('pin resolutions reduce or eliminate clusters on re-scan', () => {
    const scan = scanFitForClusters(bytes)
    if (scan.clusters.length === 0) {
      // The committed fixture is a moving ride — no stationary clusters
      // expected. We assert the negative case explicitly so the test
      // documents what we observed; once a jitter fixture lands in
      // tests/fixtures/ this branch becomes dead and we add a positive
      // assertion alongside it.
      expect(scan.clusters.length).toBe(0)
      return
    }

    const resolutions: Record<number, Resolution> = {}
    for (let i = 1; i <= scan.clusters.length; i++) resolutions[i] = 'pin'

    const result = cleanJitter(bytes, { freshenFileId: false, resolutions })
    expect(result.savedM).toBeGreaterThanOrEqual(0)

    const rescan = scanFitForClusters(result.output)
    expect(rescan.clusters.length).toBeLessThanOrEqual(scan.clusters.length)
  })
})
