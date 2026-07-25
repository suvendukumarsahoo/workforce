import { useState } from 'react'
import { Card, CH, Btn, Sheet, F } from './ui.jsx'
import * as db from '../lib/db.js'

export default function PickingEditSheet({ order, products, showToast, onClose, onSubmitted }) {
  const [localAvail, setLocalAvail] = useState(() => {
    const avail = {}
    order.items.forEach(it => { avail[it.id] = it.availability || 'Available' })
    return avail
  })
  const [localWaitDays, setLocalWaitDays] = useState(() => {
    const days = {}
    order.items.forEach(it => { days[it.id] = it.wait_days || 1 })
    return days
  })
  const [submitting, setSubmitting] = useState(false)

  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid
  const isUpdateMode = order.picking_status === 'picking_done' || order.picking_status === 'ready_for_load'
  const isItemEditable = (it) => !isUpdateMode || it.availability !== 'Available'
  const setAvail = (itemId, val) => setLocalAvail(a => ({ ...a, [itemId]: val }))
  const setWaitDays = (itemId, val) => setLocalWaitDays(d => ({ ...d, [itemId]: val }))
  const rowColor = (val) => val === 'Available' ? '#dcfce7' : val === 'Wait' ? '#ffedd5' : val === 'Unavailable' ? '#fee2e2' : '#fff'

  const summary = () => {
    const groups = { Available: { qty: 0, value: 0 }, Wait: { qty: 0, value: 0 }, Unavailable: { qty: 0, value: 0 } }
    order.items.filter(it => !it.cancelled).forEach(it => {
      const status = localAvail[it.id] || 'Available'
      groups[status].qty += it.final_qty
      groups[status].value += it.rate * it.final_qty
    })
    return groups
  }

  const fillRates = () => {
    const active = order.items.filter(it => !it.cancelled)
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
    for (const it of order.items) {
      if (it.cancelled) continue
      if (!isItemEditable(it)) { if (it.availability !== 'Available') anyIncomplete = true; continue }
      const val = localAvail[it.id] || 'Available'
      if (val !== 'Available') anyIncomplete = true
      await db.updateItemAvailability(it.id, val, val === 'Wait' ? localWaitDays[it.id] : null)
    }
    const { error } = await db.submitPicking(order.id, anyIncomplete)
    setSubmitting(false)
    if (error) { showToast && showToast('Error submitting picking'); return }
    showToast && showToast(anyIncomplete ? 'Picking submitted — pending review' : 'Picking submitted — ready for Admin final approval')
    onSubmitted()
  }

  const s = summary()
  const fr = fillRates()

  return (
    <Sheet title={`Order #${order.id} — ${order.distributor?.name}`} sub={isUpdateMode ? 'Update items' : 'Picking Screen'} onClose={onClose}>
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
          <div>Available: Qty {s.Available.qty} · {F(s.Available.value)}</div>
          <div>Wait: Qty {s.Wait.qty} · {F(s.Wait.value)}</div>
          <div>Unavailable: Qty {s.Unavailable.qty} · {F(s.Unavailable.value)}</div>
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
              {order.items.filter(it => !it.cancelled).map(it => {
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
  )
}