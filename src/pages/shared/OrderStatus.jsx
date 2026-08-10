import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, F } from '../../components/ui.jsx'
import OrderFullDetail from '../../components/OrderFullDetail.jsx'
import { getOrderStageLabel, getOrderStageColor } from '../../components/orderStageLabel.js'
import * as db from '../../lib/db.js'

// Also reused directly by DistributorOrder.jsx's own "My Distributor Orders" list (Sales Team) —
// that screen used to hand-roll a second, drifted copy of this exact list (a raw, permanently-stuck
// order.status string instead of getOrderStageLabel's real pipeline-wide derivation, and non-
// editable orders had no click-through to any detail at all). `title`/`headerRight` let it relabel
// the card and inject its own "+ New Order" button; `onEditOrder`, when provided, routes a still-
// editable order_submitted order into DistributorOrder.jsx's edit flow instead of opening the
// (deliberately read-only) OrderFullDetail — every other order still opens detail as normal.
export default function OrderStatus({ title = 'Order Status', headerRight, onEditOrder }) {
  const { currentUser, role } = useAuth()
  const { products } = useData()
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState(null)

  const isSalesTeam = role?.name === 'Sales Team'
  const mid = currentUser?.member_id

  const loadData = async () => {
    const { data } = await db.fetchAllOrdersWithItems()
    setOrders(data || [])
    const { data: payData } = await db.fetchOrderPayments()
    setPayments(payData || [])
    setLoaded(true)
  }
  if (!loaded) loadData()

  const visibleOrders = isSalesTeam ? orders.filter(o => o.member_id === mid) : orders
  const orderValue = o => (o.items || []).reduce((s, it) => s + (it.rate || 0) * (it.final_qty ?? it.approved_qty ?? it.order_qty), 0)

  return (
    <div>
      <Card>
        <CH title={title} sub={`${visibleOrders.length} order(s)`} right={headerRight} />
        {visibleOrders.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No orders</div>}
        {visibleOrders.map(o => {
          const editable = onEditOrder && o.status === 'order_submitted'
          return (
            <div key={o.id} onClick={() => editable ? onEditOrder(o) : setSelected(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(o.order_date).toLocaleString('en-IN')} · {F(orderValue(o))}{editable ? ' · Tap to edit' : ''}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: getOrderStageColor(o) }}>{getOrderStageLabel(o)}</div>
            </div>
          )
        })}
      </Card>

      {selected && (
        <OrderFullDetail
          order={selected} payment={payments.find(p => p.order_id === selected.id)} products={products}
          onClose={() => setSelected(null)}
          onChanged={async () => { await loadData(); setSelected(null) }}
        />
      )}
    </div>
  )
}