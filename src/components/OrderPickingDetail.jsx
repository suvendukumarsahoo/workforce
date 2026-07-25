import { useState } from 'react'
import { Card, CH, Btn, Sheet, F, Inp } from './ui.jsx'
import * as db from '../lib/db.js'

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

export default function OrderPickingDetail({ order, products, categories, payment, isAdmin, showToast, onClose, onChanged }) {
  const [addingItem, setAddingItem] = useState(false)
  const [pickProduct, setPickProduct] = useState('')
  const [pickQty, setPickQty] = useState('')
  const [busy, setBusy] = useState(false)

  const [localItems, setLocalItems] = useState(() =>
    (order.items || []).filter(it => !it.cancelled).map(it => ({ ...it, _isNew: false }))
  )

  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid

  const currentOrderValue = () => {
    const base = localItems
      .filter(it => (it.availability || 'Available') !== 'Unavailable')
      .reduce((s, it) => s + it.rate * it.final_qty, 0)
    if (addingItem && pickProduct && pickQty) {
      const prod = (products || []).find(p => p.id === pickProduct)
      if (prod) return base + (Number(prod.price) || 0) * (Number(pickQty) || 0)
    }
    return base
  }
  const paymentAmount = Number(payment?.transaction_amount) || 0

  const summary = () => {
    const groups = { Available: { qty: 0, value: 0 }, Wait: { qty: 0, value: 0 }, Unavailable: { qty: 0, value: 0 }, Pending: { qty: 0, value: 0 } }
    localItems.forEach(it => {
      const status = it.availability || 'Pending'
      groups[status].qty += it.final_qty
      groups[status].value += it.rate * it.final_qty
    })
    return groups
  }

  const deleteItem = (itemId) => {
    setLocalItems(items => items.filter(it => it.id !== itemId))
  }

  const setItemQty = (itemId, val) => {
    setLocalItems(items => items.map(it => it.id === itemId ? { ...it, final_qty: Number(val) || 0 } : it))
  }

  const wouldExceedPayment = () => payment && currentOrderValue() > paymentAmount

  const addItem = () => {
    if (!pickProduct || !pickQty || Number(pickQty) <= 0) return
    const prod = (products || []).find(p => p.id === pickProduct)
    if (!prod) return
    const newItemValue = (Number(prod.price) || 0) * Number(pickQty)
    if (payment && currentOrderValue() + newItemValue > paymentAmount) {
      alert(`Cannot add — order value would exceed payment received (${F(paymentAmount)}).`)
      return
    }
    setLocalItems(items => [...items, {
      id: `temp-${Date.now()}`, _isNew: true,
      product_id: prod.id, category_id: prod.category_id,
      rate: Number(prod.price) || 0, weight: Number(prod.weight) || 0, volume: prod.volume || 0,
      order_qty: Number(pickQty), final_qty: Number(pickQty),
      availability: null, wait_days: null,
    }])
    setAddingItem(false); setPickProduct(''); setPickQty('')
  }

  const usedProductIds = new Set(localItems.map(it => it.product_id))
  const availableProducts = (products || []).filter(p => !usedProductIds.has(p.id))

  const s = summary()

  const originalItems = (order.items || []).filter(it => !it.cancelled)

  const confirmAndSend = async () => {
    setBusy(true)

    // Deletions: items that existed originally but are no longer in localItems
    const localIds = new Set(localItems.filter(it => !it._isNew).map(it => it.id))
    for (const orig of originalItems) {
      if (!localIds.has(orig.id)) {
        await db.cancelOrderItem(orig.id)
      }
    }

    // New items
    for (const it of localItems.filter(it => it._isNew)) {
      await db.addOrderItem(order.id, {
        product_id: it.product_id, category_id: it.category_id,
        rate: it.rate, weight: it.weight, volume: it.volume, order_qty: it.final_qty,
      })
    }

    // Qty changes on existing items
    for (const it of localItems.filter(it => !it._isNew)) {
      const orig = originalItems.find(o => o.id === it.id)
      if (orig && orig.final_qty !== it.final_qty) {
        await db.updateOrderItemQtyAndReset(it.id, it.final_qty)
      }
    }

    await db.returnToWarehouseManager(order.id)
    setBusy(false)
    showToast && showToast('Order sent to Warehouse for picking')
    onClose()
  }

  return (
    <Sheet title={`Order #${order.id} — ${order.distributor?.name}`} sub={`Last updated ${timeAgo(order.picking_updated_at)}`} onClose={onClose}>

      <Card>
        <CH title="Summary" />
        <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
          <div>Available: Qty {s.Available.qty} · {F(s.Available.value)}</div>
          <div>Wait: Qty {s.Wait.qty} · {F(s.Wait.value)}</div>
          <div>Unavailable: Qty {s.Unavailable.qty} · {F(s.Unavailable.value)}</div>
          {s.Pending.qty > 0 && <div style={{ color: '#9ca3af' }}>Pending: Qty {s.Pending.qty} · {F(s.Pending.value)}</div>}
        </div>
      </Card>

      {payment && (
        <Card style={{ background: currentOrderValue() > paymentAmount ? '#fef2f2' : '#f0fdf4', border: `1px solid ${currentOrderValue() > paymentAmount ? '#fecaca' : '#bbf7d0'}` }}>
          <div style={{ padding: 12, fontSize: 12, fontWeight: 600, color: currentOrderValue() > paymentAmount ? '#ef4444' : '#166534' }}>
            Order Value (Available + Wait): {F(currentOrderValue())} / Payment Received: {F(paymentAmount)}
          </div>
        </Card>
      )}

      <Card>
        <CH title="Items" sub="Changes shown here are not saved until you send to Warehouse" right={isAdmin && <Btn sm v="pri" onClick={() => setAddingItem(true)}>+ Add Item</Btn>} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Product</th>
                <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Qty</th>
                <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Availability</th>
                {isAdmin && <th style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {localItems.map(it => (
                <tr key={it.id} style={{ background: it._isNew ? '#eff6ff' : 'transparent' }}>
                  <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{productName(it.product_id)}{it._isNew ? ' (new)' : ''}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {isAdmin ? (
                      <input
                        type="number"
                        value={it.final_qty}
                        onChange={e => setItemQty(it.id, e.target.value)}
                        disabled={busy}
                        style={{ width: 64, padding: '5px 7px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, borderColor: wouldExceedPayment() ? '#ef4444' : '#e5e7eb' }}
                      />
                    ) : it.final_qty}
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: it.availability ? 'inherit' : '#9ca3af' }}>
                    {it.availability ? `${it.availability}${it.availability === 'Wait' && it.wait_days ? ` (${it.wait_days}d)` : ''}` : '— Pending'}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '8px 10px' }}>
                      <Btn sm v="bad" disabled={busy} onClick={() => deleteItem(it.id)}>Delete</Btn>
                    </td>
                  )}
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
              options={[{ value: '', label: 'Select product...' }, ...availableProducts.map(p => ({ value: p.id, label: p.name }))]} />
            <Inp label="Quantity" type="number" value={pickQty} onChange={setPickQty} placeholder="0" />
            {pickProduct && (() => {
              const prod = (products || []).find(p => p.id === pickProduct)
              const rate = Number(prod?.price) || 0
              const qty = Number(pickQty) || 0
              return (
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
                  <div>Rate: {F(rate)}</div>
                  <div style={{ fontWeight: 600 }}>Row Total: {F(rate * qty)}</div>
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn v="pri" full onClick={addItem}>Add</Btn>
              <Btn full onClick={() => setAddingItem(false)}>Cancel</Btn>
            </div>
          </div>
        </Card>
      )}

      {isAdmin && (
        <Btn v="pri" full disabled={busy || (payment && currentOrderValue() > paymentAmount)} onClick={confirmAndSend}>
          {busy ? 'Sending...' : 'Confirm & Send to Warehouse'}
        </Btn>
      )}
    </Sheet>
  )
}