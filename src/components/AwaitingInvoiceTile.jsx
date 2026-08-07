import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useData } from '../hooks/useData.jsx'
import { Tile, Sheet, Card, CH, Btn, Inp, F } from './ui.jsx'
import * as db from '../lib/db.js'

export default function AwaitingInvoiceTile() {
  const { currentUser } = useAuth()
  const { products, showToast, loadAll } = useData()
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [showList, setShowList] = useState(false)
  const [creating, setCreating] = useState(null)

  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [erpNumber, setErpNumber] = useState('')
  const [erpDate, setErpDate] = useState('')
  const [erpAmount, setErpAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const loadData = async () => {
    const { data } = await db.fetchOrdersAwaitingInvoice()
    setOrders(data || [])
    setLoaded(true)
  }
  if (!loaded) loadData()

  const openCreate = (order) => {
    setCreating(order)
    setInvoiceNo(''); setInvoiceDate(new Date().toISOString().split('T')[0])
    setErpNumber(''); setErpDate(''); setErpAmount('')
  }

  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid

  const groupedByLoad = () => {
    const groups = {}
    orders.forEach(o => {
      const key = o.allocation?.id || 'none'
      if (!groups[key]) groups[key] = { allocationId: key, vehicleNumber: o.allocation?.vehicle?.vehicle_number, orders: [] }
      groups[key].orders.push(o)
    })
    return Object.values(groups)
  }

  const activeItems = () => (creating?.items || []).filter(it => !it.cancelled)
  const computedTotal = () => activeItems().reduce((s, it) => s + it.rate * it.final_qty, 0)
  const mismatch = () => erpAmount !== '' && Math.abs(Number(erpAmount) - computedTotal()) > 0.01

  const submit = async () => {
    if (!invoiceNo.trim() || !invoiceDate) { showToast('Invoice number and date are required'); return }
    setBusy(true)
    const header = {
      id: invoiceNo.trim(), member_id: creating.member_id, distributor_id: creating.distributor_id,
      date: invoiceDate, order_id: creating.id, status: 'pending_approval',
      erp_invoice_number: erpNumber.trim() || null,
      erp_date: erpDate || null,
      erp_amount: erpAmount !== '' ? Number(erpAmount) : null,
      created_by: currentUser?.member_id,
    }
    const lines = activeItems().map(it => ({ product_id: it.product_id, qty: it.final_qty, rate: it.rate }))
    const { error } = await db.createInvoiceFromLoad(header, lines)
    setBusy(false)
    if (error) { showToast('Error creating invoice'); return }
    db.logActivity(currentUser?.id, 'create', 'invoice', `Created invoice ${header.id} from order #${creating.id}`, header.id)
    await loadAll()
    await loadData()
    setCreating(null)
    showToast('Invoice created — sent for Admin approval')
  }

  return (
    <>
      <Tile icon="🧾" label="Awaiting Invoice Creation" value={orders.length} sub="Tap to view" color="#f59e0b" onClick={() => setShowList(true)} />

      {showList && (
        <Sheet title="Awaiting Invoice Creation" sub={`${orders.length} order(s) — loading complete`} onClose={() => setShowList(false)}>
          {orders.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {groupedByLoad().map(group => (
            <div key={group.allocationId} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', padding: '10px 4px 4px' }}>
                {group.vehicleNumber ? `Vehicle ${group.vehicleNumber}` : `Load ${group.allocationId}`} — {group.orders.length} order(s)
              </div>
              {group.orders.map(o => (
                <div key={o.id} style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{o.member?.name}</div>
                  <Btn sm v="pri" onClick={() => { openCreate(o); setShowList(false) }}>Create Invoice From Load</Btn>
                </div>
              ))}
            </div>
          ))}
        </Sheet>
      )}

      {creating && (
        <Sheet title={`Create Invoice — Order #${creating.id}`} sub={creating.distributor?.name} onClose={() => setCreating(null)}>
          <Card>
            <CH title="Order Items" />
            {activeItems().map(it => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                <span>{productName(it.product_id)}</span>
                <span>{it.final_qty} × {F(it.rate)} = {F(it.rate * it.final_qty)}</span>
              </div>
            ))}
            <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, borderTop: '1px solid #e5e7eb' }}>
              Total: {F(computedTotal())}
            </div>
          </Card>

          <Card>
            <div style={{ padding: 14 }}>
              <Inp label="Invoice No." value={invoiceNo} onChange={setInvoiceNo} placeholder="INV001" req />
              <Inp label="Invoice Date" type="date" value={invoiceDate} onChange={setInvoiceDate} req />
            </div>
          </Card>

          <Card>
            <CH title="ERP Details" />
            <div style={{ padding: 14 }}>
              <Inp label="ERP Invoice Number" value={erpNumber} onChange={setErpNumber} />
              <Inp label="ERP Date" type="date" value={erpDate} onChange={setErpDate} />
              <Inp label="ERP Amount" type="number" value={erpAmount} onChange={setErpAmount} />
              {mismatch() && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400e' }}>
                  ⚠ ERP amount ({F(Number(erpAmount))}) differs from computed invoice total ({F(computedTotal())}). You can still proceed.
                </div>
              )}
            </div>
          </Card>

          <Btn v="pri" full disabled={busy} onClick={submit}>{busy ? 'Saving...' : 'Save Invoice — Send for Approval'}</Btn>
        </Sheet>
      )}
    </>
  )
}