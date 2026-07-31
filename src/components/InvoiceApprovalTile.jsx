import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useData } from '../hooks/useData.jsx'
import { Tile, Sheet, Card, CH, Btn, F } from './ui.jsx'
import * as db from '../lib/db.js'
import { printInvoice } from '../lib/printInvoice.js'

export default function InvoiceApprovalTile() {
  const { currentUser } = useAuth()
  const { distributors, products, showToast, loadAll } = useData()
  const [pending, setPending] = useState([])
  const [showList, setShowList] = useState(false)
  const [reviewing, setReviewing] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadData = async () => {
    const { data } = await db.fetchPendingInvoices()
    setPending(data || [])
  }

  useEffect(() => { loadData() }, [])

  const distributorName = id => (distributors || []).find(d => d.id === id)?.name || id
  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid
  const invoiceTotal = inv => (inv.lines || []).reduce((s, l) => s + l.qty * l.rate, 0)
  const mismatch = inv => inv.erp_amount != null && Math.abs(Number(inv.erp_amount) - invoiceTotal(inv)) > 0.01

  const approve = async (inv) => {
    setBusy(true)
    const { error } = await db.approveInvoice(inv.id, currentUser?.member_id)
    setBusy(false)
    if (error) { showToast('Error approving invoice'); return }
    await loadAll()
    await loadData()
    setReviewing(null)
    showToast('Invoice approved')
  }

  return (
    <>
      <Tile icon="✅" label="Invoice Approval" value={pending.length} sub="Tap to review" color="#10b981" onClick={() => setShowList(true)} />

      {showList && (
        <Sheet title="Invoice Approval" sub={`${pending.length} invoice(s) pending`} onClose={() => setShowList(false)}>
          {pending.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {pending.map(inv => (
            <div key={inv.id} style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Invoice #{inv.id} — {distributorName(inv.distributor_id)}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{inv.member?.name} · {inv.date} · {F(invoiceTotal(inv))}</div>
              <Btn sm v="pri" onClick={() => { setReviewing(inv); setShowList(false) }}>Review</Btn>
            </div>
          ))}
        </Sheet>
      )}

      {reviewing && (
        <Sheet title={`Invoice #${reviewing.id}`} sub={distributorName(reviewing.distributor_id)} onClose={() => setReviewing(null)}>
          <Card>
            <CH title="Line Items" right={
              <Btn sm onClick={() => printInvoice({ invoice: reviewing, distributorName: distributorName(reviewing.distributor_id), memberName: reviewing.member?.name, productName })}>⬇ PDF</Btn>
            } />
            {(reviewing.lines || []).map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                <span>{productName(l.product_id)}</span>
                <span>{l.qty} × {F(l.rate)} = {F(l.qty * l.rate)}</span>
              </div>
            ))}
            <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, borderTop: '1px solid #e5e7eb' }}>
              Total: {F(invoiceTotal(reviewing))}
            </div>
          </Card>

          <Card>
            <CH title="ERP Details" />
            <div style={{ padding: 14, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#9ca3af' }}>ERP Invoice No.</span><span>{reviewing.erp_invoice_number || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#9ca3af' }}>ERP Date</span><span>{reviewing.erp_date || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>ERP Amount</span><span>{reviewing.erp_amount != null ? F(reviewing.erp_amount) : '—'}</span>
              </div>
              {mismatch(reviewing) && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 10, fontSize: 12, color: '#92400e', marginTop: 10 }}>
                  ⚠ ERP amount ({F(Number(reviewing.erp_amount))}) differs from invoice total ({F(invoiceTotal(reviewing))}).
                </div>
              )}
            </div>
          </Card>

          <Btn v="pri" full disabled={busy} onClick={() => approve(reviewing)}>{busy ? 'Approving...' : 'Approve Invoice'}</Btn>
        </Sheet>
      )}
    </>
  )
}
