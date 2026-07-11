import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Btn, GBadge, Sheet } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { getGoalOverallStatus } from '../../lib/achievementEngine.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function GoalApprovals() {
  const { can } = useAuth()
  const { goals, setGoals, members, params, products, customers, categories, showToast } = useData()
  const [reviewing, setReviewing] = useState(null)

  const pending = (members || []).filter(m => {
    const g = (goals || {})[m.id]
    return g && (g.status === 'pending' || g.status === 'partial')
  })

  const handleAction = async (memberId, decisions, notes) => {
    const existing = (goals || {})[memberId] || {}
    const updated = { ...existing }

    // Apply per-field decisions
    if (decisions['value']) {
      updated.value_status = decisions['value']
      updated.value_note   = decisions['value'] === 'rejected' ? (notes['value'] || '') : null
    }
    // Customers
    const newCusts = { ...(existing.customers || {}) }
    Object.keys(decisions).filter(k => k.startsWith('c_')).forEach(k => {
      const id = k.slice(2)
      if (newCusts[id]) newCusts[id] = { ...newCusts[id], status: decisions[k], note: decisions[k] === 'rejected' ? (notes[k] || '') : null }
    })
    updated.customers = newCusts
    // Products
    const newProds = { ...(existing.products || {}) }
    Object.keys(decisions).filter(k => k.startsWith('p_')).forEach(k => {
      const id = k.slice(2)
      if (newProds[id]) newProds[id] = { ...newProds[id], status: decisions[k], note: decisions[k] === 'rejected' ? (notes[k] || '') : null }
    })
    updated.products = newProds
    // Categories
    const newCats = { ...(existing.categories || {}) }
    Object.keys(decisions).filter(k => k.startsWith('cat_')).forEach(k => {
      const id = k.slice(4)
      if (newCats[id]) newCats[id] = { ...newCats[id], status: decisions[k], note: decisions[k] === 'rejected' ? (notes[k] || '') : null }
    })
    updated.categories = newCats
    if (decisions['visits']) { updated.visits_status = decisions['visits']; updated.visits_note = decisions['visits'] === 'rejected' ? (notes['visits'] || '') : null }
    if (decisions['acq'])    { updated.acq_status    = decisions['acq'];    updated.acq_note    = decisions['acq']    === 'rejected' ? (notes['acq']    || '') : null }

    updated.reviewed_at = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    updated.status = getGoalOverallStatus(updated)

    const { error } = await db.upsertGoal(memberId, updated)
    if (error) { showToast('Error saving review'); return }
    setGoals(prev => ({ ...prev, [memberId]: updated }))
    showToast('Review saved — member notified')
  }

  if (pending.length === 0) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
      <div>No goals pending review</div>
    </div>
  )

  return (
    <div>
      {reviewing && (
        <GoalReviewSheet
          member={reviewing}
          param={(params || {})[reviewing.id] || {}}
          goal={(goals || {})[reviewing.id]}
          products={products} customers={customers} categories={categories}
          onAction={handleAction}
          onClose={() => setReviewing(null)}
        />
      )}
      {pending.map(m => {
        const g = (goals || {})[m.id]
        const p = (params || {})[m.id] || {}
        return (
          <Card key={m.id}>
            <CH title={m.name} sub={`Submitted ${g.submitted_at || ''}`} right={<GBadge status={g.status} />} />
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 12, color: '#6b7280' }}>
                <span>Value parameter: {F(p.exp_budget || 0)}</span>
                <span style={{ fontWeight: 600, color: '#374151' }}>Goal: {F(g.value_goal || 0)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {can('approve') && <Btn v="ok" onClick={() => setReviewing(m)}>Review goals</Btn>}
                <Btn onClick={() => setReviewing(m)}>View details</Btn>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function GoalReviewSheet({ member, param, goal, products, customers, categories, onAction, onClose }) {
  const [dec, setDec]     = useState({})
  const [notes, setNotes] = useState({})
  const g = goal || {}

  if (g.status === 'draft') return (
    <Sheet title={`Review — ${member.name}`} onClose={onClose}>
      <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>No goals submitted yet.</div>
    </Sheet>
  )

  const FieldRow = ({ fKey, label, fg, unit }) => {
    if (!fg) return null
    const isPending = fg.status === 'pending'
    const d = dec[fKey]
    return (
      <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
          <GBadge status={d || fg.status} />
        </div>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: isPending ? 10 : 0 }}>
          Goal: <strong>{unit === 'value' ? F(fg.goal || 0) : (fg.goal || 0) + (unit ? ' ' + unit : '')}</strong>
        </div>
        {fg.note && fg.status === 'rejected' && !d && <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 8 }}>Previous note: {fg.note}</div>}
        {isPending && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: d === 'rejected' ? 8 : 0 }}>
              <Btn sm v={d === 'approved' ? 'ok' : 'def'} onClick={() => setDec(x => ({ ...x, [fKey]: 'approved' }))}>✓ Approve</Btn>
              <Btn sm v={d === 'rejected' ? 'bad' : 'def'} onClick={() => setDec(x => ({ ...x, [fKey]: 'rejected' }))}>✗ Reject</Btn>
              {d && <Btn sm v="gh" onClick={() => { setDec(x => { const n = { ...x }; delete n[fKey]; return n }); setNotes(x => { const n = { ...x }; delete n[fKey]; return n }) }}>Clear</Btn>}
            </div>
            {d === 'rejected' && (
              <textarea value={notes[fKey] || ''} onChange={e => setNotes(x => ({ ...x, [fKey]: e.target.value }))}
                placeholder="Reason for rejection (shown to member)..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 56 }} />
            )}
          </>
        )}
      </div>
    )
  }

  const hasDecisions = Object.keys(dec).length > 0

  return (
    <Sheet title={`Review goals — ${member.name}`} sub="Approve or reject each field individually" onClose={onClose}>
      {param.enable_value && <FieldRow fKey="value" label="Sales value" fg={{ goal: g.value_goal, status: g.value_status, note: g.value_note }} unit="value" />}
      {param.enable_customers && (param.sel_custs || []).map(id => {
        const c = (customers || []).find(x => x.id === id); if (!c) return null
        const fg = (g.customers || {})[id]
        return <FieldRow key={id} fKey={`c_${id}`} label={`Customer: ${c.name}`} fg={fg} unit="value" />
      })}
      {param.enable_products && (param.sel_prods || []).map(id => {
        const p = (products || []).find(x => x.id === id); if (!p) return null
        const fg = (g.products || {})[id]
        return <FieldRow key={id} fKey={`p_${id}`} label={`Product: ${p.name}`} fg={fg} unit={p.unit} />
      })}
      {param.enable_categories && (param.sel_cats || []).map(id => {
        const c = (categories || []).find(x => x.id === id); if (!c) return null
        const fg = (g.categories || {})[id]
        return <FieldRow key={id} fKey={`cat_${id}`} label={`Category: ${c.name}`} fg={fg} unit={c.unit} />
      })}
      {param.enable_visits && <FieldRow fKey="visits" label="Outlet visits" fg={{ goal: g.visits_goal, status: g.visits_status, note: g.visits_note }} unit="visits" />}
      {param.enable_acq    && <FieldRow fKey="acq"    label="New customer acq." fg={{ goal: g.acq_goal, status: g.acq_status, note: g.acq_note }} unit="customers" />}
      {hasDecisions
        ? <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><Btn v="pri" full onClick={() => { onAction(member.id, dec, notes); onClose() }}>Save decisions</Btn><Btn full onClick={onClose}>Cancel</Btn></div>
        : <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>Approve or reject at least one field to save.</div>
      }
    </Sheet>
  )
}
