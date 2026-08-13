import { useState, useEffect } from 'react'
import { useData } from '../hooks/useData.jsx'
import { Sheet, Btn, F } from './ui.jsx'
import * as db from '../lib/db.js'
import { downloadSecondaryOrderPdf } from '../lib/printSecondaryOrder.js'

const STATUS_BADGE = {
  pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending Delivery' },
  full: { bg: '#dcfce7', color: '#15803d', label: 'Delivered — Full' },
  partial: { bg: '#fef3c7', color: '#b45309', label: 'Delivered — Partial' },
  not_delivered: { bg: '#fee2e2', color: '#b91c1c', label: 'Not Delivered' },
}

// Read-only full detail for one locked order — reached by drilling Summary row → order-no-wise
// list → this, from both DistributorSecondaryReport.jsx and SecondaryOrderDelivery.jsx. Reuses
// printSecondaryOrder.js's existing downloadSecondaryOrderPdf as-is. Delivery status/breakdown is
// purely informational here — the actual mark-delivered actions live in SecondaryOrderDelivery.jsx's
// own batch/order flows, not in this shared read-only sheet.
export default function SecondaryOrderDetailSheet({ order, onClose, zIndex }) {
  const { members } = useData()
  const [deliveryItems, setDeliveryItems] = useState(null)
  const [delivery, setDelivery] = useState(null)

  const status = order.delivery_status || 'pending'
  const badge = STATUS_BADGE[status]

  useEffect(() => {
    if (!order.delivery_id) return
    db.fetchDeliveryById(order.delivery_id).then(({ data }) => setDelivery(data || null))
    if (status === 'partial') {
      db.fetchDeliveryDetail(order.delivery_id).then(({ data }) => setDeliveryItems(data || []))
    }
  }, [order.delivery_id, status])

  const items = order.items || []
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const productName = pid => items.find(it => it.product_id === pid)?.product?.name || pid
  const memberName = mid => (members || []).find(m => String(m.id) === String(mid))?.name || mid
  const returnedFor = itemId => deliveryItems?.find(di => di.order_item_id === itemId)?.returned_qty || 0

  return (
    <Sheet title={order.id} sub={order.order_date} onClose={onClose} zIndex={zIndex}>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Distributor: <strong>{order.distributor?.name || order.distributor_id}</strong></div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Beat: <strong>{order.beat?.name || order.beat_id}</strong></div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 10 }}>Outlet: <strong>{order.outlet?.name || order.outlet_id}</strong></div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ background: badge.bg, color: badge.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{badge.label}</span>
        {delivery && (
          <span style={{ fontSize: 11, color: '#9ca3af' }}>by {memberName(delivery.member_id)} · {new Date(delivery.marked_at).toLocaleDateString('en-IN')}</span>
        )}
      </div>

      {items.map(it => (
        <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{it.product?.name || productName(it.product_id)} × {it.qty}</span>
            <span style={{ fontWeight: 600 }}>{F((Number(it.qty) || 0) * (Number(it.rate) || 0))}</span>
          </div>
          {status === 'partial' && returnedFor(it.id) > 0 && (
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>↩ {returnedFor(it.id)} returned</div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
        <span>Total</span><span>{F(total)}</span>
      </div>

      <Btn v="pri" full onClick={() => downloadSecondaryOrderPdf({ order, outletName: order.outlet?.name || order.outlet_id, productName })} style={{ marginTop: 10 }}>
        ⬇ PDF
      </Btn>
    </Sheet>
  )
}
