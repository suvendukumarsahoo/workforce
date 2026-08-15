import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Inp, Sheet, SBadge, CrudTable, EntitySheet, F } from '../../components/ui.jsx'
import { resolveProductPrice, activeOverridesForProduct } from '../../lib/pricing.js'
import * as db from '../../lib/db.js'

// Base price (products.price) and distributor/tier overrides all flow through the same
// price_change_requests approval log — Accounts (or Admin) proposes on the Propose tab, Admin
// approves on the Approvals tab (can('approve'), same convention as ExpApprovals/GoalApprovals).
// Tier structure itself (create tiers, assign distributors — see Distributors.jsx) is plain
// Admin-direct-edit master data, no approval needed, same convention as every other master table.
export default function PricingMaster({ navParams }) {
  const { currentUser, role, can } = useAuth()
  const { products, distributors, users, priceTiers, setPriceTiers, priceChangeRequests, priceOverrideMaps, showToast, loadAll } = useData()

  const isAdmin = role?.id === 'r1'
  const canPropose = can('add')
  // Approvals/Tiers are deliberately hard-gated to Admin (role.id) rather than the generic can()
  // flags every other approval screen in this app uses — the Accounts role already carries
  // edit/approve for its Invoice/Expense duties, and reusing those generic flags here would let
  // Accounts approve its own price proposals, breaking the propose/approve separation of duties
  // this module was specifically scoped to have.
  const canApprove = isAdmin && can('approve')
  const canManageTiers = isAdmin && (can('add') || can('edit') || can('del'))

  const TABS = [
    { key: 'current', label: 'Current Prices', show: true },
    { key: 'propose', label: 'Propose Change', show: canPropose },
    { key: 'approvals', label: 'Approvals', show: canApprove },
    { key: 'tiers', label: 'Tiers', show: canManageTiers },
  ].filter(t => t.show)

  const [tab, setTab] = useState(navParams?.tab && TABS.some(t => t.key === navParams.tab) ? navParams.tab : (TABS[0]?.key || 'current'))

  const userName = uid => (users || []).find(u => String(u.id) === String(uid))?.name || uid
  const tierName = tid => (priceTiers || []).find(t => String(t.id) === String(tid))?.name || tid
  const distributorName = did => (distributors || []).find(d => d.id === did)?.name || did

  const scopeLabel = r => r.scope_type === 'base' ? 'Base Price'
    : r.scope_type === 'distributor' ? `Distributor — ${r.distributor?.name || distributorName(r.distributor_id)}`
    : `Tier — ${r.tier?.name || tierName(r.tier_id)}`

  const STATUS_LABEL = { pending_approval: 'Pending', approved: 'Approved', rejected: 'Rejected' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tab === t.key ? '#2563eb' : '#f3f4f6', color: tab === t.key ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'current' && (
        <CurrentPricesTab products={products} distributors={distributors} priceTiers={priceTiers}
          priceChangeRequests={priceChangeRequests}
          scopeLabel={scopeLabel} STATUS_LABEL={STATUS_LABEL} userName={userName} />
      )}

      {tab === 'propose' && (
        <ProposeChangeTab products={products} distributors={distributors} priceTiers={priceTiers}
          priceChangeRequests={priceChangeRequests} priceOverrideMaps={priceOverrideMaps}
          currentUser={currentUser} showToast={showToast} loadAll={loadAll}
          scopeLabel={scopeLabel} STATUS_LABEL={STATUS_LABEL} />
      )}

      {tab === 'approvals' && canApprove && (
        <ApprovalsTab priceChangeRequests={priceChangeRequests} currentUser={currentUser}
          showToast={showToast} loadAll={loadAll} scopeLabel={scopeLabel} userName={userName} />
      )}

      {tab === 'tiers' && canManageTiers && (
        <TiersTab priceTiers={priceTiers} setPriceTiers={setPriceTiers} distributors={distributors}
          can={can} showToast={showToast} />
      )}
    </div>
  )
}

// ─── CURRENT PRICES ───────────────────────────────────────────────────────────
function CurrentPricesTab({ products, distributors, priceTiers, priceChangeRequests, scopeLabel, STATUS_LABEL, userName }) {
  const [drill, setDrill] = useState(null) // product row

  const overridesCount = pid => {
    const { distributorRows, tierRows } = activeOverridesForProduct(pid, priceChangeRequests)
    return distributorRows.length + tierRows.length
  }

  const drillOverrides = drill ? activeOverridesForProduct(drill.id, priceChangeRequests) : null
  const drillHistory = drill ? (priceChangeRequests || []).filter(r => r.product_id === drill.id) : []

  return (
    <>
      <Card>
        <CH title="Current Prices" sub={`${(products || []).length} product(s)`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '9px 12px', fontSize: 10, color: '#6b7280', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                <th style={{ padding: '9px 12px', fontSize: 10, color: '#6b7280', textAlign: 'right', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>Base Price</th>
                <th style={{ padding: '9px 12px', fontSize: 10, color: '#6b7280', textAlign: 'right', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>Active Overrides</th>
              </tr>
            </thead>
            <tbody>
              {(products || []).map(p => (
                <tr key={p.id} onClick={() => setDrill(p)} style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600 }}>{p.name} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({p.unit})</span></td>
                  <td style={{ padding: '10px 12px', fontSize: 12, textAlign: 'right' }}>{F(p.price)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, textAlign: 'right' }}>{overridesCount(p.id) || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {drill && (
        <Sheet title={drill.name} sub={`Base Price: ${F(drill.price)}`} onClose={() => setDrill(null)}>
          <Card>
            <CH title="Active Distributor Overrides" />
            {drillOverrides.distributorRows.length === 0 && <div style={{ textAlign: 'center', padding: 16, color: '#9ca3af', fontSize: 12 }}>None</div>}
            {drillOverrides.distributorRows.map(r => (
              <div key={r.distributorId} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                <span>{(distributors || []).find(d => d.id === r.distributorId)?.name || r.distributorId}</span>
                <strong>{F(r.price)}</strong>
              </div>
            ))}
          </Card>
          <Card>
            <CH title="Active Tier Overrides" />
            {drillOverrides.tierRows.length === 0 && <div style={{ textAlign: 'center', padding: 16, color: '#9ca3af', fontSize: 12 }}>None</div>}
            {drillOverrides.tierRows.map(r => (
              <div key={r.tierId} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                <span>{(priceTiers || []).find(t => String(t.id) === r.tierId)?.name || r.tierId}</span>
                <strong>{F(r.price)}</strong>
              </div>
            ))}
          </Card>
          <Card>
            <CH title="History" sub={`${drillHistory.length} request(s)`} />
            {drillHistory.length === 0 && <div style={{ textAlign: 'center', padding: 16, color: '#9ca3af', fontSize: 12 }}>No price changes proposed yet</div>}
            {drillHistory.map(r => (
              <div key={r.id} style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{scopeLabel(r)}</span>
                  <SBadge s={STATUS_LABEL[r.status] || r.status} />
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {F(r.previous_price)} → {F(r.proposed_price)} · proposed by {userName(r.proposed_by)}
                </div>
                {r.status === 'rejected' && r.rejection_reason && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>Reason: {r.rejection_reason}</div>
                )}
              </div>
            ))}
          </Card>
        </Sheet>
      )}
    </>
  )
}

// ─── PROPOSE CHANGE ───────────────────────────────────────────────────────────
function ProposeChangeTab({ products, distributors, priceTiers, priceChangeRequests, priceOverrideMaps, currentUser, showToast, loadAll, scopeLabel, STATUS_LABEL }) {
  const [productId, setProductId] = useState('')
  const [scopeType, setScopeType] = useState('base')
  const [distributorId, setDistributorId] = useState('')
  const [tierId, setTierId] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const product = (products || []).find(p => p.id === productId)

  const currentScopePrice = () => {
    if (!product) return null
    if (scopeType === 'base') return Number(product.price) || 0
    if (scopeType === 'distributor') {
      const d = (distributors || []).find(x => x.id === distributorId)
      if (!d) return null
      return resolveProductPrice(product, d, priceOverrideMaps)
    }
    if (scopeType === 'tier') {
      if (!tierId) return null
      return resolveProductPrice(product, { price_tier_id: tierId }, priceOverrideMaps)
    }
    return null
  }
  const previewPrice = currentScopePrice()

  const hasPendingDuplicate = () => (priceChangeRequests || []).some(r =>
    r.status === 'pending_approval' && r.product_id === productId && r.scope_type === scopeType &&
    (scopeType === 'distributor' ? r.distributor_id === distributorId : scopeType === 'tier' ? String(r.tier_id) === String(tierId) : true))

  const reset = () => { setProductId(''); setScopeType('base'); setDistributorId(''); setTierId(''); setNewPrice(''); setNote('') }

  const submit = async () => {
    if (!productId) { showToast('Select a product'); return }
    if (scopeType === 'distributor' && !distributorId) { showToast('Select a distributor'); return }
    if (scopeType === 'tier' && !tierId) { showToast('Select a tier'); return }
    if (newPrice === '' || Number(newPrice) <= 0) { showToast('Enter a valid new price'); return }
    if (hasPendingDuplicate()) { showToast('A change for this exact scope is already pending approval'); return }

    setBusy(true)
    const { error } = await db.createPriceChangeRequest({
      productId, scopeType,
      distributorId: scopeType === 'distributor' ? distributorId : null,
      tierId: scopeType === 'tier' ? tierId : null,
      previousPrice: previewPrice ?? 0,
      proposedPrice: Number(newPrice),
      note, proposedBy: currentUser?.id,
    })
    setBusy(false)
    if (error) { showToast('Error proposing price change'); return }
    showToast('Price change proposed — sent for approval')
    reset()
    await loadAll()
  }

  const myRequests = (priceChangeRequests || []).filter(r => String(r.proposed_by) === String(currentUser?.id))

  return (
    <>
      <Card>
        <CH title="Propose Price Change" />
        <div style={{ padding: 14 }}>
          <Inp label="Product" value={productId} onChange={setProductId} req
            options={[{ value: '', label: 'Select product...' }, ...(products || []).map(p => ({ value: p.id, label: `${p.name} (${p.unit})` }))]} />
          <Inp label="Scope" value={scopeType} onChange={v => { setScopeType(v); setDistributorId(''); setTierId('') }}
            options={[{ value: 'base', label: 'Base Price (everyone)' }, { value: 'distributor', label: 'Specific Distributor' }, { value: 'tier', label: 'Price Tier' }]} />
          {scopeType === 'distributor' && (
            <Inp label="Distributor" value={distributorId} onChange={setDistributorId} req
              options={[{ value: '', label: 'Select distributor...' }, ...(distributors || []).map(d => ({ value: d.id, label: d.name }))]} />
          )}
          {scopeType === 'tier' && (
            <Inp label="Tier" value={tierId} onChange={setTierId} req
              options={[{ value: '', label: 'Select tier...' }, ...(priceTiers || []).map(t => ({ value: String(t.id), label: t.name }))]} />
          )}
          {product && previewPrice !== null && (
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#374151', marginBottom: 12 }}>
              Current effective price for this scope: <strong>{F(previewPrice)}</strong>
            </div>
          )}
          <Inp label="New Price" type="number" value={newPrice} onChange={setNewPrice} req />
          <Inp label="Note (optional)" value={note} onChange={setNote} />
          <Btn v="pri" full disabled={busy} onClick={submit}>{busy ? 'Saving...' : 'Submit for Approval'}</Btn>
        </div>
      </Card>

      <Card>
        <CH title="My Proposals" sub={`${myRequests.length} total`} />
        {myRequests.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None yet</div>}
        {myRequests.map(r => (
          <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{r.product?.name || r.product_id} — {scopeLabel(r)}</span>
              <SBadge s={STATUS_LABEL[r.status] || r.status} />
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{F(r.previous_price)} → {F(r.proposed_price)}</div>
            {r.status === 'rejected' && r.rejection_reason && (
              <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>Reason: {r.rejection_reason}</div>
            )}
          </div>
        ))}
      </Card>
    </>
  )
}

// ─── APPROVALS ────────────────────────────────────────────────────────────────
function ApprovalsTab({ priceChangeRequests, currentUser, showToast, loadAll, scopeLabel, userName }) {
  const [selected, setSelected] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const pending = (priceChangeRequests || []).filter(r => r.status === 'pending_approval')

  const approve = async row => {
    setBusy(true)
    const { error } = await db.approvePriceChangeRequest(row.id, currentUser?.id)
    setBusy(false)
    if (error) { showToast('Error approving'); return }
    showToast('Price change approved')
    setSelected(null)
    await loadAll()
  }
  const reject = async row => {
    if (!reason.trim()) { showToast('Add a reason before rejecting'); return }
    setBusy(true)
    const { error } = await db.rejectPriceChangeRequest(row.id, currentUser?.id, reason)
    setBusy(false)
    if (error) { showToast('Error rejecting'); return }
    showToast('Price change rejected')
    setSelected(null); setReason('')
    await loadAll()
  }

  return (
    <>
      <Card>
        <CH title="Pending Price Approvals" sub={`${pending.length} pending`} />
        {pending.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No pending changes</div>}
        {pending.map(r => (
          <div key={r.id} onClick={() => setSelected(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.product?.name || r.product_id}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{scopeLabel(r)} · proposed by {userName(r.proposed_by)}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
              {F(r.previous_price)} → {F(r.proposed_price)}
            </div>
          </div>
        ))}
      </Card>

      {selected && (
        <Sheet title={selected.product?.name || selected.product_id} sub={scopeLabel(selected)} onClose={() => setSelected(null)}>
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Previous: <strong>{F(selected.previous_price)}</strong></div>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Proposed: <strong>{F(selected.proposed_price)}</strong></div>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Proposed by: <strong>{userName(selected.proposed_by)}</strong></div>
            {selected.note && <div style={{ fontSize: 12, color: '#374151', marginTop: 6 }}>Note: {selected.note}</div>}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Reason (required if rejecting)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn v="pri" full disabled={busy} onClick={() => approve(selected)}>Approve</Btn>
            <Btn v="bad" full disabled={busy} onClick={() => reject(selected)}>Reject</Btn>
          </div>
        </Sheet>
      )}
    </>
  )
}

// ─── TIERS ────────────────────────────────────────────────────────────────────
function TiersTab({ priceTiers, setPriceTiers, distributors, can, showToast }) {
  const [sheet, setSheet] = useState(null)

  const distributorCount = tierId => (distributors || []).filter(d => String(d.price_tier_id) === String(tierId)).length

  const save = async d => {
    const payload = { name: d.name, description: d.description || null }
    if (sheet?.id) {
      const { data, error } = await db.updatePriceTier(sheet.id, payload)
      if (error) { showToast('Error saving'); return }
      setPriceTiers(prev => prev.map(x => x.id === sheet.id ? data : x))
    } else {
      const { data, error } = await db.createPriceTier(payload)
      if (error) { showToast('Error saving'); return }
      setPriceTiers(prev => [...prev, data])
    }
    setSheet(null)
    showToast(sheet?.id ? 'Tier updated' : 'Tier added')
  }

  const del = async row => {
    const { error } = await db.deletePriceTier(row.id)
    if (error) { showToast("Can't delete — still assigned to a distributor or has price history"); return }
    setPriceTiers(prev => prev.filter(x => x.id !== row.id))
    showToast('Tier deleted')
  }

  return (
    <div>
      {sheet !== null && (
        <EntitySheet
          title={sheet?.id ? 'Edit tier' : 'Add tier'}
          fields={[
            { key: 'name', label: 'Tier name', req: true, ph: 'e.g. Gold' },
            { key: 'description', label: 'Description' },
          ]}
          init={sheet?.id ? sheet : {}}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
      <CrudTable
        title="Price Tiers"
        sub="Assign distributors to a tier from the Distributors master screen"
        cols={[
          { key: 'name', label: 'Name', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
          { key: 'description', label: 'Description', render: r => r.description || <span style={{ color: '#9ca3af' }}>—</span> },
          { key: 'distributors', label: 'Distributors', render: r => distributorCount(r.id) },
        ]}
        rows={priceTiers || []}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet({})}
        onEdit={row => setSheet(row)}
        onDelete={del}
      />
    </div>
  )
}
