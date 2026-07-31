import { useState } from 'react'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, F, Sheet, Tile } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import PickingEditSheet from '../../components/PickingEditSheet.jsx'
import VehicleParkedTile from '../../components/VehicleParkedTile.jsx'
import LoadingInProgressTile from '../../components/LoadingInProgressTile.jsx'


export default function WMDashboard({ onNavigate }) {
const { products, categories, showToast } = useData()
  const [tab, setTab] = useState('today')
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [drillCategory, setDrillCategory] = useState(null)
  const [drillDistributor, setDrillDistributor] = useState(null)
  const [loads, setLoads] = useState([])
  const [loadsLoaded, setLoadsLoaded] = useState(false)
  const [selectedLoad, setSelectedLoad] = useState(null)
  const [showReadyToPick, setShowReadyToPick] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [showPendingPicking, setShowPendingPicking] = useState(false)
  const [showPickingComplete, setShowPickingComplete] = useState(false)

  const loadOrders = async () => {
    const { data } = await db.fetchPickingOrders()
    setOrders(data || [])
    setLoaded(true)
  }
  const loadLoadsData = async () => {
    const { data } = await db.fetchLoads()
    setLoads(data || [])
    setLoadsLoaded(true)
  }
  if (!loadsLoaded) loadLoadsData()
  if (!loaded) loadOrders()

  const isToday = (iso) => {
    const d = new Date(iso), t = new Date()
    return d.toDateString() === t.toDateString()
  }
  const isThisMonth = (iso) => {
    const d = new Date(iso), t = new Date()
    return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
  }

  const relevantOrders = orders.filter(o => tab === 'today' ? isToday(o.order_date) : isThisMonth(o.order_date))

  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'
  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid
  const readyToPickOrders = orders.filter(o => (o.picking_status || 'pending_picking') === 'pending_picking')
  const readyToPickValue = readyToPickOrders.reduce((s, o) => s + (o.items || []).filter(it => !it.cancelled).reduce((ss, it) => ss + it.rate * it.final_qty, 0), 0)
  const pendingPickingOrders = orders.filter(o => o.picking_status === 'picking_done')
  const pickingCompleteOrders = orders.filter(o => o.picking_status === 'ready_for_load' && !o.load_id)
  const loadQtyVolume = (load) => (load.items || []).filter(it => !it.cancelled).reduce((acc, it) => ({
    qty: acc.qty + it.final_qty,
    volume: acc.volume + (it.volume || 0) * it.final_qty,
  }), { qty: 0, volume: 0 })

  const categoryTiles = () => {
    const groups = {}
    relevantOrders.forEach(o => {
      ;(o.items || []).filter(it => !it.cancelled).forEach(it => {
        const key = categoryName(it.category_id)
        if (!groups[key]) groups[key] = { qty: 0, value: 0 }
        groups[key].qty += it.order_qty
        groups[key].value += it.rate * it.order_qty
      })
    })
    return groups
  }

  const orderReceived = { count: relevantOrders.length, value: relevantOrders.reduce((s, o) => s + (o.items || []).filter(it => !it.cancelled).reduce((ss, it) => ss + it.rate * it.order_qty, 0), 0) }

  const catTiles = categoryTiles()

  const categoryDrillItems = () => {
    if (!drillCategory) return []
    const rows = []
    relevantOrders.forEach(o => {
      ;(o.items || []).filter(it => !it.cancelled && categoryName(it.category_id) === drillCategory).forEach(it => {
        rows.push({ ...it, orderId: o.id, distributorName: o.distributor?.name })
      })
    })
    return rows
  }

  const distributorGroups = () => {
    const groups = {}
    relevantOrders.forEach(o => {
      const key = o.distributor?.name || 'Unknown'
      if (!groups[key]) groups[key] = { orders: [], value: 0 }
      const val = (o.items || []).filter(it => !it.cancelled).reduce((s, it) => s + it.rate * it.order_qty, 0)
      groups[key].orders.push(o)
      groups[key].value += val
    })
    return groups
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setTab('today')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === 'today' ? '#2563eb' : '#f3f4f6', color: tab === 'today' ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer' }}>Today</button>
        <button onClick={() => setTab('monthly')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === 'monthly' ? '#2563eb' : '#f3f4f6', color: tab === 'monthly' ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer' }}>Monthly</button>
      </div>
<Tile icon="📦" label="Orders Ready to Pick" value={readyToPickOrders.length} sub={F(readyToPickValue)} color="#2563eb" onClick={() => setShowReadyToPick(true)} />
  <Tile icon="🔧" label="Pending Picking" value={pendingPickingOrders.length} sub="Waiting for Admin" color="#f59e0b" onClick={() => setShowPendingPicking(true)} />
        <Tile icon="✅" label="Picking Complete" value={pickingCompleteOrders.length} sub="Waiting for Admin" color="#10b981" onClick={() => setShowPickingComplete(true)} />
<Tile icon="🚛" label="Load List" value={loads.length} sub="Tap to view" color="#0891b2" onClick={() => setSelectedLoad('list')} />
<VehicleParkedTile /><LoadingInProgressTile />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
        <Tile icon="📥" label="Orders Received" value={orderReceived.count} sub={F(orderReceived.value)} color="#2563eb" />
        {Object.entries(catTiles).map(([cat, s]) => (
          <Tile key={cat} icon="📦" label={cat} value={s.qty} sub={F(s.value)} onClick={() => setDrillCategory(cat)} />
        ))}
        {Object.keys(catTiles).length === 0 && (
          <div style={{ gridColumn: '1 / -1', color: '#9ca3af', fontSize: 13, padding: 20, textAlign: 'center' }}>No orders yet</div>
        )}
      </div>

      <Card>
        <CH title="Orders by Distributor" sub="Tap a distributor to view their orders" />
        <div style={{ padding: 14 }}>
          {Object.entries(distributorGroups()).map(([name, g]) => (
            <div key={name} onClick={() => setDrillDistributor({ name, orders: g.orders })} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{g.orders.length} order(s) · {F(g.value)}</span>
            </div>
          ))}
          {Object.keys(distributorGroups()).length === 0 && <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>No orders</div>}
        </div>
      </Card>

      <Card>
        <CH title="Orders" sub={`${relevantOrders.length} order(s)`} />
        {relevantOrders.map(o => (
          <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(o.order_date).toLocaleString('en-IN')}</div>
            </div>
          </div>
        ))}
      </Card>

      {drillCategory && (
        <Sheet title={drillCategory} sub="Product-level breakdown" onClose={() => setDrillCategory(null)}>
          {categoryDrillItems().map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{productName(it.product_id)}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Order #{it.orderId} · {it.distributorName}</div>
              </div>
              <div style={{ fontSize: 12 }}>{it.order_qty} · {F(it.rate * it.order_qty)}</div>
            </div>
          ))}
        </Sheet>
      )}

      {drillDistributor && (
        <Sheet title={drillDistributor.name} sub="Order-level breakdown" onClose={() => setDrillDistributor(null)}>
          {drillDistributor.orders.map(o => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Order #{o.id}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{new Date(o.order_date).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </Sheet>
      )}
      {selectedLoad === 'list' && (
        <Sheet title="Load List" sub={`${loads.length} load(s)`} onClose={() => setSelectedLoad(null)}>
          {loads.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No loads created yet</div>}
          {loads.map(l => {
            const qv = loadQtyVolume(l)
            return (
              <div key={l.id} onClick={() => setSelectedLoad(l)} style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{l.load_id} — {l.distributor?.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{l.distributor?.town || l.distributor?.area || '—'}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Qty: {qv.qty} · Volume: {qv.volume.toFixed(2)} cu.ft</div>
              </div>
            )
          })}
        </Sheet>
      )}

      {selectedLoad && selectedLoad !== 'list' && (
        <Sheet title={`${selectedLoad.load_id} — ${selectedLoad.distributor?.name}`} sub={selectedLoad.distributor?.town || selectedLoad.distributor?.area} onClose={() => setSelectedLoad('list')}>
          <Card>
            <CH title="Items" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Product</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Qty</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Volume</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedLoad.items || []).filter(it => !it.cancelled).map(it => (
                    <tr key={it.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{productName(it.product_id)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.final_qty}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{((it.volume || 0) * it.final_qty).toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.availability || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Sheet>
      )}
      {showReadyToPick && (
        <Sheet title="Orders Ready to Pick" sub={`${readyToPickOrders.length} order(s)`} onClose={() => setShowReadyToPick(false)}>
          {readyToPickOrders.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No orders waiting to be picked</div>}
          {readyToPickOrders.map(o => {
            const val = (o.items || []).filter(it => !it.cancelled).reduce((s, it) => s + it.rate * it.final_qty, 0)
            return (
              <div key={o.id} onClick={() => { setShowReadyToPick(false); setEditingOrder(o) }}
                style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(o.order_date).toLocaleString('en-IN')} · {F(val)}</div>
              </div>
            )
          })}
        </Sheet>
      )}
      {showPendingPicking && (
        <Sheet title="Pending Picking" sub={`${pendingPickingOrders.length} order(s) — Waiting for Admin Approval`} onClose={() => setShowPendingPicking(false)}>
          {pendingPickingOrders.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {pendingPickingOrders.map(o => (
            <div key={o.id} onClick={() => { setShowPendingPicking(false); setEditingOrder(o) }} style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Waiting for Admin Approval</div>
            </div>
          ))}
        </Sheet>
      )}

      {showPickingComplete && (
        <Sheet title="Picking Complete" sub={`${pickingCompleteOrders.length} order(s) — Waiting for Admin Approval`} onClose={() => setShowPickingComplete(false)}>
          {pickingCompleteOrders.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {pickingCompleteOrders.map(o => (
            <div key={o.id} onClick={() => { setShowPickingComplete(false); setEditingOrder(o) }} style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Waiting for Admin Approval</div>
            </div>
          ))}
        </Sheet>
      )}

      {editingOrder && (
        <PickingEditSheet
          order={editingOrder} products={products} showToast={showToast}
          onClose={() => setEditingOrder(null)}
          onSubmitted={async () => { await loadOrders(); setEditingOrder(null) }}
        />
      )}
    </div>
  )
}