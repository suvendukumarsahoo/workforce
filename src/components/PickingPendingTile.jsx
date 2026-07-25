import { useState } from 'react'
import { Tile, Sheet, F } from './ui.jsx'
import * as db from '../lib/db.js'
import OrderPickingDetail from './OrderPickingDetail.jsx'

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

export default function PickingPendingTile({ products, categories, isAdmin }) {
  const [orders, setOrders] = useState([])
  const [orderPayments, setOrderPayments] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [drillMode, setDrillMode] = useState(null) // 'item' | 'order' | null
  const [detailOrderId, setDetailOrderId] = useState(null)
  const loadOrders = async () => {
    const { data } = await db.fetchAllOrdersWithItems()
    setOrders(data || [])
    const { data: payData } = await db.fetchOrderPayments()
    setOrderPayments(payData || [])
    setLoaded(true)
  }
  if (!loaded) loadOrders()
  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid

  const waitRows = []
  orders.forEach(o => {
    ;(o.items || []).filter(it => !it.cancelled && it.availability === 'Wait').forEach(it => {
      waitRows.push({ ...it, orderId: o.id, distributorName: o.distributor?.name, orderDate: o.order_date, pickingUpdatedAt: o.picking_updated_at })
    })
  })

  const uniqueProductIds = new Set(waitRows.map(r => r.product_id))
  const totalQty = waitRows.reduce((s, r) => s + r.final_qty, 0)
  const totalValue = waitRows.reduce((s, r) => s + r.rate * r.final_qty, 0)

  const itemGroups = () => {
    const groups = {}
    waitRows.forEach(r => {
      const key = r.product_id
      if (!groups[key]) groups[key] = { product_id: key, qty: 0, latest: r.pickingUpdatedAt || r.orderDate, occurrences: [] }
      groups[key].qty += r.final_qty
      groups[key].occurrences.push(r)
      if (new Date(r.pickingUpdatedAt || r.orderDate) > new Date(groups[key].latest)) groups[key].latest = r.pickingUpdatedAt || r.orderDate
    })
    return Object.values(groups)
  }

  const orderGroups = () => {
    const groups = {}
    waitRows.forEach(r => {
      const key = r.orderId
      if (!groups[key]) groups[key] = { orderId: key, distributorName: r.distributorName, items: [], latest: r.pickingUpdatedAt || r.orderDate }
      groups[key].items.push(r)
    })
    return Object.values(groups)
  }

  return (
    <>
{/*<Tile icon="⏳" label="PickList Pending Items" value={uniqueProductIds.size} sub={`Qty: ${totalQty} · ${F(totalValue)}`} color="#f59e0b" onClick={() => setDrillMode('item')} />*/}
      {drillMode === 'item' && (
        <Sheet title="Picking Pending — By Item" sub={`${itemGroups().length} unique product(s)`} onClose={() => setDrillMode(null)}>
          <div style={{ marginBottom: 10, textAlign: 'right' }}>
            <span onClick={() => setDrillMode('order')} style={{ fontSize: 12, color: '#2563eb', cursor: 'pointer' }}>View by Order instead →</span>
          </div>
          {itemGroups().length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No pending items</div>}
          {itemGroups().map(g => (
            <div key={g.product_id} style={{ padding: '10px 4px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{productName(g.product_id)}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Qty {g.qty}</span>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                In {g.occurrences.length} order(s) · Last update {timeAgo(g.latest)}
              </div>
              {g.occurrences.map((occ, i) => (
                <div key={i} onClick={() => setDetailOrderId(occ.orderId)} style={{ fontSize: 11, color: '#2563eb', cursor: 'pointer', padding: '2px 0' }}>
                  Order #{occ.orderId} — {occ.distributorName} · Qty {occ.final_qty} · {timeAgo(occ.pickingUpdatedAt || occ.orderDate)}
                </div>
              ))}
            </div>
          ))}
                  </Sheet>
      )}

      {drillMode === 'order' && (
        <Sheet title="Picking Pending — By Order" sub={`${orderGroups().length} order(s)`} onClose={() => setDrillMode(null)}>
          <div style={{ marginBottom: 10, textAlign: 'right' }}>
            <span onClick={() => setDrillMode('item')} style={{ fontSize: 12, color: '#2563eb', cursor: 'pointer' }}>View by Item instead →</span>
          </div>
          {orderGroups().length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No pending items</div>}
          {orderGroups().map(g => (
            <div key={g.orderId} onClick={() => setDetailOrderId(g.orderId)} style={{ padding: '10px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>Order #{g.orderId} — {g.distributorName}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{timeAgo(g.latest)}</div>
              {g.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span>{productName(it.product_id)}</span>
                  <span>Qty {it.final_qty}</span>
                </div>
              ))}
            </div>
          ))}
        </Sheet>
      )}
      {detailOrderId && (() => {
        const order = orders.find(o => o.id === detailOrderId)
        const orderPayment = orderPayments.find(p => p.order_id === detailOrderId)
        return order ? (
          <OrderPickingDetail
            key={order.id}
            order={order} products={products} categories={categories} payment={orderPayment} isAdmin={isAdmin}
            onClose={() => setDetailOrderId(null)}
            onChanged={async (keepOpen) => { await loadOrders(); if (!keepOpen) setDetailOrderId(null) }}
          />
        ) : null
      })()}
    </>
  )
}