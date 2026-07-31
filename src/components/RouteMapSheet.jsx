import { useEffect, useRef, useState } from 'react'
import { Sheet, Card } from './ui.jsx'

export default function RouteMapSheet({ loads, onClose, onRouteReady, footer }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
const [routeInfo, setRouteInfo] = useState(null)
  const [optimizedOrder, setOptimizedOrder] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

const warehouse = loads[0]?.allocation?.warehouse
  const stops = loads
    .filter(l => l.distributor?.confirmed_latitude && l.distributor?.confirmed_longitude)
    .map(l => ({
      lat: l.distributor.confirmed_latitude,
      lng: l.distributor.confirmed_longitude,
      name: l.distributor.name,
      loadId: l.load_id,
      orderId: l.id,
    }))

  useEffect(() => {
    if (!warehouse?.latitude || !warehouse?.longitude || stops.length === 0) {
      setError('Missing warehouse or distributor location data')
      setLoading(false)
      return
    }

    const loadLeaflet = () => new Promise((resolve, reject) => {
      if (window.L) return resolve()
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
      document.head.appendChild(css)
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })

    let cancelled = false

    loadLeaflet().then(async () => {
      if (cancelled || !mapRef.current) return
      const L = window.L

      const map = L.map(mapRef.current).setView([warehouse.latitude, warehouse.longitude], 10)
      mapInstance.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      L.marker([warehouse.latitude, warehouse.longitude])
        .addTo(map)
        .bindPopup(`<b>Warehouse:</b> ${warehouse.name}`)

      stops.forEach(s => {
        L.marker([s.lat, s.lng])
          .addTo(map)
          .bindPopup(`<b>${s.name}</b><br/>${s.loadId}`)
      })

      // Build OSRM coordinate string: warehouse first, then each stop in order
      const coordsStr = [
        `${warehouse.longitude},${warehouse.latitude}`,
        ...stops.map(s => `${s.lng},${s.lat}`),
      ].join(';')

      try {
        // /trip/ endpoint optimizes stop order for shortest total path; warehouse fixed as source
        const res = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coordsStr}?overview=full&geometries=geojson&source=first&roundtrip=false`)
        const data = await res.json()
        if (cancelled) return
        if (data.code !== 'Ok' || !data.trips?.length) {
          setError('Could not calculate route between these points')
          setLoading(false)
          return
        }
        const trip = data.trips[0]
        const latlngs = trip.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        const polyline = L.polyline(latlngs, { color: '#2563eb', weight: 4 }).addTo(map)
        map.fitBounds(polyline.getBounds(), { padding: [30, 30] })

        // waypoints[].waypoint_index gives the optimized visiting order (0 = warehouse)
        const order = (data.waypoints || [])
          .map((w, i) => ({ i, order: w.waypoint_index }))
          .filter(w => w.i !== 0)
          .sort((a, b) => a.order - b.order)
          .map(w => stops[w.i - 1])
        setOptimizedOrder(order)

        setRouteInfo({
          distanceKm: (trip.distance / 1000).toFixed(1),
          durationMin: Math.round(trip.duration / 60),
        })
        setLoading(false)

        if (onRouteReady) {
          let cum = 0
          const planStops = order.map((s, i) => {
            const legMin = Math.round((trip.legs?.[i]?.duration || 0) / 60)
            cum += legMin
            return { order_id: s.orderId, distributor_name: s.name, leg_duration_min: legMin, cum_eta_min: cum }
          })
          onRouteReady({
            stops: planStops,
            total_duration_min: Math.round(trip.duration / 60),
            total_distance_km: Number((trip.distance / 1000).toFixed(1)),
          })
        }
      } catch (e) {
        if (!cancelled) { setError('Error fetching route from routing service'); setLoading(false) }
      }
    }).catch(() => { if (!cancelled) { setError('Error loading map library'); setLoading(false) } })

    return () => {
      cancelled = true
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, [])

  return (
    <Sheet title="Delivery Route" sub={warehouse?.name ? `From ${warehouse.name}` : ''} onClose={onClose}>
      {error && <div style={{ padding: 14, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {loading && !error && <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>Calculating route...</div>}

      <div ref={mapRef} style={{ height: 360, borderRadius: 10, marginBottom: 14, background: '#f3f4f6' }} />

      {routeInfo && (
        <Card style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ padding: 12, fontSize: 13, fontWeight: 600, color: '#166534', display: 'flex', gap: 20 }}>
            <div>Total Distance: {routeInfo.distanceKm} km</div>
            <div>Estimated Time: {Math.floor(routeInfo.durationMin / 60)}h {routeInfo.durationMin % 60}m</div>
          </div>
        </Card>
      )}

      <Card>
        <div style={{ padding: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Stops ({stops.length}) — optimized order</div>
          {(optimizedOrder || stops).map((s, i) => (
            <div key={i} style={{ padding: '4px 0', color: '#6b7280' }}>{i + 1}. {s.name} — {s.loadId}</div>
          ))}
        </div>
      </Card>

      {footer}
    </Sheet>
  )
}