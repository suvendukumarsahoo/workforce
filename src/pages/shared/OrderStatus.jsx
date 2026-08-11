import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, F } from '../../components/ui.jsx'
import OrderFullDetail from '../../components/OrderFullDetail.jsx'
import { getOrderStageLabel, getOrderStageColor } from '../../components/orderStageLabel.js'
import * as db from '../../lib/db.js'

const selStyle = { padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }
const uniqById = arr => Object.values(Object.fromEntries((arr || []).filter(Boolean).map(x => [x.id, x])))

// Also reused directly by DistributorOrder.jsx's own "My Distributor Orders" list (Sales Team) —
// that screen used to hand-roll a second, drifted copy of this exact list (a raw, permanently-stuck
// order.status string instead of getOrderStageLabel's real pipeline-wide derivation, and non-
// editable orders had no click-through to any detail at all). `title`/`headerRight` let it relabel
// the card and inject its own "+ New Order" button; `onEditOrder`, when provided, routes a still-
// editable order_submitted order into DistributorOrder.jsx's edit flow instead of opening the
// (deliberately read-only) OrderFullDetail — every other order still opens detail as normal.
export default function OrderStatus({ title = 'Order Status', headerRight, onEditOrder }) {
  const { currentUser, role } = useAuth()
  const { products, members, users } = useData()
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState(null)
  const [distributorFilter, setDistributorFilter] = useState('')
  const [repFilter, setRepFilter] = useState('')
  const [managerFilter, setManagerFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')

  // Same 3-way scoping as DistributorSecondaryReport.jsx: Sales Team sees only their own orders,
  // Manager sees their own team's (members.manager_id === currentUser.id), everyone else
  // (Admin/Accounts/HR/WM) sees every Sales Team member's orders org-wide.
  const isOwnView = role?.id === 'r5'
  const isManagerRole = role?.id === 'r2'
  const multiRep = !isOwnView
  const mid = currentUser?.member_id

  const loadData = async () => {
    const { data } = await db.fetchAllOrdersWithItems()
    setOrders(data || [])
    const { data: payData } = await db.fetchOrderPayments()
    setPayments(payData || [])
    setLoaded(true)
  }
  if (!loaded) loadData()

  const salesTeamMemberIds = new Set((users || []).filter(u => u.role_id === 'r5' && u.member_id != null).map(u => u.member_id))
  const scopeMembers = isOwnView
    ? (members || []).filter(m => m.id === mid)
    : isManagerRole
      ? (members || []).filter(m => salesTeamMemberIds.has(m.id) && String(m.manager_id || '') === String(currentUser?.id))
      : (members || []).filter(m => salesTeamMemberIds.has(m.id)) // org-wide roles — every Sales Team member
  const managerName = managerId => (users || []).find(u => String(u.id) === String(managerId))?.name || null
  // Manager column/filter only earns its place in the org-wide view — Manager's own view is always
  // "themselves," repeating that on every row would just be dead weight (same reasoning the Rep
  // column already uses against Sales Team's own view).
  const showManager = multiRep && !isManagerRole
  const managerOptions = showManager
    ? Object.values(Object.fromEntries(scopeMembers.filter(m => m.manager_id).map(m => [m.manager_id, { id: m.manager_id, name: managerName(m.manager_id) || m.manager_id }])))
    : []

  const managerFilteredMembers = managerFilter ? scopeMembers.filter(m => String(m.manager_id || '') === managerFilter) : scopeMembers
  const effectiveMemberIds = new Set((repFilter ? [repFilter] : managerFilteredMembers.map(m => m.id)).map(String))

  const scopedOrders = orders.filter(o => effectiveMemberIds.has(String(o.member_id)))
  const orderValue = o => (o.items || []).reduce((s, it) => s + (it.rate || 0) * (it.final_qty ?? it.approved_qty ?? it.order_qty), 0)
  // Rep column only earns its place in the org-wide/team view (Manager/Admin/etc.) — Sales Team's
  // own list is always "themselves," a repeated column there would just be dead weight.
  const showRep = multiRep
  const managerForOrder = o => showManager ? managerName((members || []).find(m => m.id === o.member_id)?.manager_id) : null

  // Distributor dropdown options come from the scoped-but-not-yet-filtered set, same pattern as
  // DistributorSecondaryReport.jsx's uniqById — so picking a distributor never hides itself out of
  // its own option list. Date/value filters default to blank (no filter) rather than defaulting to
  // "this month" the way period-scoped reports do — this list has no natural period of its own.
  const distributorOptions = uniqById(scopedOrders.map(o => o.distributor))
  const visibleOrders = scopedOrders.filter(o => {
    if (distributorFilter && o.distributor_id !== distributorFilter) return false
    if (fromDate && new Date(o.order_date) < new Date(fromDate)) return false
    if (toDate && new Date(o.order_date) > new Date(`${toDate}T23:59:59`)) return false
    const val = orderValue(o)
    if (minValue && val < Number(minValue)) return false
    if (maxValue && val > Number(maxValue)) return false
    return true
  })

  const th = { padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280', whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', fontSize: 12, verticalAlign: 'middle' }

  return (
    <div>
      <Card>
        <CH title="Filters" />
        <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Distributor</div>
            <select value={distributorFilter} onChange={e => setDistributorFilter(e.target.value)} style={selStyle}>
              <option value="">All</option>
              {distributorOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {showManager && (
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Manager</div>
              <select value={managerFilter} onChange={e => { setManagerFilter(e.target.value); setRepFilter('') }} style={selStyle}>
                <option value="">All</option>
                {managerOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          {multiRep && (
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Rep</div>
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)} style={selStyle}>
                <option value="">All</option>
                {managerFilteredMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>From</div>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={selStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>To</div>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={selStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Value ≥</div>
            <input type="number" placeholder="Min" value={minValue} onChange={e => setMinValue(e.target.value)} style={{ ...selStyle, width: 90 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Value ≤</div>
            <input type="number" placeholder="Max" value={maxValue} onChange={e => setMaxValue(e.target.value)} style={{ ...selStyle, width: 90 }} />
          </div>
          {(distributorFilter || repFilter || managerFilter || fromDate || toDate || minValue || maxValue) && (
            <button onClick={() => { setDistributorFilter(''); setRepFilter(''); setManagerFilter(''); setFromDate(''); setToDate(''); setMinValue(''); setMaxValue('') }}
              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}>
              Clear filters
            </button>
          )}
        </div>
      </Card>

      <Card>
        <CH title={title} sub={`${visibleOrders.length} order(s)`} right={headerRight} />
        {visibleOrders.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No orders match these filters</div>}
        {visibleOrders.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: showRep ? (showManager ? 1080 : 980) : 860 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={th}>Order #</th>
                  <th style={th}>Distributor</th>
                  <th style={th}>Town</th>
                  {showRep && <th style={th}>Rep</th>}
                  {showManager && <th style={th}>Manager</th>}
                  <th style={th}>Date</th>
                  <th style={th}>Value</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map(o => {
                  const editable = onEditOrder && o.status === 'order_submitted'
                  const color = getOrderStageColor(o)
                  return (
                    <tr key={o.id} onClick={() => editable ? onEditOrder(o) : setSelected(o)}
                      style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ ...td, fontWeight: 700 }}>#{o.id}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{o.distributor?.name}</td>
                      <td style={{ ...td, color: '#6b7280' }}>{o.distributor?.town || o.distributor?.area || '—'}</td>
                      {showRep && <td style={td}>{o.member?.name || '—'}</td>}
                      {showManager && <td style={{ ...td, color: '#6b7280' }}>{managerForOrder(o) || '—'}</td>}
                      <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>{new Date(o.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{F(orderValue(o))}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: `${color}22`, color, whiteSpace: 'nowrap' }}>
                          {getOrderStageLabel(o)}
                        </span>
                        {editable && <div style={{ fontSize: 10, color: '#2563eb', marginTop: 3 }}>Tap to edit</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <OrderFullDetail
          order={selected} payment={payments.find(p => p.order_id === selected.id)} products={products}
          onClose={() => setSelected(null)}
          onChanged={async () => { await loadData(); setSelected(null) }}
        />
      )}
    </div>
  )
}