import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Plan } from '../types'
import { KIND_META, hoursLabel, stamp } from '../format'
import { iconHtml } from '../icons'

function icon(kind: string, big = false) {
  const m = KIND_META[kind]
  const size = big ? 36 : 28
  return L.divIcon({
    className: 'pin',
    html: `<div style="background:${m.color};width:${size}px;height:${size}px">${iconHtml(m.icon, big ? 18 : 15)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

export interface Focus {
  lat: number
  lon: number
  n: number
}

function Controller({ points, focus }: { points: [number, number][]; focus: Focus | null }) {
  const map = useMap()
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
  }, [points, map])
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 7), { duration: 0.8 })
  }, [focus, map])
  return null
}

export function RouteMap({ plan, labels, focus }: { plan: Plan; labels: Record<number, string>; focus: Focus | null }) {
  const line = plan.route.geometry
  const split = Math.min(Math.max(plan.route.pickup_index, 1), line.length - 1)
  const toPickup = line.slice(0, split + 1)
  const loaded = line.slice(split)
  const stops = plan.stops.filter((s) => !['pickup', 'dropoff'].includes(s.kind))
  return (
    <MapContainer center={[39, -98]} zoom={4} scrollWheelZoom className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Controller points={line} focus={focus} />
      {/* white casing for contrast, then the two legs: to pickup (dashed) and loaded to drop-off (solid) */}
      <Polyline positions={line} pathOptions={{ color: '#fff', weight: 9, opacity: 0.9 }} />
      <Polyline positions={toPickup} pathOptions={{ color: '#475569', weight: 5, dashArray: '2 10', lineCap: 'round' }} />
      <Polyline positions={loaded} pathOptions={{ color: '#1d4ed8', weight: 5 }} />
      {plan.waypoints.map((w) => (
        <Marker key={w.kind} position={[w.lat, w.lon]} icon={icon(w.kind, true)} zIndexOffset={500}>
          <Popup>
            <b>{KIND_META[w.kind].label}</b>
            <br />
            {w.label}
          </Popup>
        </Marker>
      ))}
      {stops.map((s) => (
        <Marker key={s.event_id} position={[s.lat, s.lon]} icon={icon(s.kind)}>
          <Popup>
            <b>{KIND_META[s.kind].label}</b> · {hoursLabel(s.duration_min / 60)}
            <br />
            {labels[s.loc_id] ?? s.label}
            <br />
            <small>{stamp(plan.start_date, s.start)}</small>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
