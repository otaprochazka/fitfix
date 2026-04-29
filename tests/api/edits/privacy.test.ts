/**
 * clipPrivacyZones — nullifies GPS for every record inside any saved zone
 * and recomputes cumulative + lap + session distance.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { clipPrivacyZones } from '../../../src/lib/edits/privacy/clipZones'
import type { PrivacyZone } from '../../../src/lib/edits/privacy/zones'
import { parseActivity } from '../../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
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

describe('clipPrivacyZones', () => {
  it('empty zone list is a no-op on lat/lon', () => {
    const before = parseActivity(bytes, 'before.fit')
    const out = clipPrivacyZones(bytes, [])
    const after = parseActivity(out, 'after.fit')

    expect(after.points.length).toBe(before.points.length)
    // Same first GPS point
    const firstBefore = before.points.find(p => p.lat != null)!
    const firstAfter = after.points.find(p => p.lat != null)!
    expect(firstAfter.lat).toBeCloseTo(firstBefore.lat!, 6)
    expect(firstAfter.lon).toBeCloseTo(firstBefore.lon!, 6)
  })

  it('zone over the start nulls every nearby record', () => {
    const before = parseActivity(bytes, 'before.fit')
    const start = before.points.find(p => p.lat != null)
    if (!start) return // fixture has no GPS — should not happen for Edge 500

    const zones: PrivacyZone[] = [
      {
        id: 'home',
        label: 'Home',
        lat: start.lat!,
        lon: start.lon!,
        radiusM: 500,
      },
    ]

    const out = clipPrivacyZones(bytes, zones)
    const after = parseActivity(out, 'after.fit')

    // Record count preserved (we null lat/lon, not drop)
    expect(after.points.length).toBe(before.points.length)

    // The very first record's coords were inside the 500 m zone → nulled
    expect(after.points[0].lat).toBeNull()
    expect(after.points[0].lon).toBeNull()

    // Total distance recomputed; should not be larger than original
    expect(after.meta.totalDistanceM!).toBeLessThanOrEqual(
      before.meta.totalDistanceM!,
    )
  })

  it('is deterministic — same zones produce identical bytes', () => {
    const before = parseActivity(bytes, 'before.fit')
    const start = before.points.find(p => p.lat != null)!
    const zones: PrivacyZone[] = [
      {
        id: 'home',
        label: 'Home',
        lat: start.lat!,
        lon: start.lon!,
        radiusM: 200,
      },
    ]

    const a = clipPrivacyZones(bytes, zones)
    const b = clipPrivacyZones(bytes, zones)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })
})
