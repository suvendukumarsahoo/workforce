import { useEffect, useRef, useState } from 'react'
import { useData } from '../../hooks/useData.jsx'

/**
 * Standalone "Geographical Business View" page (Admin/Manager, per Settings menu access — see
 * Recurring Bug Pattern #6 in CLAUDE.md, mirrored into both WebApp.jsx's ALL_MENUS and
 * Settings.jsx's separate copy) — every real distributor plotted on a map, colored by how recently
 * they've billed: green = billed this calendar month, orange = billed within the last 3 months (but
 * not this one), red = not billed within the last 3 months (or never). Pure client-side derivation
 * off `distributors`/`invoices`, both already loaded globally via useData() — no new fetch, no new
 * db.js function, no schema change.
 *
 * Originally built as an inline Dashboard.jsx section (2 Aug 2026 session — sic, actually 4 Aug
 * 2026); moved to its own routed page same session per user's follow-up ask, so it now reads
 * distributors/invoices from useData() directly instead of taking them as props.
 *
 * Map plumbing (CDN Leaflet loader, map init, marker-sync-by-id) mirrors VehicleLiveMap.jsx's
 * pattern exactly, minus the polling/realtime/idle-detection parts this static view doesn't need.
 * Colored dot markers (Leaflet has no built-in colored pin) are new to this codebase — both other
 * map files use the plain default marker.
 */

const BUCKET_COLOR = { green: '#34d399', orange: '#fbbf24', red: '#f87171' }
const BUCKET_LABEL = { green: 'Billed This Month', orange: 'Billed Last 3 Months', red: 'Not Billed 3+ Months' }

// Odisha state's approximate real bounding box (India) — this app has no state-boundary GeoJSON
// (drawing the actual outline was explicitly deferred), so "state map of Odisha" here means: the
// map always shows this fixed extent, rather than auto-fitting/zooming to wherever the plotted
// distributors happen to be (which could zoom in too tight, or — if a distributor's coordinates are
// ever bad data — zoom out to show unrelated regions).
const ODISHA_BOUNDS = [[17.7, 81.3], [22.75, 87.6]]

const darkContainer = { background: '#0f172a', borderRadius: 16, padding: 16 }
const DarkStat = ({ label, value, color }) => (
  <div style={{ background: '#1e293b', borderRadius: 12, padding: '14px 16px', flex: '1 1 150px', minWidth: 140 }}>
    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
  </div>
)

const monthIndex = d => d.getFullYear() * 12 + d.getMonth()

// Distributors that can actually be invoiced — excludes in-pipeline leads that never reached
// approval. `type` is 'New Customer' (lead) | 'Distributor' (approved) | 'Direct' — both of the
// latter two are real, billable entities.
function billableDistributors(distributors) {
  return (distributors || []).filter(d => d.type && d.type !== 'New Customer')
}

function billingStatus(distributorId, invoices, nowIdx) {
  const valid = (invoices || []).filter(i =>
    i.distributor_id === distributorId && (!i.status || i.status === 'approved'))
  if (valid.length === 0) return { bucket: 'red', lastDate: null }
  const last = valid.reduce((max, i) => {
    const d = new Date(i.date)
    return (!max || d > max) ? d : max
  }, null)
  const diff = nowIdx - monthIndex(last)
  const bucket = diff <= 0 ? 'green' : diff <= 2 ? 'orange' : 'red'
  return { bucket, lastDate: last }
}

export default function DistributorPresenceMap() {
  const { distributors, invoices } = useData()
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(null)
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef({})

  const now = new Date()
  const nowIdx = monthIndex(now)

  const billable = billableDistributors(distributors)
  const withLocation = billable.filter(d => d.confirmed_latitude != null && d.confirmed_longitude != null)
  const missingLocationCount = billable.length - withLocation.length

  const plotted = withLocation.map(d => ({ distributor: d, ...billingStatus(d.id, invoices, nowIdx) }))
  const counts = { green: 0, orange: 0, red: 0 }
  plotted.forEach(p => { counts[p.bucket]++ })

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
      const odishaBounds = L.latLngBounds(ODISHA_BOUNDS)
      // fitBounds() picks a zoom constrained by whichever container dimension is the tighter fit —
      // this map's container is much wider than it is tall, while Odisha's bounding box is roughly
      // square, so fitBounds zoomed out far enough to fit the box's *height*, leaving huge extra
      // width visible (Maharashtra-to-Bangladesh, not just Odisha). A fixed center+zoom, tuned by
      // eye against this component's actual container size, avoids that aspect-ratio mismatch.
      const map = L.map(mapRef.current, {
        maxBounds: odishaBounds.pad(0.15), // soft-restrict panning to Odisha + a small margin
        minZoom: 6,
      }).setView([20.5, 84.5], 7)
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
    const dotIcon = color => L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.5)"></div>`,
      iconSize: [14, 14],
    })

    const liveIds = new Set(plotted.map(p => p.distributor.id))
    Object.keys(markersRef.current).forEach(id => {
      if (!liveIds.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id] }
    })

    // No fitBounds-to-markers here (deliberately) — the map stays fixed on Odisha's extent (set
    // once at init) regardless of where the plotted distributors fall, per "state map of Odisha."
    plotted.forEach(({ distributor: d, bucket, lastDate }) => {
      const lat = Number(d.confirmed_latitude), lng = Number(d.confirmed_longitude)
      const color = BUCKET_COLOR[bucket]
      const lastBilledText = lastDate ? lastDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never'
      const popupHtml = `<b>${d.name}</b><br/>${d.type}<br/>Last billed: ${lastBilledText}`
      if (markersRef.current[d.id]) {
        markersRef.current[d.id].setLatLng([lat, lng])
        markersRef.current[d.id].setIcon(dotIcon(color))
        markersRef.current[d.id].setPopupContent(popupHtml)
      } else {
        markersRef.current[d.id] = L.marker([lat, lng], { icon: dotIcon(color) }).addTo(map).bindPopup(popupHtml)
      }
    })
  }, [plotted, mapReady])

  return (
    <div style={darkContainer}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {plotted.length} distributor(s) plotted
        {missingLocationCount > 0 && ` · ${missingLocationCount} missing location data`}
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        {['green', 'orange', 'red'].map(b => (
          <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cbd5e1' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: BUCKET_COLOR[b], display: 'inline-block' }} />
            {BUCKET_LABEL[b]}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {['green', 'orange', 'red'].map(b => (
          <DarkStat key={b} label={BUCKET_LABEL[b]} value={counts[b]} color={BUCKET_COLOR[b]} />
        ))}
      </div>

      {mapError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{mapError}</div>}
      <div ref={mapRef} style={{ height: 600, borderRadius: 12, background: '#1e293b' }} />
    </div>
  )
}
