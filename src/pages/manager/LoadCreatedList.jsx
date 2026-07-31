import { useState } from 'react'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, F, Inp } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import RouteMapSheet from '../../components/RouteMapSheet.jsx'
import { bearing, angularDiff } from '../../lib/geo.js'

const statusLabel = (s) => s === 'waiting_driver_acceptance' ? 'Waiting Driver Acceptance' : s

export default function LoadCreatedList() {
  const { showToast } = useData()
  const [loads, setLoads] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [allocating, setAllocating] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [pickVehicle, setPickVehicle] = useState('')
  const [pickWarehouse, setPickWarehouse] = useState('')
  const [busy, setBusy] = useState(false)
  const [showingRouteFor, setShowingRouteFor] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [pickDriver, setPickDriver] = useState('')

  const loadLoads = async () => {
    const { data } = await db.fetchLoads()
    setLoads(data || [])
    setLoaded(true)
    return data || []
  }
  if (!loaded) loadLoads()

  const loadItemTotals = (load) => (load.items || []).filter(it => !it.cancelled).reduce((acc, it) => ({
    qty: acc.qty + it.final_qty,
    weight: acc.weight + (it.weight || 0) * it.final_qty,
    volume: acc.volume + (it.volume || 0) * it.final_qty,
    value: acc.value + it.rate * it.final_qty,
  }), { qty: 0, weight: 0, volume: 0, value: 0 })

  const unallocated = loads.filter(l => !l.allocation_id)

  const allocationGroups = () => {
    const groups = {}
    loads.filter(l => l.allocation_id).forEach(l => {
      if (!groups[l.allocation_id]) groups[l.allocation_id] = { allocation: l.allocation, loads: [] }
      groups[l.allocation_id].loads.push(l)
    })
    return Object.entries(groups)
  }

  const toggleSelect = (id) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  const selectedLoads = loads.filter(l => selectedIds.includes(l.id))
  const combinedTotals = selectedLoads.reduce((acc, l) => {
    const t = loadItemTotals(l)
    return { qty: acc.qty + t.qty, weight: acc.weight + t.weight, volume: acc.volume + t.volume, value: acc.value + t.value }
  }, { qty: 0, weight: 0, volume: 0, value: 0 })

  const openAllocate = async () => {
    const { data: vData } = await db.fetchVehicles()
    const { data: wData } = await db.fetchWarehouses()
    const { data: dData } = await db.fetchDrivers()
    setVehicles((vData || []).filter(v => v.status === 'Active'))
    setWarehouses(wData || [])
    setDrivers((dData || []).map(d => ({ id: d.member_id, name: d.member?.name || d.name })))
    setPickVehicle(''); setPickWarehouse(''); setPickDriver('')
    setAllocating(true)
  }

  const suitableVehicles = vehicles.filter(v =>
    (v.weight_capacity || 0) >= combinedTotals.weight && (v.volume_capacity || 0) >= combinedTotals.volume
  )
const directionWarning = () => {
    const wh = warehouses.find(w => w.id === pickWarehouse)
    if (!wh || !wh.latitude || !wh.longitude) return null
    const pts = selectedLoads
      .filter(l => l.distributor?.confirmed_latitude && l.distributor?.confirmed_longitude)
      .map(l => ({
        name: l.distributor.name,
        bearing: bearing(wh.latitude, wh.longitude, l.distributor.confirmed_latitude, l.distributor.confirmed_longitude),
      }))
    if (pts.length < 2) return null
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const diff = angularDiff(pts[i].bearing, pts[j].bearing)
        if (diff > 90) {
          return `${pts[i].name} and ${pts[j].name} are in significantly different directions from the warehouse (${Math.round(diff)}° apart) — this route may involve backtracking.`
        }
      }
    }
    return null
  }
  const confirmAllocate = async () => {
    if (!pickVehicle || !pickWarehouse || !pickDriver) { showToast('Select vehicle, warehouse, and driver'); return }
    setBusy(true)
    const { error } = await db.allocateVehicle(selectedIds, pickVehicle, pickWarehouse, pickDriver)
    setBusy(false)
    if (error) { showToast('Error allocating vehicle'); return }
    const fresh = await loadLoads()
    const justAllocated = fresh.find(l => selectedIds.includes(l.id) && l.allocation_id)
    setAllocating(false)
    setSelectedIds([])
    showToast('Vehicle allocated — Waiting Driver Acceptance')
    if (justAllocated) setShowingRouteFor(justAllocated.allocation_id)
  }
const deallocate = async (allocationId) => {
    if (!window.confirm('Deallocate this vehicle? Loads will return to the unallocated list.')) return
    const { error } = await db.deallocateVehicle(allocationId)
    if (error) { showToast('Error deallocating'); return }
    await loadLoads()
    showToast('Vehicle deallocated')
  }

  return (
    <div>
      <Card>
        <CH title="Load Created — Awaiting Allocation" sub={`${unallocated.length} load(s)`}
          right={selectedIds.length > 0 && <Btn sm v="pri" onClick={openAllocate}>Allocate Vehicle ({selectedIds.length})</Btn>} />
        {unallocated.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No unallocated loads</div>}
        {unallocated.map(l => {
          const t = loadItemTotals(l)
          const checked = selectedIds.includes(l.id)
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <input type="checkbox" checked={checked} onChange={() => toggleSelect(l.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{l.load_id} — {l.distributor?.name}{l.distributor?.town ? `, ${l.distributor.town}` : ''}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Qty {t.qty} · {t.weight.toFixed(1)} kg · {t.volume.toFixed(2)} cu.ft · {F(t.value)}</div>
              </div>
            </div>
          )
        })}
      </Card>

      <Card>
        <CH title="Vehicle Allocations" sub={`${allocationGroups().length} allocation(s)`} />
        {allocationGroups().length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No allocations yet</div>}
        {allocationGroups().map(([allocId, g]) => {
          const totals = g.loads.reduce((acc, l) => {
            const t = loadItemTotals(l)
            return { qty: acc.qty + t.qty, weight: acc.weight + t.weight, volume: acc.volume + t.volume, value: acc.value + t.value }
          }, { qty: 0, weight: 0, volume: 0, value: 0 })
          return (
            <div key={allocId} style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Allocation {allocId}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>{statusLabel(g.allocation?.status)}</div>
              </div>
              <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
                Vehicle: {g.allocation?.vehicle?.vehicle_number} · Warehouse: {g.allocation?.warehouse?.name}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                {g.loads.length} load(s) · Qty {totals.qty} · {totals.weight.toFixed(1)} kg · {totals.volume.toFixed(2)} cu.ft · {F(totals.value)}
              </div>
              {g.loads.map(l => (
                <div key={l.id} style={{ fontSize: 12, color: '#6b7280', padding: '2px 0' }}>• {l.load_id} — {l.distributor?.name}</div>
              ))}
<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Btn sm onClick={() => setShowingRouteFor(allocId)}>View Route</Btn>
                <Btn sm v="bad" onClick={() => deallocate(allocId)}>Deallocate Vehicle</Btn>
              </div>
            </div>
          )
        })}
      </Card>

      {allocating && (
        <Sheet title="Allocate Vehicle" sub={`${selectedIds.length} load(s) selected`} onClose={() => setAllocating(false)}>
          <Card style={{ background: '#f9fafb' }}>
            <div style={{ padding: 12, fontSize: 12 }}>
              <div>Total Qty: {combinedTotals.qty}</div>
              <div>Total Weight: {combinedTotals.weight.toFixed(1)} kg</div>
              <div>Total Volume: {combinedTotals.volume.toFixed(2)} cu.ft</div>
              <div>Total Value: {F(combinedTotals.value)}</div>
            </div>
          </Card>
          <Inp label="Vehicle" value={pickVehicle} onChange={setPickVehicle}
            options={[{ value: '', label: 'Select vehicle...' }, ...suitableVehicles.map(v => ({ value: v.id, label: `${v.vehicle_number} (${v.weight_capacity}kg / ${v.volume_capacity}cu.ft)` }))]} />
          {suitableVehicles.length === 0 && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>No vehicle has enough capacity for this combined load.</div>}
          <Inp label="Warehouse (origin)" value={pickWarehouse} onChange={setPickWarehouse}
            options={[{ value: '', label: 'Select warehouse...' }, ...warehouses.map(w => ({ value: w.id, label: w.name }))]} />
           <Inp label="Driver" value={pickDriver} onChange={setPickDriver}
            options={[{ value: '', label: 'Select driver...' }, ...drivers.map(d => ({ value: d.id, label: d.name }))]} /> 
          {pickWarehouse && directionWarning() && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: '#92400e' }}>
              ⚠ {directionWarning()}
            </div>
          )}
          <Btn v="pri" full disabled={busy} onClick={confirmAllocate}>
            {busy ? 'Allocating...' : (pickWarehouse && directionWarning() ? 'Confirm Anyway' : 'Confirm Allocation')}
          </Btn>
        </Sheet>
      )}

      {showingRouteFor && (() => {
        const group = loads.filter(l => l.allocation_id === showingRouteFor)
        return group.length > 0 ? <RouteMapSheet loads={group} onClose={() => setShowingRouteFor(null)} /> : null
      })()}
    </div>
  )
}