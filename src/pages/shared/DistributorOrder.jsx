import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Inp, Sheet, F } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function DistributorOrder() {
  const { currentUser } = useAuth()
  const { distributors: customers, products, categories, showToast, loadAll } = useData()
  const mid = currentUser?.member_id

  const [distributorId, setDistributorId] = useState('')
const [step, setStep] = useState('list') // list -> select -> payment -> items -> otp
  const [items, setItems] = useState([])
  const [pickProduct, setPickProduct] = useState('')
  const [payment, setPayment] = useState({ mode_of_payment: '', bank_name: '', ifsc_code: '', bank_branch: '', transaction_date: '', transaction_amount: '', transaction_id: '', remarks: '' })
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [myOrders, setMyOrders] = useState([])
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [editingPaymentId, setEditingPaymentId] = useState(null)

  const myDistributors = (customers || []).filter(d => (d.assignedTo || []).includes(mid) && d.type === 'Distributor')
  const distributor = myDistributors.find(d => d.id === distributorId)
  const isAdvance = (distributor?.payment_mode || 'Advance') === 'Advance'

  const usedProductIds = new Set(items.map(it => it.product_id))
  const availableProducts = (products || []).filter(p => !usedProductIds.has(p.id))

  const loadMyOrders = async () => {
    const { data } = await db.fetchDistributorOrders()
    setMyOrders((data || []).filter(o => o.member_id === mid))
  }

  const statusLabel = s => ({
    order_submitted: 'Awaiting Manager Approval',
    manager_approved_admin_pending: 'Manager Approved — Admin Pending',
    confirmed: 'Confirmed',
  }[s] || s)

  const orderValue = (order) => (order.items || []).reduce((s, it) => s + (it.rate || 0) * (it.final_qty ?? it.approved_qty ?? it.order_qty), 0)

  const editOrder = async (order) => {
    setEditingOrderId(order.id)
    setDistributorId(order.distributor_id)
    setItems((order.items || []).map(it => ({
      product_id: it.product_id, name: (products || []).find(p => p.id === it.product_id)?.name || it.product_id,
      category_id: it.category_id, rate: it.rate, weight: it.weight, volume: it.volume,
      order_qty: it.order_qty,
    })))
    const d = myDistributors.find(x => x.id === order.distributor_id)
    const advance = (d?.payment_mode || 'Advance') === 'Advance'
    if (advance) {
      const { data } = await db.fetchOrderPayments()
      const existing = (data || []).find(p => p.order_id === order.id)
      if (existing) {
        setEditingPaymentId(existing.id)
        setPayment({
          mode_of_payment: existing.mode_of_payment, bank_name: existing.bank_name, ifsc_code: existing.ifsc_code,
          bank_branch: existing.bank_branch, transaction_date: existing.transaction_date,
          transaction_amount: existing.transaction_amount, transaction_id: existing.transaction_id, remarks: existing.remarks || '',
        })
      }
    }
    setStep('items')
  }

  const selectDistributor = (id) => {
    setDistributorId(id)
    const d = myDistributors.find(x => x.id === id)
    if (!d) return
    setStep((d.payment_mode || 'Advance') === 'Advance' ? 'payment' : 'items')
  }
  
  const validatePayment = () => {
    const req = ['mode_of_payment', 'bank_name', 'ifsc_code', 'bank_branch', 'transaction_date', 'transaction_amount', 'transaction_id']
    return req.every(k => payment[k] && String(payment[k]).trim() !== '')
  }

  const addItem = () => {
    if (!pickProduct) { showToast('Select a product'); return }
    const prod = (products || []).find(p => p.id === pickProduct)
    if (!prod) return
    if ((prod.stock_status || 'Available') === 'Unavailable') return
    const volume = prod.volume || 0
    setItems(prev => [...prev, {
      product_id: prod.id, name: prod.name, category_id: prod.category_id,
      rate: Number(prod.price) || 0, weight: Number(prod.weight) || 0, volume,
      order_qty: 1,
    }])
    setPickProduct('')
  }

  const updateQty = (idx, qty) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, order_qty: Math.max(0, Number(qty) || 0) } : it))
  }

  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx))

  const categorySummary = () => {
    const groups = {}
    items.forEach(it => {
      const cat = (categories || []).find(c => c.id === it.category_id)
      const key = cat?.name || 'Uncategorized'
      if (!groups[key]) groups[key] = { qty: 0, weight: 0, volume: 0, value: 0 }
      groups[key].qty += it.order_qty
      groups[key].weight += it.weight * it.order_qty
      groups[key].volume += it.volume * it.order_qty
      groups[key].value += it.rate * it.order_qty
    })
    return groups
  }

  const grandTotal = () => items.reduce((acc, it) => ({
    qty: acc.qty + it.order_qty,
    weight: acc.weight + it.weight * it.order_qty,
    volume: acc.volume + it.volume * it.order_qty,
    value: acc.value + it.rate * it.order_qty,
  }), { qty: 0, weight: 0, volume: 0, value: 0 })

  const goToConfirm = () => {
    if (items.length === 0) { showToast('Add at least one item'); return }
    if (items.some(it => it.order_qty <= 0)) { showToast('All items must have qty greater than 0'); return }
    if (isAdvance && grandTotal().value > paymentAmount) { showToast('Order value exceeds payment amount'); return }
    setStep('otp')
  }

 const submitOrder = async () => {
    if (otp !== '1234') { showToast('Invalid OTP'); return }
    setSubmitting(true)

    if (editingOrderId) {
      const { error } = await db.updateDistributorOrder(editingOrderId, items)
      if (error) { showToast('Error updating order'); setSubmitting(false); return }
      if (isAdvance) {
        if (editingPaymentId) {
          const { error: payError } = await db.updateOrderPayment(editingPaymentId, {
            ...payment, transaction_amount: Number(payment.transaction_amount),
          })
          if (payError) { showToast('Order updated but payment save failed'); setSubmitting(false); return }
        } else {
          const { error: payError } = await db.createOrderPayment({
            order_id: editingOrderId, distributor_id: distributorId, member_id: mid,
            ...payment, transaction_amount: Number(payment.transaction_amount),
          })
          if (payError) { showToast('Order updated but payment save failed'); setSubmitting(false); return }
        }
      }
      await loadAll(); await loadMyOrders()
      setSubmitting(false)
      showToast('Order updated')
    } else {
      const header = { distributor_id: distributorId, member_id: mid, status: 'order_submitted' }
      const { data: order, error } = await db.createDistributorOrder(header, items)
      if (error) { showToast('Error creating order'); setSubmitting(false); return }
      if (isAdvance) {
        const { error: payError } = await db.createOrderPayment({
          order_id: order.id, distributor_id: distributorId, member_id: mid,
          ...payment, transaction_amount: Number(payment.transaction_amount),
        })
        if (payError) { showToast('Order created but payment save failed'); setSubmitting(false); return }
      }
      await loadAll(); await loadMyOrders()
      setSubmitting(false)
      showToast('Order submitted for manager approval')
    }

    setDistributorId(''); setItems([]); setStep('list'); setOtp('')
    setEditingOrderId(null); setEditingPaymentId(null)
    setPayment({ mode_of_payment: '', bank_name: '', ifsc_code: '', bank_branch: '', transaction_date: '', transaction_amount: '', transaction_id: '', remarks: '' })
  }
  const gt = grandTotal()
  const paymentAmount = Number(payment.transaction_amount) || 0
  const exceedsPayment = isAdvance && gt.value > paymentAmount
  const catSummary = categorySummary()
if (step === 'list' && myOrders.length === 0) loadMyOrders()

  return (
    <div>
      {step === 'list' && (
        <Card>
          <CH title="My Distributor Orders" sub={`${myOrders.length} order(s)`} right={<Btn v="pri" sm onClick={() => setStep('select')}>+ New Order</Btn>} />
          {myOrders.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No orders yet</div>}
          {myOrders.map(o => {
            const editable = o.status === 'order_submitted'
            return (
              <div key={o.id} onClick={editable ? () => editOrder(o) : undefined}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: editable ? 'pointer' : 'default' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}{o.distributor?.town ? `, ${o.distributor.town}` : ''}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(o.order_date).toLocaleString('en-IN')} · {F(orderValue(o))}{editable ? ' · Tap to edit' : ''}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: o.status === 'confirmed' ? '#10b981' : '#2563eb' }}>{statusLabel(o.status)}</div>
              </div>
            )
          })}
        </Card>
      )}

      {step === 'select' && (
      <Card>
        <CH title="Distributor Order" sub="Select distributor to begin" />
        <div style={{ padding: 14 }}>
          <Inp
            label="Distributor"
            value={distributorId}
            onChange={selectDistributor}
            options={[{ value: '', label: 'Select distributor...' }, ...myDistributors.map(d => ({ value: d.id, label: d.name }))]}
          />
          {distributor && (
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              Payment mode: <strong>{distributor.payment_mode || 'Advance'}</strong>
            </div>
          )}
        </div>
      </Card>
      )}

      {step === 'payment' && (
        <Card>
          <CH title="Payment Details" sub="Required for Advance mode — enter before adding items" />
          <div style={{ padding: 14 }}>
            <Inp label="Mode of Payment" value={payment.mode_of_payment} onChange={v => setPayment(p => ({ ...p, mode_of_payment: v }))} options={['Cash', 'Cheque', 'NEFT', 'RTGS', 'UPI']} />
            <Inp label="Bank Name" value={payment.bank_name} onChange={v => setPayment(p => ({ ...p, bank_name: v }))} />
            <Inp label="IFSC Code" value={payment.ifsc_code} onChange={v => setPayment(p => ({ ...p, ifsc_code: v }))} />
            <Inp label="Bank Branch" value={payment.bank_branch} onChange={v => setPayment(p => ({ ...p, bank_branch: v }))} />
            <Inp label="Transaction Date" type="date" value={payment.transaction_date} onChange={v => setPayment(p => ({ ...p, transaction_date: v }))} />
            <Inp label="Transaction Amount" type="number" value={payment.transaction_amount} onChange={v => setPayment(p => ({ ...p, transaction_amount: v }))} />
            <Inp label="Transaction ID" value={payment.transaction_id} onChange={v => setPayment(p => ({ ...p, transaction_id: v }))} />
            <Inp label="Remarks (optional)" value={payment.remarks} onChange={v => setPayment(p => ({ ...p, remarks: v }))} />
            <Btn v="pri" full onClick={() => { if (!validatePayment()) { showToast('Fill all required payment fields'); return }; setStep('items') }}>Continue to Items</Btn>
          </div>
        </Card>
      )}

      {step === 'items' && (
        <>
          {isAdvance && (
            <Card style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }}>
                <div><strong>{payment.mode_of_payment}</strong> · {payment.transaction_id}</div>
                <div>{payment.bank_name}, {payment.bank_branch} (IFSC: {payment.ifsc_code})</div>
                <div>Date: {payment.transaction_date} · Amount: <strong>{F(payment.transaction_amount)}</strong></div>
              </div>
            </Card>
          )}
       
          <Card>
            <CH title="Add item" sub="🟢 Available · 🟡 Wait — flagged, still orderable · 🔴 Unavailable — cannot be selected" />
            <div style={{ padding: 14, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Product</label>
                <select
                  value={pickProduct}
                  onChange={e => setPickProduct(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}
                >
                  <option value="">Select product...</option>
                  {availableProducts.map(p => {
                    const status = p.stock_status || 'Available'
                    const bg = status === 'Available' ? '#dcfce7' : status === 'Wait' ? '#ffedd5' : '#fee2e2'
                    const color = status === 'Available' ? '#15803d' : status === 'Wait' ? '#c2410c' : '#b91c1c'
                    return (
                      <option key={p.id} value={p.id} disabled={status === 'Unavailable'} style={{ background: bg, color }}>
                        {p.name}{status !== 'Available' ? ` (${status})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Btn v="pri" onClick={addItem}>+ Add</Btn>
              </div>
            </div>
          </Card>

          {items.length > 0 && (
            <Card>
              <CH title="Order Items" sub={`${items.length} item(s) — qty is editable until submitted`} />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Product', 'Rate', 'Weight', 'Volume', 'Qty', 'Value', ''].map(h => (
                        <th key={h} style={{ padding: '8px 10px', fontSize: 10, color: '#6b7280', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.product_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{it.name}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{F(it.rate)}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.weight} kg</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{it.volume.toFixed(2)}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="number" value={it.order_qty}
                            onChange={e => updateQty(i, e.target.value)}
                            style={{ width: 64, padding: '5px 7px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{F(it.rate * it.order_qty)}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <Btn sm v="bad" onClick={() => removeItem(i)}>✕</Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {items.length > 0 && (
            <Card>
              <CH title="Summary" sub="Category-wise breakdown" />
              <div style={{ padding: 14 }}>
                {Object.entries(catSummary).map(([cat, s]) => (
                  <div key={cat} style={{ marginBottom: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{cat}</div>
                    <div style={{ color: '#6b7280' }}>Qty: {s.qty} · Weight: {s.weight.toFixed(2)} kg · Volume: {s.volume.toFixed(2)} · Value: {F(s.value)}</div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 8, fontWeight: 700, fontSize: 13, color: exceedsPayment ? '#ef4444' : '#111827' }}>
                  Grand Total: Qty {gt.qty} · Weight {gt.weight.toFixed(2)} kg · Volume {gt.volume.toFixed(2)} · Value {F(gt.value)}
                </div>
                {exceedsPayment && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6, fontWeight: 600 }}>
                    ⚠ Order value exceeds payment amount ({F(paymentAmount)}). Reduce quantities to continue.
                  </div>
                )}
              </div>
              <div style={{ padding: '0 14px 14px' }}>
                <Btn v="pri" full disabled={exceedsPayment} onClick={goToConfirm}>Save & Review</Btn>
              </div>
            </Card>
          )}
        </>
      )}

      {step === 'otp' && (
        <Sheet title="Confirm with OTP" sub="Enter the 4-digit OTP shared with the distributor" onClose={() => setStep('items')}>
          <Inp label="OTP" value={otp} onChange={setOtp} placeholder="1234" />
<Btn v="pri" full disabled={submitting} onClick={submitOrder}>{submitting ? 'Confirming...' : (editingOrderId ? 'Confirm Update' : 'Confirm Order')}</Btn>
        </Sheet>
      )}
    </div>
  )
}