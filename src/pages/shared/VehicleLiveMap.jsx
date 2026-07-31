import { useEffect, useRef, useState } from 'react'
import { Card, CH, SBadge } from '../../components/ui.jsx'
import { haversineMeters } from '../../lib/geo.js'
import * as db from '../../lib/db.js'

const IDLE_THRESHOLD_MIN = 30
const MOVED_THRESHOLD_M = 50

const timeAgo = (isoDate) => {
  if (!isoDate) return 'never'
  const mins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

export default function VehicleLiveMap() {
  const [allocations, setAllocations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [locations, setLocations] = useState({})
  const [now, setNow] = useState(() => Date.now())
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(null)
  const [lastMoved, setLastMoved] = useState({})

  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef({})
  const trackedIdsRef = useRef(new Set())
  const idleNotifiedRef = useRef(new Set())

  const loadAllocations = async () => {
    const { data } = await db.fetchInTransitAllocations()
    const list = data || []
    const withOrders = await Promise.all(list.map(async a => {
      const { data: orders } = await db.fetchAllocationOrders(a.id)
      return { allocation: a, orders: orders || [] }
    }))
    setAllocations(withOrders)

    const locEntries = await Promise.all(list.map(async a => {
      const { data: loc } = await db.fetchLatestVehicleLocation(a.id)
      return [a.id, loc]
    }))
    setLocations(prev => {
      const next = { ...prev }
      locEntries.forEach(([id, loc]) => { if (loc) next[id] = loc })
      return next
    })
    setLoaded(true)
  }

  useEffect(() => {
    loadAllocations()
    const interval = setInterval(loadAllocations, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    trackedIdsRef.current = new Set(allocations.map(a => a.allocation.id))
  }, [allocations])

  // Live position pushes from the driver's Journey screen (see AllocationJourneyTile.jsx)
  useEffect(() => {
    const unsubscribe = db.subscribeVehicleLocations(row => {
      if (!trackedIdsRef.current.has(row.allocation_id)) return
      setLocations(prev => ({ ...prev, [row.allocation_id]: row }))
    })
    return unsubscribe
  }, [])

  // Track last-significant-movement per allocation for idle detection
  useEffect(() => {
    setLastMoved(prev => {
      let changed = false
      const next = { ...prev }
      Object.entries(locations).forEach(([id, loc]) => {
        if (!loc) return
        const at = new Date(loc.recorded_at).getTime()
        const prevMoved = prev[id]
        if (!prevMoved) {
          next[id] = { lat: loc.lat, lng: loc.lng, at }
          changed = true
          return
        }
        if (haversineMeters(prevMoved.lat, prevMoved.lng, loc.lat, loc.lng) > MOVED_THRESHOLD_M) {
          next[id] = { lat: loc.lat, lng: loc.lng, at }
          idleNotifiedRef.current.delete(id)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [locations])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

  // Idle alert — one notification per continuous idle episode, cleared once the vehicle moves again
  useEffect(() => {
    const interval = setInterval(() => {
      allocations.forEach(({ allocation }) => {
        const moved = lastMoved[allocation.id]
        const referenceMs = moved?.at ?? (allocation.journey_started_at ? new Date(allocation.journey_started_at).getTime() : null)
        if (!referenceMs) return
        const idleMin = (Date.now() - referenceMs) / 60000
        if (idleMin > IDLE_THRESHOLD_MIN && !idleNotifiedRef.current.has(allocation.id)) {
          idleNotifiedRef.current.add(allocation.id)
          db.createNotification({
            target_roles: ['r1'],
            title: `Vehicle idle — ${allocation.vehicle?.vehicle_number || allocation.id}`,
            body: `No movement for over ${IDLE_THRESHOLD_MIN} minutes on Load ${allocation.id}`,
            type: 'vehicle_idle',
            ref_id: allocation.id,
          })
        }
      })
    }, 60000)
    return () => clearInterval(interval)
  }, [allocations, lastMoved])

  // Map init (once)
  useEffect(() => {
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
    loadLeaflet().then(() => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const L = window.L
      const map = L.map(mapRef.current).setView([20.5, 78.9], 5)
      mapInstance.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)
      setMapReady(true)
    }).catch(() => { if (!cancelled) setMapError('Error loading map library') })

    return () => {
      cancelled = true
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, [])

  // Marker sync
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady || !window.L) return
    const L = window.L

    Object.keys(markersRef.current).forEach(id => {
      if (!locations[id]) { markersRef.current[id].remove(); delete markersRef.current[id] }
    })

    const bounds = []
    allocations.forEach(({ allocation }) => {
      const loc = locations[allocation.id]
      if (!loc) return
      bounds.push([loc.lat, loc.lng])
      const popupHtml = `<b>${allocation.vehicle?.vehicle_number || allocation.id}</b><br/>Driver: ${allocation.driver?.name || '—'}`
      if (markersRef.current[allocation.id]) {
        markersRef.current[allocation.id].setLatLng([loc.lat, loc.lng])
        markersRef.current[allocation.id].setPopupContent(popupHtml)
      } else {
        markersRef.current[allocation.id] = L.marker([loc.lat, loc.lng]).addTo(map).bindPopup(popupHtml)
      }
    })
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
  }, [locations, allocations, mapReady])

  return (
    <div>
      <Card>
        <CH title="Live Vehicle Tracking" sub={`${allocations.length} vehicle(s) in transit`} />
        {loaded && allocations.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No vehicles currently in transit</div>
        )}
        {allocations.map(({ allocation, orders }) => {
          const loc = locations[allocation.id]
          const stops = allocation.route_plan?.stops || []
          const stopIndex = allocation.delivery_stop_index || 0
          const stop = stops[stopIndex]
          const prevOrderId = stopIndex > 0 ? stops[stopIndex - 1]?.order_id : null
          const prevOrder = prevOrderId ? orders.find(o => o.id === prevOrderId) : null
          const legStartMs = stopIndex > 0
            ? (prevOrder?.arrived_at ? new Date(prevOrder.arrived_at).getTime() : null)
            : (allocation.journey_started_at ? new Date(allocation.journey_started_at).getTime() : null)
          const legElapsedMin = legStartMs ? Math.round((now - legStartMs) / 60000) : null
          const delayMin = (stop?.leg_duration_min != null && legElapsedMin !== null) ? legElapsedMin - stop.leg_duration_min : null

          const moved = lastMoved[allocation.id]
          const idleReferenceMs = moved?.at ?? (allocation.journey_started_at ? new Date(allocation.journey_started_at).getTime() : null)
          const idleMin = idleReferenceMs ? Math.round((now - idleReferenceMs) / 60000) : null
          const isIdle = idleMin !== null && idleMin > IDLE_THRESHOLD_MIN

          return (
            <div key={allocation.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{allocation.vehicle?.vehicle_number || allocation.id}</div>
                {isIdle && <SBadge s="behind" />}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                Driver: {allocation.driver?.name || '—'} · Stop {stopIndex + 1} of {stops.length}
                {stop && ` — ${stop.distributor_name}`}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {stop?.leg_duration_min != null && legElapsedMin !== null && (
                  <span style={{ color: delayMin > 10 ? '#ef4444' : '#6b7280' }}>
                    Leg est. {stop.leg_duration_min}m · elapsed {legElapsedMin}m
                    {delayMin > 10 ? ` (running ${delayMin}m late)` : ''}
                    {' · '}
                  </span>
                )}
                Last ping: {timeAgo(loc?.recorded_at)}
                {isIdle && <span style={{ color: '#ef4444', fontWeight: 600 }}> · Idle {idleMin}m</span>}
              </div>
            </div>
          )
        })}
      </Card>

      {mapError && <div style={{ padding: 14, color: '#ef4444', fontSize: 13 }}>{mapError}</div>}
      <div ref={mapRef} style={{ height: 440, borderRadius: 12, background: '#f3f4f6', border: '1px solid #e5e7eb' }} />
    </div>
  )
}
