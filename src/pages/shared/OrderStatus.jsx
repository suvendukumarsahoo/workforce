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
  // Rep column only earns its place in the org-wide view (Admin/Manager/etc.) — Sales Team's own
  // list is always "themselves," a repeated column there would just be dead weight.
  const showRep = !isSalesTeam

  const th = { padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280', whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', fontSize: 12, verticalAlign: 'middle' }

  return (
    <div>
      <Card>
        <CH title={title} sub={`${visibleOrders.length} order(s)`} right={headerRight} />
        {visibleOrders.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No orders</div>}
        {visibleOrders.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: showRep ? 900 : 780 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={th}>Order #</th>
                  <th style={th}>Distributor</th>
                  {showRep && <th style={th}>Rep</th>}
                  <th style={th}>Date</th>
                  <th style={th}>Value</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map(o => {
                  const editable = onEditOrder && o.status === 'order_submitted'
                  const color = getOrderStageColor(o)
                  return (
                    <tr key={o.id} onClick={() => editable ? onEditOrder(o) : setSelected(o)}
                      style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ ...td, fontWeight: 700 }}>#{o.id}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{o.distributor?.name}</div>
                        {(o.distributor?.town || o.distributor?.area) && (
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.distributor?.town || o.distributor?.area}</div>
                        )}
                      </td>
                      {showRep && <td style={td}>{o.member?.name || '—'}</td>}
                      <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>{new Date(o.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{F(orderValue(o))}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: `${color}22`, color, whiteSpace: 'nowrap' }}>
                          {getOrderStageLabel(o)}
                        </span>
                        {editable && <div style={{ fontSize: 10, color: '#2563eb', marginTop: 3 }}>Tap to edit</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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