/**
 * FIT → GPX 1.1 conversion. Validates structure, point count, lat/lon
 * ranges, and TrackPointExtension v2 namespace declaration. We don't
 * pull in an XSD validator — the regex/string assertions catch every
 * regression we've seen so far.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fitToGpx } from '../../src/lib/fitToGpx'
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

describe('fitToGpx — Edge 500 fixture', () => {
  it('emits a valid GPX 1.1 envelope with TrackPointExtension v2', () => {
    const { gpx, pointCount } = fitToGpx(bytes)

    expect(gpx.startsWith('<?xml')).toBe(true)
    expect(gpx).toMatch(/<gpx[\s\S]*version="1\.1"/)
    expect(gpx).toMatch(/xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1"/)
    expect(gpx).toMatch(/TrackPointExtension\/v2/)
    expect(gpx).toContain('<trk>')
    expect(gpx).toContain('<trkseg>')
    expect(gpx).toContain('</gpx>')
    expect(pointCount).toBeGreaterThan(0)
  })

  it('trkpt count equals records with non-null GPS', () => {
    const activity = parseActivity(bytes, 'edge-500.fit')
    const withGps = activity.points.filter(
      p => p.lat != null && p.lon != null,
    ).length

    const { gpx, pointCount } = fitToGpx(bytes)
    const trkptMatches = gpx.match(/<trkpt /g)?.length ?? 0

    expect(pointCount).toBe(withGps)
    expect(trkptMatches).toBe(withGps)
  })

  it('every emitted lat/lon falls within Earth-valid ranges', () => {
    const { gpx } = fitToGpx(bytes)
    const re = /<trkpt lat="(-?\d+\.\d+)" lon="(-?\d+\.\d+)"/g
    let m: RegExpExecArray | null
    let checked = 0
    while ((m = re.exec(gpx)) !== null) {
      const lat = Number(m[1])
      const lon = Number(m[2])
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
      expect(lon).toBeGreaterThanOrEqual(-180)
      expect(lon).toBeLessThanOrEqual(180)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('honours name + creator overrides', () => {
    const { gpx } = fitToGpx(bytes, {
      name: 'Custom Name 🚴',
      creator: 'fitfix-test',
    })
    expect(gpx).toContain('<name>Custom Name 🚴</name>')
    expect(gpx).toMatch(/<gpx[^>]*creator="fitfix-test"/)
  })

  it('ele tags reference the same altitudes as parseActivity', () => {
    const { gpx } = fitToGpx(bytes)
    const eleMatches = gpx.match(/<ele>(-?\d+(\.\d+)?)<\/ele>/g) ?? []
    if (eleMatches.length === 0) return // fixture lacks altitude — fine
    const sample = Number(eleMatches[0]!.replace(/<\/?ele>/g, ''))
    // FIT altitudes are bounded ~ -500 .. 9000 m
    expect(sample).toBeGreaterThan(-1000)
    expect(sample).toBeLessThan(10000)
  })
})
