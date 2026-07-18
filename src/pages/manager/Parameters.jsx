import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Btn, Sheet, Inp } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function Parameters() {
  const { can } = useAuth()
const { members, params, setParams, products, categories, distributors: customers, showToast } = useData()
const [editing, setEditing] = useState(null)
  const save = async (memberId, draft) => {
    const { data, error } = await db.upsertParameter(memberId, {
      enable_value: draft.enableValue, enable_customers: draft.enableCustomers,
      enable_products: draft.enableProducts, enable_categories: draft.enableCategories,
      enable_visits: draft.enableVisits, enable_acq: draft.enableAcq,
      exp_budget: draft.expBudget,
      sel_custs: draft.selCusts, sel_prods: draft.selProds, sel_cats: draft.selCats,
    })
    if (error) { showToast('Error saving parameters'); return }
    setParams(prev => ({ ...prev, [memberId]: { ...draft, member_id: memberId } }))
    setEditing(null)
    showToast('Parameters saved')
  }

  return (
    <div>
      {editing && <ParamSheet member={editing} param={params[editing.id]} products={products} categories={categories} customers={customers} onSave={save} onClose={() => setEditing(null)} />}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#1e40af' }}>
        ⚙️ Select which fields each member should set goals for. You are defining scope only — not the values.
      </div>
      <Card>
        <CH title="Parameters per member" sub="Member enters their own goal values against these" />
        {(members || []).map(m => {
          const p = params[m.id] || {}
          const fields = [p.enable_value && 'Value', p.enable_customers && 'Customers', p.enable_products && 'Products', p.enable_categories && 'Categories', p.enable_visits && 'Visits', p.enable_acq && 'Acq'].filter(Boolean)
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <Av av={m.avatar} color={m.color} sz={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{fields.length ? fields.join(' · ') : 'No parameters set'}</div>
              </div>
              {can('edit') && <Btn sm onClick={() => setEditing(m)}>✏️ Edit</Btn>}
            </div>
          )
        })}
      </Card>
    </div>
  )
}

function ParamSheet({ member, param, products, categories, customers, onSave, onClose }) {
  const p = param || {}
  const [d, setD] = useState({
    enableValue: p.enable_value ?? true,
    enableCustomers: p.enable_customers ?? false,
    enableProducts: p.enable_products ?? false,
    enableCategories: p.enable_categories ?? false,
    enableVisits: p.enable_visits ?? false,
    enableAcq: p.enable_acq ?? false,
    expBudget: p.exp_budget || '',
    selCusts: p.sel_custs || [],
    selProds: p.sel_prods || [],
    selCats: p.sel_cats || [],
  })

  const myCusts = (customers || []).filter(c => (c.assignedTo || []).includes(member.id))
  const addItem = (key, id) => { if (id && !d[key].includes(id)) setD(x => ({ ...x, [key]: [...x[key], id] })) }
  const remItem = (key, id) => setD(x => ({ ...x, [key]: x[key].filter(v => v !== id) }))

  const Chips = ({ listKey, allItems, labelFn, enableKey }) => {
    if (!d[enableKey]) return null
    const avail = allItems.filter(x => !d[listKey].includes(x.id))
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {d[listKey].map(id => {
            const item = allItems.find(x => x.id === id) || { name: id }
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#1d4ed8', borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>
                {labelFn(item)}
                <button onClick={() => remItem(listKey, id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 14 }}>×</button>
              </span>
            )
          })}
        </div>
        {avail.length > 0 && (
          <select onChange={e => { addItem(listKey, e.target.value); e.target.value = '' }} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
            <option value="">+ Add from list...</option>
            {avail.map(x => <option key={x.id} value={x.id}>{labelFn(x)}</option>)}
          </select>
        )}
      </div>
    )
  }

  const Toggle = ({ label, enableKey, children }) => (
    <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!d[enableKey]} onChange={e => setD(x => ({ ...x, [enableKey]: e.target.checked }))} style={{ width: 16, height: 16 }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
      </label>
      {d[enableKey] && children && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )

  return (
    <Sheet title={`Parameters — ${member.name}`} sub="Define scope only. Member sets their own goal values." onClose={onClose}>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#1e40af' }}>
        Tick which fields this member should set goals for. For products/categories/customers, select specific items from the dropdown.
      </div>
      <Toggle label="Sales value (overall)" enableKey="enableValue" />
      <Toggle label="Customer-wise value" enableKey="enableCustomers">
        <Chips listKey="selCusts" allItems={myCusts} labelFn={x => x.name} enableKey="enableCustomers" />
      </Toggle>
      <Toggle label="Product-wise quantity" enableKey="enableProducts">
        <Chips listKey="selProds" allItems={products} labelFn={x => `${x.name} (${x.unit})`} enableKey="enableProducts" />
      </Toggle>
      <Toggle label="Category-wise quantity" enableKey="enableCategories">
        <Chips listKey="selCats" allItems={categories} labelFn={x => `${x.name} (${x.unit})`} enableKey="enableCategories" />
      </Toggle>
      <Toggle label="Outlet visits" enableKey="enableVisits" />
      <Toggle label="New customer acquisition" enableKey="enableAcq" />
      <Inp label="Expense budget (₹)" type="number" value={d.expBudget} onChange={v => setD(x => ({ ...x, expBudget: Number(v) }))} placeholder="e.g. 25000" />
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn v="pri" full onClick={() => onSave(member.id, d)}>Save parameters</Btn>
        <Btn full onClick={onClose}>Cancel</Btn>
      </div>
    </Sheet>
  )
}
