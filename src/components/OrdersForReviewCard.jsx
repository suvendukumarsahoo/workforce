import { useState, useEffect } from 'react'
import { Card, CH } from './ui.jsx'
import OrderPickingDetail from './OrderPickingDetail.jsx'
import * as db from '../lib/db.js'

// Sales Team's own "Home" tab card (src/pages/team/TeamApp.jsx dashboard tab) — the order-creator
// fallback leg of Delegated Order Review: when Admin sends a not-fully-picked order for review and
// the creator's manager (members.manager_id) is unmapped, review_assigned_to resolves straight to
// the creator's own users.id instead, and it surfaces here rather than in OrderApproval.jsx (that
// page is Manager/Admin-only). Mirrors StockTakeScheduleCard.jsx's shape: its own fetch, its own
// due/queue list, opens the same shared OrderPickingDetail with isReviewer=true.
export default function OrdersForReviewCard({ currentUser, products, categories, showToast }) {
  const [orders, setOrders] = useState(null)
  const [payments, setPayments] = useState([])
  const [reviewOrder, setReviewOrder] = useState(null)

  const load = async () => {
    const [{ data: orderRows }, { data: payRows }] = await Promise.all([
      db.fetchAllOrdersWithItems(),
      db.fetchOrderPayments(),
    ])
    setOrders(orderRows || [])
    setPayments(payRows || [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reviewQueue = (orders || []).filter(o => String(o.review_assigned_to) === String(currentUser?.id))

  if (orders !== null && reviewQueue.length === 0) return null

  return (
    <Card style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
      <CH title="Orders Sent for Your Review" sub={`${reviewQueue.length} order(s) delegated to you by Admin`} />
      {orders === null && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>Loading...</div>}
      {reviewQueue.map(o => (
        <div key={o.id} onClick={() => setReviewOrder(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #fde68a', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
            <div style={{ fontSize: 11, color: '#92400e' }}>Requested {o.review_requested_at ? new Date(o.review_requested_at).toLocaleString('en-IN') : ''}</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Review Now</div>
        </div>
      ))}

      {reviewOrder && (
        <OrderPickingDetail
          key={`${reviewOrder.id}-${reviewOrder.picking_updated_at}`}
          order={reviewOrder}
          products={products}
          categories={categories}
          payment={payments.find(p => p.order_id === reviewOrder.id)}
          isAdmin={false}
          isReviewer={true}
          showToast={showToast}
          onClose={() => setReviewOrder(null)}
          onChanged={async (keepOpen) => {
            await load()
            if (!keepOpen) setReviewOrder(null)
          }}
        />
      )}
    </Card>
  )
}
