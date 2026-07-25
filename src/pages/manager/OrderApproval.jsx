import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, F, Inp } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import OrderStatusFlow from '../../components/OrderStatusFlow.jsx'
import OrderFullDetail from '../../components/OrderFullDetail.jsx'
import OrderPickingDetail from '../../components/OrderPickingDetail.jsx'

const statusLabels = {
  order_submitted: 'Awaiting Manager Approval',
  manager_approved_admin_pending: 'Manager Approved — Admin Pending',
  confirmed: 'Order Under Process',
  submitted_for_picking: 'Submitted for Picking',
}

export default function OrderApproval() {
  const { currentUser, role } = useAuth()
  const { products, categories, showToast, loadAll } = useData()
  const [orders, setOrders] = useState([])
  const [selected, setSelected] = useState(null)
  const [localQty, setLocalQty] = useState({})
  const [payment, setPayment] = useState(null)
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isAdmin = role?.name === 'Admin'
  const isManager = role?.name === 'Manager'
  const mid = currentUser?.member_id
const [addingItem, setAddingItem] = useState(false)
const [allPayments, setAllPayments] = useState([])
  const [completedOrder, setCompletedOrder] = useState(null)
  const [pickProduct, setPickProduct] = useState('')
  const [pickQty, setPickQty] = useState('')

  const loadOrders = async () => {
    const { data } = await db.fetchDistributorOrders()
    setOrders(data || [])
    const { data: payData } = await db.fetchOrderPayments()
    setAllPayments(payData || [])
    return data || []
  }

  const openOrder = async (order) => {
    setSelected(order)
    setOtp('')
    const initQty = {}
    order.items.forEach(it => {
      initQty[it.id] = isAdmin ? (it.final_qty ?? it.approved_qty) : (it.approved_qty ?? it.order_qty)
    })
    setLocalQty(initQty)
    const { data } = await db.fetchOrderPayments()
    setPayment((data || []).find(p => p.order_id === order.id) || null)
  }

  const relevantOrders = orders.filter(o =>
    isAdmin ? ['manager_approved_admin_pending', 'confirmed'].includes(o.status) : o.status === 'order_submitted'
  )

  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid
  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'

  const categorySummary = (order) => {
    const groups = {}
    ;(order.items || []).forEach(it => {
      const qty = Number(localQty[it.id] ?? it.order_qty)
      const key = categoryName(it.category_id)
      if (!groups[key]) groups[key] = { qty: 0, weight: 0, volume: 0, value: 0 }
      groups[key].qty += qty
      groups[key].weight += (it.weight || 0) * qty
      groups[key].volume += (it.volume || 0) * qty
      groups[key].value += (it.rate || 0) * qty
    })
    return groups
  }

  const grandTotal = (order) => (order.items || []).reduce((acc, it) => {
    const qty = Number(localQty[it.id] ?? it.order_qty)
    return {
      qty: acc.qty + qty,
      weight: acc.weight + (it.weight || 0) * qty,
      volume: acc.volume + (it.volume || 0) * qty,
      value: acc.value + (it.rate || 0) * qty,
    }
  }, { qty: 0, weight: 0, volume: 0, value: 0 })

  const managerApprove = async () => {
    if (otp !== '1234') { showToast('Invalid OTP'); return }
    setSubmitting(true)
    for (const it of selected.items) {
      const qty = Number(localQty[it.id])
      await db.updateOrderItemQty(it.id, 'approved_qty', qty)
      await db.updateOrderItemQty(it.id, 'final_qty', qty)
    }
    const { error } = await db.updateOrderStatus(selected.id, {
      status: 'manager_approved_admin_pending', manager_id: mid, manager_approved_at: new Date().toISOString(),
    })
    if (error) { showToast('Error approving order'); setSubmitting(false); return }
    await loadOrders(); await loadAll()
    setSubmitting(false); setSelected(null)
    showToast('Order approved — sent to Admin')
  }
  const usedProductIds = () => new Set((selected?.items || []).filter(it => !it.cancelled).map(it => it.product_id))

  const addItemToOrder = async () => {
    if (!pickProduct || !pickQty || Number(pickQty) <= 0) return
    const prod = (products || []).find(p => p.id === pickProduct)
    if (!prod) return
    const { error } = await db.addOrderItem(selected.id, {
      product_id: prod.id, category_id: prod.category_id,
      rate: Number(prod.price) || 0, weight: Number(prod.weight) || 0, volume: prod.volume || 0,
      order_qty: Number(pickQty),
    })
    if (error) { showToast('Error adding item'); return }
    await loadOrders()
    const refreshed = orders.find(o => o.id === selected.id)
    if (refreshed) setSelected(refreshed)
    setAddingItem(false); setPickProduct(''); setPickQty('')
    showToast('Item added')
  }

  const confirmPayment = async () => {
    if (!payment) return
    const { error } = await db.verifyOrderPayment(payment.id)
    if (error) { showToast('Error confirming payment'); return }
    setPayment(p => ({ ...p, status: 'verified' }))
    showToast('Payment confirmed')
  }

  const adminConfirmOrder = async () => {
    const needsPayment = payment !== null
    if (needsPayment && payment.status !== 'verified') { showToast('Confirm payment first'); return }
    setSubmitting(true)
    for (const it of selected.items) {
      const qty = Number(localQty[it.id])
      await db.updateOrderItemQty(it.id, 'final_qty', qty)
    }
    const { error } = await db.updateOrderStatus(selected.id, {
      status: 'confirmed', admin_confirmed_at: new Date().toISOString(),
    })
    if (error) { showToast('Error confirming order'); setSubmitting(false); return }
    await loadOrders(); await loadAll()
    setSubmitting(false); setSelected(null)
    showToast('Order confirmed')
  }
const advanceToPicking = async () => {
    setSubmitting(true)
    const { error } = await db.markSubmittedForPicking(selected.id)
    if (error) { showToast('Error updating'); setSubmitting(false); return }
    await loadOrders(); await loadAll()
    setSelected(s => ({ ...s, status: 'submitted_for_picking', submitted_for_picking_at: new Date().toISOString() }))
    setSubmitting(false)
    showToast('Marked as Submitted for Picking')
  }
  if (orders.length === 0) loadOrders()
const completedPicklist = orders.filter(o => ['ready_for_load', 'picking_done'].includes(o.picking_status) && !o.load_id)
  const catSummary = selected ? categorySummary(selected) : {}
  const gt = selected ? grandTotal(selected) : { qty: 0, weight: 0, volume: 0, value: 0 }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
      </div>
      <Card>
        <CH title="Order Approval" sub={`${relevantOrders.length} order(s) pending`} />
        {relevantOrders.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No orders pending</div>}
        {relevantOrders.map(o => (
          <div key={o.id} onClick={() => openOrder(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}{o.distributor?.town ? `, ${o.distributor.town}` : ''}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.member?.name} · {new Date(o.order_date).toLocaleString('en-IN')}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>{statusLabels[o.status] || o.status}</div>
          </div>
        ))}
      </Card>
      {isAdmin && (
        <Card>
          <CH title="Completed Picklist" sub={`${completedPicklist.length} order(s) ready for load creation`} />
          {completedPicklist.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No completed picklists</div>}
          {completedPicklist.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Order ID</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Distributor</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Items (Ord/Picked)</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Qty (Ord/Picked)</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Order Value</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {completedPicklist.map(o => {
                    const active = (o.items || []).filter(it => !it.cancelled)
                    const itemsOrdered = active.length
                    const itemsPicked = active.filter(it => it.availability === 'Available').length
                    const qtyOrdered = active.reduce((s, it) => s + it.order_qty, 0)
                    const qtyPicked = active.reduce((s, it) => s + it.final_qty, 0)
                    const value = active.reduce((s, it) => s + it.rate * it.final_qty, 0)
                    return (
                      <tr key={o.id} onClick={() => setCompletedOrder(o)} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                        <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>#{o.id}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{o.distributor?.name}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{itemsOrdered} / {itemsPicked}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{qtyOrdered} / {qtyPicked}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{F(value)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: '#6b7280' }}>{o.picking_updated_at ? new Date(o.picking_updated_at).toLocaleString('en-IN') : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {completedOrder && (() => {
        const orderPayment = allPayments.find(p => p.order_id === completedOrder.id)
        const active = (completedOrder.items || []).filter(it => !it.cancelled)
        const isClean = active.length > 0 && active.every(it => it.availability === 'Available')
        return isClean ? (
          <OrderFullDetail
            order={completedOrder}
            payment={orderPayment}
            products={products}
            canCreateLoad={true}
            onClose={() => setCompletedOrder(null)}
            onChanged={async () => { await loadOrders(); setCompletedOrder(null) }}
          />
        ) : (
          <OrderPickingDetail
            key={`${completedOrder.id}-${completedOrder.picking_updated_at}`}
            order={completedOrder}
            products={products}
            categories={categories}
            payment={orderPayment}
            isAdmin={true}
            showToast={showToast}
            onClose={() => setCompletedOrder(null)}
            onChanged={async (keepOpen) => {
              const freshOrders = await loadOrders()
              if (!keepOpen) {
                setCompletedOrder(null)
              } else {
                const refreshed = freshOrders.find(o => o.id === completedOrder.id)
                if (refreshed) setCompletedOrder(refreshed)
              }
            }}
          />
        )
      })()}

      {selected && (
<Sheet title={`Order #${selected.id} — ${selected.distributor?.name}`} sub={statusLabels[selected.status]} onClose={() => setSelected(null)}>
          <OrderStatusFlow order={selected} payment={payment} isAdmin={isAdmin} advancing={submitting} onAdvance={advanceToPicking} />
          {payment && (
            <Card style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }}>
                <div><strong>{payment.mode_of_payment}</strong> · {payment.transaction_id}</div>
                <div>{payment.bank_name}, {payment.bank_branch} (IFSC: {payment.ifsc_code})</div>
                <div>Date: {payment.transaction_date} · Amount: <strong>{F(payment.transaction_amount)}</strong></div>
                <div style={{ fontWeight: 700, color: payment.status === 'verified' ? '#10b981' : '#f59e0b' }}>
                  {payment.status === 'verified' ? '✓ Payment Verified' : 'Payment Pending Verification'}
                </div>
              </div>
            </Card>
          )}

                    <Card>
            <CH title="Order Items" right={isAdmin && selected.status === 'manager_approved_admin_pending' && <Btn sm v="pri" onClick={() => setAddingItem(true)}>+ Add Item</Btn>} />
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Product</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Order Qty</th>
                    {isAdmin && <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Mgr Approved</th>}
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{isAdmin ? 'Final Qty' : 'Approved Qty'}</th>
                    <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map(it => (
                    <tr key={it.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{productName(it.product_id)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.order_qty}</td>
                      {isAdmin && <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.approved_qty}</td>}
                      <td style={{ padding: '8px 10px' }}>
                        <input type="number" value={localQty[it.id] ?? ''} onChange={e => setLocalQty(q => ({ ...q, [it.id]: e.target.value }))}
                          style={{ width: 64, padding: '5px 7px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{F((it.rate || 0) * Number(localQty[it.id] || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </Card>

          {addingItem && (
            <Card>
              <CH title="Add New Item" />
              <div style={{ padding: 14 }}>
                <Inp label="Product" value={pickProduct} onChange={setPickProduct}
                  options={[{ value: '', label: 'Select product...' }, ...(products || []).filter(p => !usedProductIds().has(p.id)).map(p => ({ value: p.id, label: p.name }))]} />
                <Inp label="Quantity" type="number" value={pickQty} onChange={setPickQty} placeholder="0" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn v="pri" full onClick={addItemToOrder}>Add</Btn>
                  <Btn full onClick={() => setAddingItem(false)}>Cancel</Btn>
                </div>
              </div>
            </Card>
      )}

      <Card>
        <CH title="Summary" sub="Category-wise breakdown" />
            <div style={{ padding: 14 }}>
              {Object.entries(catSummary).map(([cat, s]) => (
                <div key={cat} style={{ marginBottom: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{cat}</div>
                  <div style={{ color: '#6b7280' }}>Qty: {s.qty} · Weight: {s.weight.toFixed(2)} kg · Volume: {s.volume.toFixed(2)} · Value: {F(s.value)}</div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 8, fontWeight: 700, fontSize: 13 }}>
                Grand Total: Qty {gt.qty} · Weight {gt.weight.toFixed(2)} kg · Volume {gt.volume.toFixed(2)} · Value {F(gt.value)}
              </div>
            </div>
          </Card>

          {isManager && selected.status === 'order_submitted' && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>OTP (from Distributor)</label>
                <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="1234"
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <Btn v="pri" full disabled={submitting} onClick={managerApprove}>{submitting ? 'Approving...' : 'Confirm Approval'}</Btn>
            </>
          )}

          {isAdmin && selected.status === 'manager_approved_admin_pending' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payment && payment.status !== 'verified' && (
                <Btn v="pri" full onClick={confirmPayment}>Confirm Payment</Btn>
              )}
              <Btn v="pri" full disabled={submitting || (payment && payment.status !== 'verified')} onClick={adminConfirmOrder}>
                {submitting ? 'Confirming...' : 'Confirm Order'}
              </Btn>
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}