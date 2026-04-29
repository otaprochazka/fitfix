/**
 * Map for the unified zigzag tool. Renders the full activity track in grey,
 * overlays each finding (stationary jitter cluster or moving phantom loop)
 * in red, and shows the preview of the user's per-finding fix in teal /
 * orange. Clicking a numbered marker cycles its mode.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { NormalizedActivity } from '../../activity'
import type { ZigzagFinding, ZigzagMode } from './findings'

interface Props {
  activity: NormalizedActivity
  findings: ZigzagFinding[]
  picks: Record<number, ZigzagMode>
  onCycle: (number: number) => void
  focusOn?: number
  /** Finding number to spotlight (e.g. on row hover) without changing viewport. */
  hoverOn?: number
}

export default function ZigzagMap({ activity, findings, picks, onCycle, focusOn, hoverOn }: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const trackLayerRef = useRef<L.Polyline | null>(null)
  const findingLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Record<number, L.Marker>>({})
  const hoverLayerRef = useRef<L.LayerGroup | null>(null)

  // Init map once
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return

    const map = L.map(mapEl.current)
    mapRef.current = map

    const baseLayers = {
      'CartoDB Voyager': L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        { attribution: '© OpenStreetMap, © CARTO', subdomains: 'abcd', maxZoom: 20 },
      ),
      'CartoDB Positron': L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        { attribution: '© OpenStreetMap, © CARTO', subdomains: 'abcd', maxZoom: 20 },
      ),
      'OpenTopoMap': L.tileLayer(
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenStreetMap, SRTM | © OpenTopoMap', subdomains: 'abc', maxZoom: 17 },
      ),
      'Esri Satellite': L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 },
      ),
    }
    baseLayers['CartoDB Voyager'].addTo(map)
    L.control.layers(baseLayers, undefined, { position: 'topright', collapsed: true }).addTo(map)

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Render the full activity track once per activity bytes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (trackLayerRef.current) {
      map.removeLayer(trackLayerRef.current)
      trackLayerRef.current = null
    }

    const pts: L.LatLngExpression[] = []
    const points = activity.points
    const stride = Math.max(1, Math.floor(points.length / 3000))
    for (let i = 0; i < points.length; i += stride) {
      const p = points[i]
      if (p.lat != null && p.lon != null) pts.push([p.lat, p.lon])
    }
    if (pts.length) {
      const line = L.polyline(pts, { color: '#94a3b8', weight: 2, opacity: 0.6 }).addTo(map)
      trackLayerRef.current = line
      map.fitBounds(line.getBounds(), { padding: [20, 20] })
    }
  }, [activity])

  // Render per-finding overlays + numbered markers. Re-runs on picks
  // changes WITHOUT touching viewport.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (findingLayerRef.current) {
      findingLayerRef.current.remove()
      findingLayerRef.current = null
    }
    const group = L.layerGroup().addTo(map)
    findingLayerRef.current = group
    markersRef.current = {}

    for (const f of findings) {
      const mode: ZigzagMode = picks[f.number] ?? 'keep'
      const fixing = mode === 'fix'

      // The line that COUNTS toward the final distance is bold; the line
      // that's being skipped is greyed out. When `keep`, the original red
      // track stays in the file → bold red. When `fix`, the teal preview
      // replaces it → bold teal, and the original is greyed.
      const originalPts: L.LatLngExpression[] = []
      if (f.source === 'stationary' && f.jitter) {
        for (const p of f.jitter.points) originalPts.push([p.lat, p.lon])
      } else if (f.source === 'moving' && f.loop) {
        const sorted = [...f.loop.droppedIndices].sort((a, b) => a - b)
        for (const idx of sorted) {
          const p = activity.points[idx]
          if (p?.lat != null && p?.lon != null) originalPts.push([p.lat, p.lon])
        }
      }
      if (originalPts.length >= 2) {
        L.polyline(originalPts, {
          color: fixing ? '#94a3b8' : '#ef4444',
          weight: fixing ? 2 : 4,
          opacity: fixing ? 0.55 : 0.95,
        }).addTo(group)
      }

      // Preview (teal) — the new line the fix produces.
      if (f.newLine.length >= 2) {
        L.polyline(
          f.newLine.map(p => [p.lat, p.lon]) as L.LatLngExpression[],
          {
            color: fixing ? '#14b8a6' : '#94a3b8',
            weight: fixing ? 4 : 2,
            opacity: fixing ? 0.95 : 0.45,
            dashArray: f.source === 'moving' ? '6 4' : undefined,
          },
        ).addTo(group)
        if (f.source === 'stationary') {
          L.circleMarker([f.centroid.lat, f.centroid.lon], {
            radius: fixing ? 8 : 5,
            color: fixing ? '#14b8a6' : '#94a3b8',
            fillColor: fixing ? '#14b8a6' : '#94a3b8',
            fillOpacity: fixing ? 0.95 : 0.45,
            weight: 2,
          }).addTo(group)
        }
      }

      // Numbered marker at the finding centroid.
      if (!Number.isFinite(f.centroid.lat) || !Number.isFinite(f.centroid.lon)) continue
      const markerClass = fixing ? 'selected' : ''
      const icon = L.divIcon({
        className: '',
        html: `<div class="marker-num ${markerClass}" title="${f.source}">${f.number}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      })
      const m = L.marker([f.centroid.lat, f.centroid.lon], { icon }).addTo(group)
      m.bindPopup(
        `<b>#${f.number} — ${f.source === 'stationary' ? 'stood still' : 'moving zigzag'}</b><br>` +
        `duration: ${Math.round(f.durationS)} s<br>` +
        (f.estimatedSavingM > 0 ? `phantom: ~${Math.round(f.estimatedSavingM)} m` : ''),
      )
      m.on('click', () => onCycle(f.number))
      markersRef.current[f.number] = m
    }
  }, [findings, picks, onCycle, activity])

  // Hover spotlight — a pulsing ring over the hovered finding's centroid.
  // Does NOT touch the viewport so the user can scan rows quickly.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (hoverLayerRef.current) {
      hoverLayerRef.current.remove()
      hoverLayerRef.current = null
    }
    if (hoverOn == null) return
    const f = findings.find(ff => ff.number === hoverOn)
    if (!f) return
    if (!Number.isFinite(f.centroid.lat) || !Number.isFinite(f.centroid.lon)) return
    const group = L.layerGroup().addTo(map)
    hoverLayerRef.current = group
    L.circleMarker([f.centroid.lat, f.centroid.lon], {
      radius: 18,
      color: '#facc15',
      weight: 3,
      opacity: 0.95,
      fillColor: '#facc15',
      fillOpacity: 0.18,
    }).addTo(group)
  }, [hoverOn, findings])

  // Focus a specific finding.
  useEffect(() => {
    if (focusOn == null) return
    const f = findings.find(ff => ff.number === focusOn)
    const map = mapRef.current
    if (!f || !map) return
    let bounds: L.LatLngBounds | null = null
    if (f.source === 'stationary' && f.jitter) {
      const pts: L.LatLngExpression[] = f.jitter.points.map(p => [p.lat, p.lon])
      if (pts.length >= 2) bounds = L.latLngBounds(pts as L.LatLngTuple[])
    } else if (f.source === 'moving' && f.loop) {
      const pts: L.LatLngExpression[] = []
      for (const idx of f.loop.droppedIndices) {
        const p = activity.points[idx]
        if (p?.lat != null && p?.lon != null) pts.push([p.lat, p.lon])
      }
      if (pts.length >= 2) bounds = L.latLngBounds(pts as L.LatLngTuple[])
    }
    if (bounds) {
      map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 19, duration: 0.6 })
    } else {
      map.flyTo([f.centroid.lat, f.centroid.lon], 18, { duration: 0.6 })
    }
    markersRef.current[focusOn]?.openPopup()
  }, [focusOn, findings, activity])

  return (
    <div
      ref={mapEl}
      className="w-full h-[60vh] lg:h-[clamp(400px,calc(100vh-560px),620px)] rounded-xl overflow-hidden border border-slate-800"
    />
  )
}
