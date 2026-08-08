import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, F } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { downloadReportPdf, downloadReportExcel } from '../../lib/printSecondaryReport.js'
import { downloadSecondaryOrderPdf } from '../../lib/printSecondaryOrder.js'
import { getCurrentPeriod, monthRangeForPeriod } from '../../lib/period.js'

const selStyle = { padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }
const uniqById = arr => Object.values(Object.fromEntries((arr || []).filter(Boolean).map(x => [x.id, x])))

// Reached three ways: direct menu click (defaults to the current month, unlocked), or a click-
// through from Dashboard.jsx's DistributorSecondarySection / TeamSnapshot.jsx's own panel (pre-
// filled to that panel's active Today/Month/Year range, still unlocked) / GoalsStatus.jsx's
// Distributor Secondary goal panel (pre-filled AND locked to that period's month, since a Goals
// figure only means anything for the exact month it was computed over).
export default function DistributorSecondaryReport({ navParams }) {
  const { currentUser, role } = useAuth()
  const { members, users } = useData()

  const isOwnView = role?.id === 'r5'
  const multiRep = !isOwnView
  const salesTeamMemberIds = new Set((users || []).filter(u => u.role_id === 'r5' && u.member_id != null).map(u => u.member_id))
  const scopeMembers = isOwnView
    ? (members || []).filter(m => m.id === currentUser?.member_id)
    : role?.id === 'r2'
      ? (members || []).filter(m => salesTeamMemberIds.has(m.id) && String(m.manager_id || '') === String(currentUser?.id))
      : (members || []).filter(m => salesTeamMemberIds.has(m.id)) // r1 Admin — every Sales Team member
  const scopeMemberIds = scopeMembers.map(m => m.id)

  const defaultRange = monthRangeForPeriod(getCurrentPeriod())
  const [from, setFrom] = useState(navParams?.from || defaultRange.from)
  const [to, setTo] = useState(navParams?.to || defaultRange.to)
  const locked = !!navParams?.locked
  const [distributorId, setDistributorId] = useState('')
  const [beatId, setBeatId] = useState('')
  const [repId, setRepId] = useState('') // member id — multiRep only

  const [orders, setOrders] = useState(null)
  const [tab, setTab] = useState('summary')
  const [drillGroup, setDrillGroup] = useState(null) // a Summary row's own orders
  const [viewOrder, setViewOrder] = useState(null)

  const effectiveMemberIds = repId ? [repId] : scopeMemberIds

  const load = async () => {
    setOrders(null)
    const { data } = await db.fetchSecondaryOrdersForReport({ memberIds: effectiveMemberIds, from, to })
    setOrders(data || [])
  }
  // Distributor/Beat filters narrow the already-fetched set client-side (see below) rather than
  // re-querying — cheap, and lets their dropdown options reflect exactly what's in the loaded
  // date range/rep scope. Date range/rep DO need a re-fetch.
  useEffect(() => { load() }, [from, to, repId]) // eslint-disable-line react-hooks/exhaustive-deps

  const distributorOptions = uniqById((orders || []).map(o => o.distributor))
  const beatOptions = uniqById((orders || []).map(o => o.beat))

  const filtered = (orders || []).filter(o =>
    (!distributorId || o.distributor_id === distributorId) && (!beatId || o.beat_id === beatId)
  )

  // secondary_orders.member_id has no queryable FK to `members` (see fetchSecondaryOrdersForReport's
  // own note) — resolved client-side against the already-loaded members list instead.
  const memberName = mid => (members || []).find(m => String(m.id) === String(mid))?.name || mid

  const groups = {}
  filtered.forEach(o => {
    const key = multiRep ? `${o.batch_id}|${o.distributor_id}|${o.beat_id}|${o.member_id}` : `${o.batch_id}|${o.distributor_id}|${o.beat_id}`
    if (!groups[key]) groups[key] = { batchId: o.batch_id, distributorName: o.distributor?.name || o.distributor_id, beatName: o.beat?.name || o.beat_id, memberName: memberName(o.member_id), date: o.order_date, orders: [] }
    groups[key].orders.push(o)
  })
  const summaryRows = Object.values(groups).map(g => ({
    ...g,
    totalOrders: g.orders.length,
    totalItems: g.orders.reduce((s, o) => s + (o.items || []).reduce((s2, it) => s2 + (Number(it.qty) || 0), 0), 0),
    totalValue: g.orders.reduce((s, o) => s + (o.items || []).reduce((s2, it) => s2 + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0), 0),
  })).sort((a, b) => new Date(b.date) - new Date(a.date))

  const detailRows = filtered.flatMap(o => (o.items || []).map(it => ({
    date: o.order_date, batchId: o.batch_id, distributorName: o.distributor?.name || o.distributor_id,
    beatName: o.beat?.name || o.beat_id, memberName: memberName(o.member_id),
    orderId: o.id, outlet: o.outlet?.name || o.outlet_id, product: it.product?.name || it.product_id,
    qty: it.qty, rate: it.rate, value: (Number(it.qty) || 0) * (Number(it.rate) || 0),
  })))

  const summaryColumns = [
    { header: 'Date', key: 'date' }, { header: 'Batch ID', key: 'batchId' },
    { header: 'Distributor', key: 'distributorName' }, { header: 'Beat', key: 'beatName' },
    ...(multiRep ? [{ header: 'Sales Rep', key: 'memberName' }] : []),
    { header: 'Total Orders', key: 'totalOrders' }, { header: 'Total Items', key: 'totalItems' },
    { header: 'Total Value', key: 'totalValue' },
  ]
  const detailColumns = [
    { header: 'Date', key: 'date' }, { header: 'Batch ID', key: 'batchId' },
    { header: 'Distributor', key: 'distributorName' }, { header: 'Beat', key: 'beatName' },
    ...(multiRep ? [{ header: 'Sales Rep', key: 'memberName' }] : []),
    { header: 'Order No', key: 'orderId' }, { header: 'Outlet', key: 'outlet' },
    { header: 'Product', key: 'product' }, { header: 'Qty', key: 'qty' },
    { header: 'Rate', key: 'rate' }, { header: 'Value', key: 'value' },
  ]

  const activeColumns = tab === 'summary' ? summaryColumns : detailColumns
  const activeRows = tab === 'summary' ? summaryRows : detailRows
  const rangeLabel = `${from}_to_${to}`

  const exportPdf = () => downloadReportPdf({
    filename: `SecondaryReport-${tab === 'summary' ? 'Summary' : 'Detail'}-${rangeLabel}.pdf`,
    title: `Distributor Secondary — ${tab === 'summary' ? 'Summary' : 'Detail'} Report`,
    sub: `${from} to ${to}`,
    columns: activeColumns, rows: activeRows,
  })
  const exportExcel = () => downloadReportExcel({
    filename: `SecondaryReport-${tab === 'summary' ? 'Summary' : 'Detail'}-${rangeLabel}.xlsx`,
    sheetName: tab === 'summary' ? 'Summary' : 'Detail',
    columns: activeColumns, rows: activeRows,
  })

  return (
    <div>
      <Card>
        <CH title="Filters" />
        <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Distributor</div>
            <select value={distributorId} onChange={e => setDistributorId(e.target.value)} style={selStyle}>
              <option value="">All</option>
              {distributorOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Beat</div>
            <select value={beatId} onChange={e => setBeatId(e.target.value)} style={selStyle}>
              <option value="">All</option>
              {beatOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {multiRep && (
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Sales Rep</div>
              <select value={repId} onChange={e => setRepId(e.target.value)} style={selStyle}>
                <option value="">All</option>
                {scopeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>From</div>
            {locked ? <div style={{ fontSize: 12, fontWeight: 600, padding: '6px 0' }}>{from}</div> :
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={selStyle} />}
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>To</div>
            {locked ? <div style={{ fontSize: 12, fontWeight: 600, padding: '6px 0' }}>{to}</div> :
              <input type="date" value={to} onChange={e => setTo(e.target.value)} style={selStyle} />}
          </div>
          {locked && <div style={{ fontSize: 11, color: '#9ca3af' }}>🔒 Locked to this month (opened from Goals Status)</div>}
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['summary', 'Summary'], ['detail', 'Detail']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tab === key ? '#2563eb' : '#f3f4f6', color: tab === key ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn sm onClick={exportPdf} disabled={activeRows.length === 0}>⬇ PDF</Btn>
          <Btn sm onClick={exportExcel} disabled={activeRows.length === 0}>⬇ Excel</Btn>
        </div>
      </div>

      {orders === null && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>}

      {orders !== null && tab === 'summary' && (
        <Card>
          <CH title="Summary" sub={`${summaryRows.length} batch × distributor × beat group(s)`} />
          {summaryRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No completed batches in this range</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {summaryColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((g, i) => (
                  <tr key={i} onClick={() => setDrillGroup(g)} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.date}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.batchId}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{g.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.beatName}</td>
                    {multiRep && <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.memberName}</td>}
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.totalOrders}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.totalItems}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{F(g.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {orders !== null && tab === 'detail' && (
        <Card>
          <CH title="Detail" sub={`${detailRows.length} item row(s)`} />
          {detailRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No items in this range</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {detailColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.date}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.batchId}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.beatName}</td>
                    {multiRep && <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.memberName}</td>}
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.orderId}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.outlet}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{r.product}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.qty}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{F(r.rate)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{F(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {drillGroup && (
        <Sheet title={`${drillGroup.distributorName} — ${drillGroup.beatName}`} sub={`Batch ${drillGroup.batchId}`} onClose={() => setDrillGroup(null)}>
          {drillGroup.orders.map(o => {
            const value = (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
            return (
              <div key={o.id} onClick={() => setViewOrder(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{o.id}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.outlet?.name || o.outlet_id} · {(o.items || []).length} item(s)</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{F(value)}</div>
              </div>
            )
          })}
        </Sheet>
      )}

      {viewOrder && (
        <SecondaryOrderDetailSheet order={viewOrder} onClose={() => setViewOrder(null)} zIndex={330} />
      )}
    </div>
  )
}

// Read-only full detail for one locked order — reached by drilling Summary row → order-no-wise
// list → this. Reuses printSecondaryOrder.js's existing downloadSecondaryOrderPdf as-is.
function SecondaryOrderDetailSheet({ order, onClose, zIndex }) {
  const items = order.items || []
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const productName = pid => items.find(it => it.product_id === pid)?.product?.name || pid

  return (
    <Sheet title={order.id} sub={order.order_date} onClose={onClose} zIndex={zIndex}>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Distributor: <strong>{order.distributor?.name || order.distributor_id}</strong></div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Beat: <strong>{order.beat?.name || order.beat_id}</strong></div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 14 }}>Outlet: <strong>{order.outlet?.name || order.outlet_id}</strong></div>

      {items.map(it => (
        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
          <span>{it.product?.name || it.product_id} × {it.qty}</span>
          <span style={{ fontWeight: 600 }}>{F((Number(it.qty) || 0) * (Number(it.rate) || 0))}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
        <span>Total</span><span>{F(total)}</span>
      </div>

      <Btn v="pri" full onClick={() => downloadSecondaryOrderPdf({ order, outletName: order.outlet?.name || order.outlet_id, productName })} style={{ marginTop: 10 }}>
        ⬇ PDF
      </Btn>
    </Sheet>
  )
}
