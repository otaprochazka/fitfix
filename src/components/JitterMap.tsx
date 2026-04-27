import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { JitterCluster, RecordPoint } from '../lib/findClusters'

interface Props {
  records: RecordPoint[]
  clusters: JitterCluster[]
  selected: Set<number>          // 0-based cluster indices to collapse
  onToggle: (idx: number) => void
  focusOn?: number               // 0-based cluster index to fly to
}

export default function JitterMap({ records, clusters, selected, onToggle, focusOn }: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
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

  // Render track + clusters
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear previous overlays
    map.eachLayer(l => { if (l instanceof L.Polyline || l instanceof L.Marker) map.removeLayer(l) })
    markersRef.current = []

    const trackPts: L.LatLngExpression[] = []
    for (let i = 0; i < records.length; i += Math.max(1, Math.floor(records.length / 3000))) {
      trackPts.push([records[i].lat, records[i].lon])
    }
    if (trackPts.length) {
      const line = L.polyline(trackPts, { color: '#94a3b8', weight: 2, opacity: 0.6 }).addTo(map)
      map.fitBounds(line.getBounds(), { padding: [20, 20] })
    }

    clusters.forEach((c, i) => {
      L.polyline(c.points.map(p => [p.lat, p.lon]) as L.LatLngExpression[], {
        color: '#ef4444', weight: 2, opacity: 0.85,
      }).addTo(map)

      const isSelected = selected.has(i)
      const icon = L.divIcon({
        className: '',
        html: `<div class="marker-num ${isSelected ? 'selected' : ''}">${i + 1}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      })
      const m = L.marker([c.centroid.lat, c.centroid.lon], { icon }).addTo(map)
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
  }, [records, clusters, selected, onToggle])

  // Focus
  useEffect(() => {
    if (focusOn == null) return
    const c = clusters[focusOn]
    const map = mapRef.current
    if (!c || !map) return
    map.flyTo([c.centroid.lat, c.centroid.lon], 17, { duration: 0.6 })
    markersRef.current[focusOn]?.openPopup()
  }, [focusOn, clusters])

  return <div ref={mapEl} className="w-full h-[60vh] md:h-[70vh] rounded-xl overflow-hidden border border-slate-800" />
}

function formatDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`
}
