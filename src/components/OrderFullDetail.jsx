import { useState } from 'react'
import { Card, CH, Btn, Sheet, F } from './ui.jsx'
import OrderTimeline from './OrderTimeline.jsx'
import * as db from '../lib/db.js'

export default function OrderFullDetail({ order, payment, products, canCreateLoad = false, onClose, onChanged }) {  const [busy, setBusy] = useState(false)
  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid
  const activeItems = (order.items || []).filter(it => !it.cancelled)
  const total = activeItems.reduce((s, it) => s + it.rate * it.final_qty, 0)
const pickingStarted = ['picking_done', 'ready_for_load'].includes(order.picking_status) || !!order.load_id
  const summary = (() => {
    const groups = { Available: { qty: 0, value: 0 }, Wait: { qty: 0, value: 0 }, Unavailable: { qty: 0, value: 0 }, Pending: { qty: 0, value: 0 } }
    activeItems.forEach(it => {
      const status = it.availability || 'Pending'
      groups[status].qty += it.final_qty
      groups[status].value += it.rate * it.final_qty
    })
    return groups
  })()

  const fillRate = (() => {
    const totalItems = activeItems.length || 1
    const totalQty = activeItems.reduce((s, it) => s + it.final_qty, 0) || 1
    const totalValue = total || 1
    return {
      value: Math.round((summary.Available.value / totalValue) * 100),
      items: Math.round((activeItems.filter(it => it.availability === 'Available').length / totalItems) * 100),
      qty: Math.round((summary.Available.qty / totalQty) * 100),
    }
  })()

  const createLoad = async () => {
    setBusy(true)
    const { error } = await db.createLoad(order.id)
    setBusy(false)
    if (error) { alert('Error creating load'); return }
    onChanged()
  }

  return (
    <Sheet title={`Order #${order.id} — ${order.distributor?.name}`} sub={order.load_id ? `Load: ${order.load_id}` : 'Ready for Load'} onClose={onClose}>
      <Card>
        <CH title="Timeline" />
        <div style={{ padding: '0 14px' }}><OrderTimeline order={order} /></div>
      </Card>

      <Card>
        <CH title="Distributor Details" />
        <div style={{ padding: 14, fontSize: 12 }}>
          <div><strong>{order.distributor?.name}</strong></div>
          <div>{order.distributor?.area}{order.distributor?.town ? `, ${order.distributor.town}` : ''}</div>
          <div style={{ marginTop: 6, color: '#6b7280' }}>Ordered by: {order.member?.name}</div>
        </div>
      </Card>

      {payment && (
        <Card>
          <CH title="Payment Details" />
          <div style={{ padding: 14, fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            <div><strong>{payment.mode_of_payment}</strong> · {payment.transaction_id}</div>
            <div>{payment.bank_name}, {payment.bank_branch}</div>
            <div>Amount: <strong>{F(payment.transaction_amount)}</strong></div>
          </div>
        </Card>
      )}

      {pickingStarted && (
        <>
          <Card>
            <CH title="Fill Rate Summary" />
            <div style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
              <div><strong>Value Fill Rate:</strong> {fillRate.value}%</div>
              <div><strong>Item Fill Rate:</strong> {fillRate.items}%</div>
              <div><strong>Qty Fill Rate:</strong> {fillRate.qty}%</div>
            </div>
          </Card>

          <Card>
            <CH title="Summary" />
            <div style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
              <div>Picking Done: Qty {summary.Available.qty} · {F(summary.Available.value)}</div>
              <div>Wait: Qty {summary.Wait.qty} · {F(summary.Wait.value)}</div>
              <div>Unavailable: Qty {summary.Unavailable.qty} · {F(summary.Unavailable.value)}</div>
              {summary.Pending.qty > 0 && <div style={{ color: '#9ca3af' }}>Pending: Qty {summary.Pending.qty} · {F(summary.Pending.value)}</div>}
            </div>
          </Card>
        </>
      )}

      <Card>
        <CH title="Items" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Product</th>
                <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Order Qty</th>
                <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Mgr Approved</th>
                {pickingStarted && <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Picked Qty</th>}
                <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Amount</th>
                {pickingStarted && <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Status</th>}
              </tr>
            </thead>
            <tbody>
              {activeItems.map(it => {
                const statusLabel = it.availability === 'Available' ? 'Picking Done'
                  : it.availability === 'Wait' ? `Wait${it.wait_days ? ` (${it.wait_days}d)` : ''}`
                  : it.availability === 'Unavailable' ? 'Unavailable'
                  : 'Pending'
                const statusColor = it.availability === 'Available' ? '#10b981'
                  : it.availability === 'Wait' ? '#f59e0b'
                  : it.availability === 'Unavailable' ? '#ef4444'
                  : '#9ca3af'
                return (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{productName(it.product_id)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.order_qty}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: it.approved_qty !== it.order_qty ? '#f59e0b' : 'inherit', fontWeight: it.approved_qty !== it.order_qty ? 600 : 400 }}>
                      {it.approved_qty}{it.approved_qty !== it.order_qty ? ' *' : ''}
                    </td>
                    {pickingStarted && <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.final_qty}</td>}
<td style={{ padding: '8px 10px', fontSize: 12 }}>{F(it.rate * (pickingStarted ? it.final_qty : it.order_qty))}</td>
{pickingStarted && <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: statusColor }}>{statusLabel}</td>}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 700 }}>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>Grand Total</td>
                <td style={{ padding: '8px 10px', fontSize: 12 }}>{activeItems.reduce((s, it) => s + it.order_qty, 0)}</td>
                {pickingStarted && <td style={{ padding: '8px 10px', fontSize: 12 }}>{activeItems.reduce((s, it) => s + it.final_qty, 0)}</td>}
                <td style={{ padding: '8px 10px', fontSize: 12 }}>{F(pickingStarted ? total : activeItems.reduce((s, it) => s + it.rate * it.order_qty, 0))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {(() => {
        const activeForClean = (order.items || []).filter(it => !it.cancelled)
        const isFullyAvailable = activeForClean.length > 0 && activeForClean.every(it => it.availability === 'Available')
        if (order.load_id) {
          return <div style={{ textAlign: 'center', padding: 12, color: '#10b981', fontWeight: 700 }}>✓ Load {order.load_id} Created</div>
        }
        if (!canCreateLoad) {
          return order.picking_status === 'ready_for_load'
            ? <div style={{ textAlign: 'center', padding: 12, color: '#9ca3af', fontSize: 12 }}>Ready for load — create from Order Approval</div>
            : <div style={{ textAlign: 'center', padding: 12, color: '#9ca3af', fontSize: 12 }}>Not yet ready for load creation</div>
        }
        if (order.picking_status !== 'ready_for_load') {
          return <div style={{ textAlign: 'center', padding: 12, color: '#9ca3af', fontSize: 12 }}>Not yet ready for load creation</div>
        }
        if (!isFullyAvailable) {
          return <div style={{ textAlign: 'center', padding: 12, color: '#ef4444', fontSize: 12 }}>Order has Unavailable items — resolve before creating load</div>
        }
        return <Btn v="pri" full disabled={busy} onClick={createLoad}>{busy ? 'Creating...' : 'Create Load'}</Btn>
      })()}
    </Sheet>
  )
}