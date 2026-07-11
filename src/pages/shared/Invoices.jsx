import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { CrudTable, Av, Sheet, Inp, Btn } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function Invoices() {
  const { can } = useAuth()
  const { invoices, setInvoices, members, products, customers, showToast } = useData()
  const [sheet, setSheet] = useState(null)

  const cols = [
    { key: 'id', label: 'Invoice' },
    { key: 'member', label: 'Member', render: r => { const m = (members || []).find(x => x.id === r.member_id); return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{m && <Av av={m.avatar} color={m.color} sz={22} />}<span style={{ fontSize: 12 }}>{m?.name}</span></div> } },
    { key: 'customer', label: 'Customer', render: r => { const c = (customers || []).find(x => x.id === r.customer_id); return <span style={{ fontSize: 12 }}>{c?.name || r.customer_id}</span> } },
    { key: 'date', label: 'Date' },
    { key: 'total', label: 'Amount', render: r => <span style={{ fontWeight: 600 }}>{F((r.lines || r.invoice_lines || []).reduce((s, l) => s + l.qty * l.rate, 0))}</span> },
    { key: 'lines', label: 'Lines', render: r => <span style={{ fontSize: 11, color: '#9ca3af' }}>{(r.lines || r.invoice_lines || []).length} items</span> },
  ]

  const save = async (inv) => {
    const header = { id: inv.id, member_id: Number(inv.memberId), customer_id: inv.custId, date: inv.date }
    const lines  = inv.lines.filter(l => l.qty).map(l => ({ product_id: l.pid, qty: Number(l.qty), rate: Number(l.rate) }))
    const isEdit = invoices.some(x => x.id === inv.id)
    const { data, error } = isEdit ? await db.updateInvoice(inv.id, header, lines) : await db.createInvoice(header, lines)
    if (error) { showToast('Error saving invoice'); return }
    setInvoices(prev => isEdit ? prev.map(x => x.id === inv.id ? { ...x, ...header, lines } : x) : [{ ...header, lines }, ...prev])
    setSheet(null)
    showToast(isEdit ? 'Invoice updated' : 'Invoice saved — achievements updated')
  }

  return (
    <div>
      {sheet && <InvSheet inv={sheet === 'new' ? null : sheet} members={members} products={products} customers={customers} onSave={save} onClose={() => setSheet(null)} />}
      <CrudTable
        title={`Invoices (${(invoices || []).length})`}
        sub="Achievement auto-updates for approved goals"
        cols={cols}
        rows={invoices || []}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet('new')}
        onEdit={row => setSheet(row)}
        onDelete={async row => { await db.deleteInvoice(row.id); setInvoices(prev => prev.filter(x => x.id !== row.id)); showToast('Invoice deleted') }}
      />
    </div>
  )
}

function InvSheet({ inv, members, products, customers, onSave, onClose }) {
  const [d, setD] = useState({
    id: inv?.id || '',
    memberId: inv?.member_id || (members || [])[0]?.id || '',
    custId: inv?.customer_id || '',
    date: inv?.date || '',
    lines: (inv?.lines || inv?.invoice_lines || [{ pid: (products || [])[0]?.id || '', qty: '', rate: (products || [])[0]?.price || '' }]).map(l => ({ pid: l.product_id || l.pid, qty: l.qty, rate: l.rate })),
  })
  const myCusts = (customers || []).filter(c => (c.assignedTo || []).includes(Number(d.memberId)))
  const total   = d.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)
  const upd     = (i, k, v) => setD(x => ({ ...x, lines: x.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) }))

  return (
    <Sheet title={inv ? 'Edit invoice' : 'Add invoice'} sub="Achievement updates automatically" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Inp label="Invoice no." value={d.id} onChange={v => setD(x => ({ ...x, id: v }))} placeholder="INV001" req />
        <Inp label="Date" type="date" value={d.date} onChange={v => setD(x => ({ ...x, date: v }))} req />
      </div>
      <Inp label="Member" value={d.memberId} onChange={v => setD(x => ({ ...x, memberId: v, custId: '' }))} options={(members || []).map(m => ({ value: m.id, label: m.name }))} />
      <Inp label="Customer" value={d.custId} onChange={v => setD(x => ({ ...x, custId: v }))} options={[{ value: '', label: 'Select...' }, ...myCusts.map(c => ({ value: c.id, label: c.name }))]} req />
      <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', margin: '14px 0 8px' }}>Line items</div>
      {d.lines.map((l, i) => (
        <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <Inp label="Product" value={l.pid} onChange={v => { const p = (products || []).find(x => x.id === v); upd(i, 'pid', v); if (p) upd(i, 'rate', p.price) }} options={(products || []).map(p => ({ value: p.id, label: `${p.name} (${p.unit})` }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <Inp label="Qty" type="number" value={l.qty} onChange={v => upd(i, 'qty', v)} placeholder="0" />
            <Inp label="Rate ₹" type="number" value={l.rate} onChange={v => upd(i, 'rate', v)} />
            {d.lines.length > 1 && <Btn v="bad" sm onClick={() => setD(x => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} style={{ marginBottom: 12 }}>✕</Btn>}
          </div>
        </div>
      ))}
      <Btn v="gh" sm onClick={() => setD(x => ({ ...x, lines: [...x.lines, { pid: (products || [])[0]?.id || '', qty: '', rate: '' }] }))} style={{ marginBottom: 14 }}>+ Add line</Btn>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f0fdf4', borderRadius: 8, marginBottom: 14, fontWeight: 700 }}>
        <span>Total</span><span style={{ color: '#10b981' }}>{F(total)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn v="pri" full disabled={!d.custId || !d.date || !d.id} onClick={() => onSave(d)}>{inv ? 'Update' : 'Save invoice'}</Btn>
        <Btn full onClick={onClose}>Cancel</Btn>
      </div>
    </Sheet>
  )
}
