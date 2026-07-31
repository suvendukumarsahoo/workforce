import { useState, useEffect } from 'react'
import { Sheet, Card, Btn, Inp } from './ui.jsx'
import * as db from '../lib/db.js'

export default function StartLoadSheet({ allocation, onClose, onStarted }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [supervisorName, setSupervisorName] = useState('')
  const [labourerNames, setLabourerNames] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await db.fetchAllocationOrders(allocation.id)
      setOrders(data || [])
      setLoading(false)
    })()
  }, [])

  const computeStopOrder = async () => {
    const wh = allocation.warehouse
    const stops = orders.filter(o => o.distributor?.confirmed_latitude && o.distributor?.confirmed_longitude)
    if (!wh?.latitude || !wh?.longitude || stops.length === 0) {
      return stops.map(o => o.id) // fallback: original order
    }
    const coordsStr = [
      `${wh.longitude},${wh.latitude}`,
      ...stops.map(o => `${o.distributor.confirmed_longitude},${o.distributor.confirmed_latitude}`),
    ].join(';')
    try {
      const res = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coordsStr}?source=first&roundtrip=false`)
      const data = await res.json()
      if (data.code !== 'Ok') return stops.map(o => o.id)
      const ordered = (data.waypoints || [])
        .map((w, i) => ({ i, order: w.waypoint_index }))
        .filter(w => w.i !== 0)
        .sort((a, b) => a.order - b.order)
        .map(w => stops[w.i - 1].id)
      return ordered
    } catch (e) {
      return stops.map(o => o.id)
    }
  }

  const handleStart = async () => {
    if (!supervisorName.trim() || !labourerNames.trim()) return
    setBusy(true)
    const deliveryOrder = await computeStopOrder()
    const loadingOrder = [...deliveryOrder].reverse() // last delivery stop loaded first
    const { error: startError } = await db.startLoad(allocation.id, supervisorName.trim(), labourerNames.trim(), loadingOrder)
    setBusy(false)
    if (startError) { setError('Error starting load'); return }
    onStarted()
  }

  return (
    <Sheet title={`Start Load — ${allocation.id}`} sub={`Vehicle: ${allocation.vehicle?.vehicle_number}`} onClose={onClose}>
      {loading && <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading order details...</div>}
      {error && <div style={{ padding: 12, color: '#ef4444', fontSize: 13 }}>{error}</div>}

      {!loading && (
        <>
          <Card style={{ background: '#f9fafb' }}>
            <div style={{ padding: 12, fontSize: 12 }}>{orders.length} order(s) on this vehicle</div>
          </Card>

          <Card>
            <div style={{ padding: 14 }}>
              <Inp label="Load Supervisor Name" value={supervisorName} onChange={setSupervisorName} placeholder="e.g. Ramesh Kumar" req />
              <Inp label="Labourer Names" value={labourerNames} onChange={setLabourerNames} placeholder="e.g. Suresh, Mohan, Anil, Vijay" req />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: -6 }}>Enter first names, comma-separated (5-6 labourers)</div>
            </div>
          </Card>

          <Btn v="pri" full disabled={busy} onClick={handleStart}>{busy ? 'Starting...' : 'Start Load'}</Btn>
        </>
      )}
    </Sheet>
  )
}