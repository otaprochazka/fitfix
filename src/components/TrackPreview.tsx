import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { walkMessages, readField, FIT_EPOCH_S, SC_TO_DEG } from '../lib/fit'
import type { NormalizedActivity } from '../lib/activity'
import { type StreamKey, streamGradient } from '../lib/streamColors'

export { type StreamKey } from '../lib/streamColors'

interface ExtraTrack {
  bytes: Uint8Array
  color: string
  label?: string
}

interface Props {
  /** Bytes of any FIT file. We extract the GPS records and draw them. */
  data?: Uint8Array
  /** Optional NormalizedActivity (preferred when stream-coloring is needed). */
  activity?: NormalizedActivity
  /** When set, recolor the polyline by stream value (low→high gradient). */
  streamColor?: StreamKey | null
  /** Optional additional tracks to render in their own colors (e.g. merge sources). */
  extraTracks?: ExtraTrack[]
  /** Index into activity.points; when present, render a moving cursor marker. */
  cursorIdx?: number | null
  /** Maximum number of polyline points to draw (subsample if needed). */
  maxPoints?: number
  /** Tailwind height class, e.g. "h-72" or "h-[40vh]". */
  heightClass?: string
}

interface Pt { lat: number; lon: number; v?: number | null }

function extractFromBytes(data: Uint8Array): Pt[] {
  const pts: Pt[] = []
  for (const m of walkMessages(data)) {
    if (m.kind !== 'data' || m.def.globalNum !== 20) continue
    const ts = readField(data, m.bodyOffset, m.def, 253, 'uint32')
    const lat = readField(data, m.bodyOffset, m.def, 0, 'sint32')
    const lon = readField(data, m.bodyOffset, m.def, 1, 'sint32')
    if (ts == null || lat == null || lon == null) continue
    pts.push({ lat: lat * SC_TO_DEG, lon: lon * SC_TO_DEG })
  }
  void FIT_EPOCH_S
  return pts
}

function extractFromActivity(a: NormalizedActivity, stream: StreamKey | null | undefined): Pt[] {
  const pts: Pt[] = []
  for (const p of a.points) {
    if (p.lat == null || p.lon == null) continue
    pts.push({ lat: p.lat, lon: p.lon, v: stream ? p[stream] ?? null : null })
  }
  return pts
}

export default function TrackPreview({
  data, activity, streamColor, extraTracks, cursorIdx,
  maxPoints = 4000, heightClass = 'h-72',
}: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const baseGroupRef = useRef<L.LayerGroup | null>(null)
  const overlayGroupRef = useRef<L.LayerGroup | null>(null)
  const cursorRef = useRef<L.CircleMarker | null>(null)
  const baseBoundsRef = useRef<L.LatLngBounds | null>(null)
  const [active, setActive] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    // Start inert: no scrollWheel, no drag. Page scroll always wins until the
    // user explicitly activates the map (click on desktop, two-finger pan on
    // mobile) — fixes the "I scrolled into the map and got stuck" trap.
    const map = L.map(elRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      dragging: true,
      touchZoom: 'center',
    })
    mapRef.current = map

    const baseLayers = {
      'CartoDB Voyager': L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        { attribution: '© OpenStreetMap, © CARTO', subdomains: 'abcd', maxZoom: 20 }),
      'OpenTopoMap': L.tileLayer(
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenStreetMap, SRTM | © OpenTopoMap', subdomains: 'abc', maxZoom: 17 }),
      'Esri Satellite': L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 }),
    }
    baseLayers['CartoDB Voyager'].addTo(map)
    L.control.layers(baseLayers, undefined, { position: 'topright', collapsed: true }).addTo(map)
    // Two layer groups so changing the overlay (e.g. merge preview track) or
    // the cursor doesn't force a rebuild of the base track polylines.
    baseGroupRef.current = L.layerGroup().addTo(map)
    overlayGroupRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
      baseGroupRef.current = null
      overlayGroupRef.current = null
      baseBoundsRef.current = null
    }
  }, [])

  // Base track: rebuilds only when the activity bytes / stream / sampling
  // budget actually change. Cursor moves and overlay (preview) updates do
  // NOT touch this group, so undo/redo no longer rebuilds 200 colored
  // polyline segments per click.
  useEffect(() => {
    const map = mapRef.current
    const group = baseGroupRef.current
    if (!map || !group) return
    group.clearLayers()
    cursorRef.current = null
    baseBoundsRef.current = null

    const primary: Pt[] = activity
      ? extractFromActivity(activity, streamColor)
      : data
      ? extractFromBytes(data)
      : []
    if (!primary.length) return

    const step = Math.max(1, Math.floor(primary.length / maxPoints))
    const sampled: Pt[] = []
    for (let i = 0; i < primary.length; i += step) sampled.push(primary[i])

    let bounds: L.LatLngBounds | null = null
    if (streamColor && sampled.some(p => p.v != null)) {
      let lo = Infinity, hi = -Infinity
      for (const p of sampled) {
        if (p.v == null) continue
        if (p.v < lo) lo = p.v
        if (p.v > hi) hi = p.v
      }
      const range = hi - lo > 1e-9 ? hi - lo : 1
      const SEG = Math.max(1, Math.floor(sampled.length / 200))
      for (let i = 0; i + SEG < sampled.length; i += SEG) {
        const a = sampled[i]
        const b = sampled[i + SEG]
        const va = a.v ?? lo
        const t = (va - lo) / range
        const seg = L.polyline([[a.lat, a.lon], [b.lat, b.lon]] as L.LatLngExpression[], {
          color: streamGradient(streamColor, t), weight: 4, opacity: 0.95,
        })
        seg.addTo(group)
        const segB = seg.getBounds()
        bounds = bounds ? bounds.extend(segB) : segB
      }
    } else {
      const latlngs: L.LatLngExpression[] = sampled.map(p => [p.lat, p.lon])
      const line = L.polyline(latlngs, { color: '#2dd4bf', weight: 3, opacity: 0.85 })
      line.addTo(group)
      bounds = line.getBounds()
    }

    L.circleMarker([primary[0].lat, primary[0].lon], {
      radius: 5, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1,
    }).bindTooltip('Start').addTo(group)
    L.circleMarker([primary[primary.length - 1].lat, primary[primary.length - 1].lon], {
      radius: 5, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1,
    }).bindTooltip('End').addTo(group)

    baseBoundsRef.current = bounds
    if (bounds) map.fitBounds(bounds, { padding: [16, 16] })
  }, [data, activity, streamColor, maxPoints])

  // Overlay tracks: only rebuilds when extraTracks ref changes. The base
  // track stays untouched.
  useEffect(() => {
    const map = mapRef.current
    const group = overlayGroupRef.current
    if (!map || !group) return
    group.clearLayers()
    if (!extraTracks?.length) return

    let bounds: L.LatLngBounds | null = baseBoundsRef.current
    for (const ex of extraTracks) {
      const exPts = extractFromBytes(ex.bytes)
      if (!exPts.length) continue
      const step = Math.max(1, Math.floor(exPts.length / maxPoints))
      const sampled: { lat: number; lon: number }[] = []
      for (let i = 0; i < exPts.length; i += step) sampled.push(exPts[i])
      const line = L.polyline(sampled.map(p => [p.lat, p.lon]) as L.LatLngExpression[], {
        color: ex.color, weight: 3, opacity: 0.75, dashArray: '4 6',
      })
      line.addTo(group)
      if (ex.label) line.bindTooltip(ex.label)
      const lb = line.getBounds()
      bounds = bounds ? bounds.extend(lb) : lb
    }
    if (bounds) map.fitBounds(bounds, { padding: [16, 16] })
  }, [extraTracks, maxPoints])

  // Stream lo/hi — memoized so each cursor scrub doesn't re-walk 60k points
  // when computing the cursor marker's gradient color.
  const streamRange = useMemo(() => {
    if (!activity || !streamColor) return null
    let lo = Infinity, hi = -Infinity
    for (const q of activity.points) {
      const w = q[streamColor]
      if (w == null) continue
      if (w < lo) lo = w
      if (w > hi) hi = w
    }
    if (lo === Infinity) return null
    return { lo, hi, range: hi - lo > 1e-9 ? hi - lo : 1 }
  }, [activity, streamColor])

  // Cursor marker — updates without re-rendering the polylines.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activity) return
    if (cursorIdx == null || cursorIdx < 0 || cursorIdx >= activity.points.length) {
      if (cursorRef.current) {
        map.removeLayer(cursorRef.current)
        cursorRef.current = null
      }
      return
    }
    const p = activity.points[cursorIdx]
    if (p.lat == null || p.lon == null) return

    // If a stream is coloring the map, color the cursor marker by the same
    // gradient at the cursor's value — links the dot visibly to the segment.
    let fill = '#2dd4bf'
    if (streamColor && streamRange) {
      const v = p[streamColor]
      if (v != null) {
        fill = streamGradient(streamColor, (v - streamRange.lo) / streamRange.range)
      }
    }

    if (!cursorRef.current) {
      cursorRef.current = L.circleMarker([p.lat, p.lon], {
        radius: 8, color: '#fff', weight: 2, fillColor: fill, fillOpacity: 1,
      }).addTo(map)
    } else {
      cursorRef.current.setLatLng([p.lat, p.lon])
      cursorRef.current.setStyle({ fillColor: fill })
    }
  }, [cursorIdx, activity, streamColor, streamRange])

  // Click-to-activate: turn on scroll-wheel zoom only after explicit
  // engagement; one click outside resets it. Keeps page scroll behavior
  // intuitive without hiding the map controls.
  const activate = () => {
    if (active) return
    setActive(true)
    mapRef.current?.scrollWheelZoom.enable()
  }
  const deactivate = () => {
    if (!active) return
    setActive(false)
    mapRef.current?.scrollWheelZoom.disable()
  }

  return (
    <div className={`relative w-full ${heightClass} rounded-xl overflow-hidden border border-slate-800`}>
      <div
        ref={elRef}
        className={`w-full h-full ${active ? '' : 'scroll-passthrough'}`}
        onClick={activate}
        onMouseLeave={deactivate}
      />
      {!active && (
        <div className="map-shade" aria-hidden>
          <span className="map-shade-pill">{t('map.click_to_interact')}</span>
        </div>
      )}
    </div>
  )
}
