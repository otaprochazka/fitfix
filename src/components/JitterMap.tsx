import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { JitterCluster, RecordPoint } from '../lib/findClusters'
import { backAndForthVertices, type Resolution } from '../lib/cleanJitter'

interface Props {
  records: RecordPoint[]
  clusters: JitterCluster[]
  resolutions: Record<number, Resolution>   // 1-based cluster number → mode
  onToggle: (idx: number) => void
  focusOn?: number                          // 0-based cluster index to fly to
}

export default function JitterMap({ records, clusters, resolutions, onToggle, focusOn }: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const trackLayerRef = useRef<L.Polyline | null>(null)
  const clusterLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<L.Marker[]>([])

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
      'Esri Topo': L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 },
      ),
    }
    baseLayers['CartoDB Voyager'].addTo(map)
    L.control.layers(baseLayers, undefined, { position: 'topright', collapsed: true }).addTo(map)

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Render the full track once per records change, and fit the view to it.
  // Selecting / changing modes must NOT trigger this — otherwise the map zooms
  // out to the whole activity every time a cluster's mode toggles.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (trackLayerRef.current) {
      map.removeLayer(trackLayerRef.current)
      trackLayerRef.current = null
    }

    const trackPts: L.LatLngExpression[] = []
    for (let i = 0; i < records.length; i += Math.max(1, Math.floor(records.length / 3000))) {
      trackPts.push([records[i].lat, records[i].lon])
    }
    if (trackPts.length) {
      const line = L.polyline(trackPts, { color: '#94a3b8', weight: 2, opacity: 0.6 }).addTo(map)
      trackLayerRef.current = line
      map.fitBounds(line.getBounds(), { padding: [20, 20] })
    }
  }, [records])

  // Render clusters: one polyline per cluster (red = original wander, plus an
  // orange overlay when the cluster is set to "smooth"), plus the numbered
  // marker. Re-runs on cluster / mode changes WITHOUT touching the viewport.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (clusterLayerRef.current) {
      clusterLayerRef.current.remove()
      clusterLayerRef.current = null
    }
    const group = L.layerGroup().addTo(map)
    clusterLayerRef.current = group
    markersRef.current = []

    clusters.forEach((c, i) => {
      const mode: Resolution = resolutions[i + 1] ?? 'keep'
      const dimmed = mode === 'smooth' || mode === 'pin'

      // Original wandering — shown dimmed when a fix is staged so the preview
      // line on top is unmissable.
      L.polyline(c.points.map(p => [p.lat, p.lon]) as L.LatLngExpression[], {
        color: '#ef4444', weight: 2, opacity: dimmed ? 0.35 : 0.85,
      }).addTo(group)

      // Preview overlays per mode
      if (mode === 'smooth') {
        const tri = backAndForthVertices(c)
        if (tri.length >= 2) {
          L.polyline(
            tri.map(p => [p.lat, p.lon]) as L.LatLngExpression[],
            { color: '#f97316', weight: 4, opacity: 0.95 },
          ).addTo(group)
          // Mark the apex of the detour
          L.circleMarker([tri[1].lat, tri[1].lon], {
            radius: 4, color: '#f97316', fillColor: '#f97316', fillOpacity: 1, weight: 1,
          }).addTo(group)
        }
      } else if (mode === 'pin') {
        // Show what the path becomes: previous record → centroid → next
        // record, plus a fat dot at the centroid. That makes pin's effect on
        // the surrounding track visible (otherwise the dot looks identical to
        // an unselected cluster).
        const previewPts: L.LatLngExpression[] = []
        const before = records[c.idxStart - 1]
        if (before) previewPts.push([before.lat, before.lon])
        previewPts.push([c.centroid.lat, c.centroid.lon])
        const after = records[c.idxEnd + 1]
        if (after) previewPts.push([after.lat, after.lon])
        if (previewPts.length >= 2) {
          L.polyline(previewPts, {
            color: '#14b8a6', weight: 4, opacity: 0.95,
          }).addTo(group)
        }
        L.circleMarker([c.centroid.lat, c.centroid.lon], {
          radius: 8, color: '#14b8a6', fillColor: '#14b8a6', fillOpacity: 0.95, weight: 2,
        }).addTo(group)
      }

      const markerClass =
        mode === 'smooth' ? 'smooth' :
        mode === 'pin' ? 'selected' : ''
      const icon = L.divIcon({
        className: '',
        html: `<div class="marker-num ${markerClass}">${i + 1}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      })
      const m = L.marker([c.centroid.lat, c.centroid.lon], { icon }).addTo(group)
      m.bindPopup(`
        <b>#${i + 1}</b><br>
        duration: ${formatDur(c.durationS)}<br>
        points: ${c.nPoints}<br>
        max wander: ${c.maxExcursionM.toFixed(1)} m<br>
        walked: <b>${c.pathLengthM.toFixed(0)} m</b>
      `)
      m.on('click', () => onToggle(i))
      markersRef.current.push(m)
    })
  }, [clusters, resolutions, onToggle, records])

  // Focus a specific cluster — zoom in tight enough to see the wander.
  useEffect(() => {
    if (focusOn == null) return
    const c = clusters[focusOn]
    const map = mapRef.current
    if (!c || !map) return
    const pts: L.LatLngExpression[] = c.points.map(p => [p.lat, p.lon])
    if (pts.length >= 2) {
      const bounds = L.latLngBounds(pts as L.LatLngTuple[])
      map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 19, duration: 0.6 })
    } else {
      map.flyTo([c.centroid.lat, c.centroid.lon], 18, { duration: 0.6 })
    }
    markersRef.current[focusOn]?.openPopup()
  }, [focusOn, clusters])

  return (
    <div
      ref={mapEl}
      className="w-full h-[60vh] lg:h-[clamp(400px,calc(100vh-560px),620px)] rounded-xl overflow-hidden border border-slate-800"
    />
  )
}

function formatDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`
}
