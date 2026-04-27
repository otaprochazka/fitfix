import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { walkMessages, readField, FIT_EPOCH_S, SC_TO_DEG } from '../lib/fit'

interface Props {
  /** Bytes of any FIT file. We extract the GPS records and draw them. */
  data: Uint8Array
  /** Maximum number of polyline points to draw (subsample if needed). */
  maxPoints?: number
  /** Tailwind height class, e.g. "h-72" or "h-[40vh]". */
  heightClass?: string
}

interface Pt { lat: number; lon: number }

function extract(data: Uint8Array): Pt[] {
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

export default function TrackPreview({ data, maxPoints = 4000, heightClass = 'h-72' }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: true })
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

    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.eachLayer(l => { if (l instanceof L.Polyline || l instanceof L.CircleMarker) map.removeLayer(l) })
    const all = extract(data)
    if (!all.length) return
    const step = Math.max(1, Math.floor(all.length / maxPoints))
    const sampled = all.filter((_, i) => i % step === 0)
    const line = L.polyline(sampled.map(p => [p.lat, p.lon]) as L.LatLngExpression[], {
      color: '#2dd4bf', weight: 3, opacity: 0.85,
    }).addTo(map)
    L.circleMarker([all[0].lat, all[0].lon], {
      radius: 5, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1,
    }).bindTooltip('Start').addTo(map)
    L.circleMarker([all[all.length - 1].lat, all[all.length - 1].lon], {
      radius: 5, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1,
    }).bindTooltip('End').addTo(map)
    map.fitBounds(line.getBounds(), { padding: [16, 16] })
  }, [data, maxPoints])

  return (
    <div ref={elRef} className={`w-full ${heightClass} rounded-xl overflow-hidden border border-slate-800`} />
  )
}
