import { useState } from 'react'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, F } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const timeAgo = (isoDate) => {
  if (!isoDate) return ''
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function Picking() {
  const { products, categories, showToast, loadAll } = useData()
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState(null)
  const [localAvail, setLocalAvail] = useState({})
  const [localWaitDays, setLocalWaitDays] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const loadOrders = async () => {
    const { data } = await db.fetchPickingOrders()
    setOrders(data || [])
    setLoaded(true)
  }
  if (!loaded) loadOrders()

  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid

const needsAttention = (order) => (order.items || []).some(it => !it.cancelled && (it.availability === 'Wait' || !it.availability))
  const toPick = orders.filter(o => (o.picking_status || 'pending_picking') === 'pending_picking')
const pendingPicking = orders.filter(o => o.picking_status === 'picking_done')
  const pickingComplete = orders.filter(o => o.picking_status === 'ready_for_load' && !o.load_id)
  const openOrder = (order) => {
    setSelected(order)
    const avail = {}, days = {}
    order.items.forEach(it => {
      avail[it.id] = it.availability || 'Available'
      days[it.id] = it.wait_days || 1
    })
    setLocalAvail(avail)
    setLocalWaitDays(days)
  }

  const isUpdateMode = selected && selected.picking_status === 'picking_done'
const isItemEditable = (it) => !isUpdateMode || it.availability !== 'Available'
  const setAvail = (itemId, val) => setLocalAvail(a => ({ ...a, [itemId]: val }))
  const setWaitDays = (itemId, val) => setLocalWaitDays(d => ({ ...d, [itemId]: val }))

  const rowColor = (val) => val === 'Available' ? '#dcfce7' : val === 'Wait' ? '#ffedd5' : val === 'Unavailable' ? '#fee2e2' : '#fff'

  const summary = () => {
    if (!selected) return {}
    const groups = { Available: { qty: 0, value: 0 }, Wait: { qty: 0, value: 0 }, Unavailable: { qty: 0, value: 0 } }
    selected.items.filter(it => !it.cancelled).forEach(it => {
      const status = localAvail[it.id] || 'Available'
      groups[status].qty += it.final_qty
      groups[status].value += it.rate * it.final_qty
    })
    return groups
  }

  const fillRates = () => {
    if (!selected) return { value: 0, items: 0, qty: 0 }
    const active = selected.items.filter(it => !it.cancelled)
    const total = active.length || 1
    const totalQty = active.reduce((s, it) => s + it.final_qty, 0) || 1
    const totalValue = active.reduce((s, it) => s + it.rate * it.final_qty, 0) || 1
    const availableItems = active.filter(it => (localAvail[it.id] || 'Available') === 'Available')
    const availQty = availableItems.reduce((s, it) => s + it.final_qty, 0)
    const availValue = availableItems.reduce((s, it) => s + it.rate * it.final_qty, 0)
    return {
      value: Math.round((availValue / totalValue) * 100),
      items: Math.round((availableItems.length / total) * 100),
      qty: Math.round((availQty / totalQty) * 100),
    }
  }

  const submitPicking = async () => {
    setSubmitting(true)
    let anyIncomplete = false
    for (const it of selected.items) {
      if (it.cancelled) continue
      if (!isItemEditable(it)) { if (it.availability !== 'Available') anyIncomplete = true; continue }
      const val = localAvail[it.id] || 'Available'
      if (val !== 'Available') anyIncomplete = true
      await db.updateItemAvailability(it.id, val, val === 'Wait' ? localWaitDays[it.id] : null)
    }
    const { error } = await db.submitPicking(selected.id, anyIncomplete)
    if (error) { showToast('Error submitting picking'); setSubmitting(false); return }
    await loadOrders(); await loadAll()
    setSubmitting(false); setSelected(null)
    showToast(anyIncomplete ? 'Picking submitted — pending review' : 'Picking submitted — ready for Admin final approval')
  }

  const s = summary()
  const fr = fillRates()

  return (
    <div>
      <Card>
        <CH title="To Pick" sub={`${toPick.length} order(s)`} />
        {toPick.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No orders to pick</div>}
        {toPick.map(o => (
          <div key={o.id} onClick={() => openOrder(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(o.order_date).toLocaleString('en-IN')}</div>
            </div>
            <Btn sm v="pri">Pick</Btn>
          </div>
        ))}
      </Card>

      <Card>
        <CH title="Pending Picking" sub={`${pendingPicking.length} order(s) — Waiting for Admin Approval`} />
        {pendingPicking.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
        {pendingPicking.map(o => (
          <div key={o.id} onClick={() => openOrder(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Last updated {timeAgo(o.picking_updated_at)} · Waiting for Admin Approval</div>
            </div>
            <Btn sm v="warn">Update</Btn>
          </div>
        ))}
      </Card>

      <Card>
        <CH title="Picking Complete" sub={`${pickingComplete.length} order(s) — Waiting for Admin Approval`} />
        {pickingComplete.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
        {pickingComplete.map(o => (
          <div key={o.id} onClick={() => openOrder(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Last updated {timeAgo(o.picking_updated_at)} · Waiting for Admin Approval</div>
            </div>
            <Btn sm v="ok">View</Btn>
          </div>
        ))}
      </Card>

      {selected && (
        <Sheet title={`Order #${selected.id} — ${selected.distributor?.name}`} sub={isUpdateMode ? 'Update Wait items' : 'Picking Screen'} onClose={() => setSelected(null)}>

          <Card style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
              <div><strong>Value Fill Rate:</strong> {fr.value}%</div>
              <div><strong>Item Fill Rate:</strong> {fr.items}%</div>
              <div><strong>Qty Fill Rate:</strong> {fr.qty}%</div>
            </div>
          </Card>

          <Card>
            <CH title="Summary" />
            <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
              <div>Available: Qty {s.Available?.qty || 0} · {F(s.Available?.value || 0)}</div>
              <div>Wait: Qty {s.Wait?.qty || 0} · {F(s.Wait?.value || 0)}</div>
              <div>Unavailable: Qty {s.Unavailable?.qty || 0} · {F(s.Unavailable?.value || 0)}</div>
            </div>
          </Card>

          <Card>
            <CH title="Items" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Product</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Approved Qty</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Availability</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Wait Days</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.filter(it => !it.cancelled).map(it => {
                    const editable = isItemEditable(it)
                    const val = localAvail[it.id] || 'Available'
                    return (
                      <tr key={it.id} style={{ background: rowColor(val) }}>
                        <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{productName(it.product_id)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.final_qty}</td>
                        <td style={{ padding: '8px 10px' }}>
                          {editable ? (
                            <select value={val} onChange={e => setAvail(it.id, e.target.value)}
                              style={{ padding: '5px 7px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
                              {(isUpdateMode ? ['Available', 'Unavailable'] : ['Available', 'Unavailable', 'Wait']).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <span style={{ fontSize: 12 }}>{val}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {editable && val === 'Wait' && !isUpdateMode && (
                            <select value={localWaitDays[it.id] || 1} onChange={e => setWaitDays(it.id, Number(e.target.value))}
                              style={{ padding: '5px 7px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
                              {[1, 2, 3].map(d => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
                            </select>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Btn v="pri" full disabled={submitting} onClick={submitPicking}>{submitting ? 'Submitting...' : 'Submit'}</Btn>
        </Sheet>
      )}
    </div>
  )
}