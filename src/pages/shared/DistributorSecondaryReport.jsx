import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, F, BackTo } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { downloadReportPdf, downloadReportExcel } from '../../lib/printSecondaryReport.js'
import { getCurrentPeriod, monthRangeForPeriod } from '../../lib/period.js'
import SecondaryOrderDetailSheet from '../../components/SecondaryOrderDetailSheet.jsx'

const selStyle = { padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }
const uniqById = arr => Object.values(Object.fromEntries((arr || []).filter(Boolean).map(x => [x.id, x])))
// Quantities can be fractional (unit-conversion feature stores a base-unit-equivalent, e.g. 10
// Pieces ÷ 50/Base = 0.2) — long floating-point tails (127.04761904761905) look broken on screen
// and in exports, so round to 2 decimals wherever a qty/qty-sum is shown.
// Money is rounded to whole rupees, not qty's 2 decimals — same "round at data-construction time"
// convention as round2 above (so both the on-screen table and the PDF/Excel export inherit it,
// rather than only the render call).
const round0 = n => Math.round(Number(n) || 0)
// A group's date column can span more than one real value once it's no longer keyed by that exact
// field (e.g. Detail's batch grouping vs. Confirmation Date, or either tab's non-active/reference
// column) — collapses to the single shared date when every order in the group agrees, a compact
// range when they don't, or a dash when none of the group's orders have that date at all yet
// (e.g. Confirmation Date on a still-undelivered batch).
const dateRangeLabel = (orders, field) => {
  const dates = [...new Set(orders.map(field).filter(Boolean))].sort()
  if (dates.length === 0) return '—'
  if (dates.length === 1) return dates[0]
  return `${dates[0]} – ${dates[dates.length - 1]}`
}

// Reached three ways: direct menu click (defaults to the current month, unlocked), or a click-
// through from Dashboard.jsx's DistributorSecondarySection / TeamSnapshot.jsx's own panel (pre-
// filled to that panel's active Today/Month/Year range, still unlocked) / GoalsStatus.jsx's
// Distributor Secondary goal panel (pre-filled AND locked to that period's month, since a Goals
// figure only means anything for the exact month it was computed over).
export default function DistributorSecondaryReport({ navParams, onNavigate }) {
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
  const [distributorId, setDistributorId] = useState(navParams?.distributorId || '')
  const [beatId, setBeatId] = useState('')
  const [repId, setRepId] = useState('') // member id — multiRep only
  // Which date governs the From/To range and (on Summary) the grouping — the other one just rides
  // along as a reference column, never filtered or grouped on. 'order' matches every existing entry
  // point's current behavior (Dashboard/TeamSnapshot/GoalsStatus links, direct menu open) — none of
  // those pass dateBasis today, so nothing changes for them unless a caller opts in.
  const [dateBasis, setDateBasis] = useState(navParams?.dateBasis || 'order')

  const [orders, setOrders] = useState(null)
  const [tab, setTab] = useState(navParams?.tab || 'summary')
  const [drillGroup, setDrillGroup] = useState(null) // a Summary row's own orders
  const [viewOrder, setViewOrder] = useState(null)

  const effectiveMemberIds = repId ? [repId] : scopeMemberIds

  // Order Date basis narrows the fetch itself server-side (order_date, cheap, unchanged from before).
  // Confirmation Date basis can't be pushed into the same SQL filter — delivered_date lives on the
  // embedded delivery row, not secondary_orders itself — so that basis fetches unbounded (same
  // "fetch wide, filter client-side" convention this app already uses for Stock & Sales Report) and
  // the range is applied below instead, against o.delivery?.delivered_date.
  const load = async () => {
    setOrders(null)
    const { data } = await db.fetchSecondaryOrdersForReport({
      memberIds: effectiveMemberIds, ...(dateBasis === 'order' ? { from, to } : {}),
    })
    setOrders(data || [])
  }
  // Distributor/Beat filters narrow the already-fetched set client-side (see below) rather than
  // re-querying — cheap, and lets their dropdown options reflect exactly what's in the loaded
  // date range/rep scope. Date range/rep/basis DO need a re-fetch (basis changes whether from/to
  // even reach the server at all).
  useEffect(() => { load() }, [from, to, repId, dateBasis]) // eslint-disable-line react-hooks/exhaustive-deps

  const distributorOptions = uniqById((orders || []).map(o => o.distributor))
  const beatOptions = uniqById((orders || []).map(o => o.beat))

  const inConfirmRange = o => {
    const d = o.delivery?.delivered_date
    if (!d) return false
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }
  const filtered = (orders || []).filter(o =>
    (!distributorId || o.distributor_id === distributorId) && (!beatId || o.beat_id === beatId) &&
    (dateBasis === 'order' || inConfirmRange(o))
  )

  // secondary_orders.member_id has no queryable FK to `members` (see fetchSecondaryOrdersForReport's
  // own note) — resolved client-side against the already-loaded members list instead.
  const memberName = mid => (members || []).find(m => String(m.id) === String(mid))?.name || mid

  // Stock Return / Stock Delivered / Delivery Pending — splits each order's full value by its
  // delivery outcome, same math as stockReport.js's flattenSales / achievementEngine.js's Value
  // gating (already verified to reconcile against the Stock & Sales Report). A 'partial' order
  // contributes to BOTH Delivered (its net-of-return portion) and Return (its returned portion) —
  // by design, since it genuinely has some of each; the three "orders" counts below therefore don't
  // sum back to Total Orders, that's expected, not a bug. 'not_delivered' counts its whole value as
  // Return (nothing reached the outlet, so all of it effectively came back); 'pending'/unset counts
  // its whole value as Pending (delivery outcome not yet marked at all).
  const deliveryBreakdown = orders => {
    const b = { returnCount: 0, returnValue: 0, deliveredCount: 0, deliveredValue: 0, pendingCount: 0, pendingValue: 0 }
    orders.forEach(o => {
      const returnedByItem = {}
      ;(o.delivery?.delivery_items || []).forEach(di => { returnedByItem[di.order_item_id] = Number(di.returned_qty) || 0 })
      const orderValue = (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
      const status = o.delivery_status || 'pending'
      if (status === 'full') {
        b.deliveredCount += 1; b.deliveredValue += orderValue
      } else if (status === 'partial') {
        const returnedValue = (o.items || []).reduce((s, it) => s + Math.min(Number(it.qty) || 0, returnedByItem[it.id] || 0) * (Number(it.rate) || 0), 0)
        b.deliveredCount += 1; b.deliveredValue += orderValue - returnedValue
        b.returnCount += 1; b.returnValue += returnedValue
      } else if (status === 'not_delivered') {
        b.returnCount += 1; b.returnValue += orderValue
      } else {
        b.pendingCount += 1; b.pendingValue += orderValue
      }
    })
    return { returnCount: b.returnCount, returnValue: round0(b.returnValue), deliveredCount: b.deliveredCount, deliveredValue: round0(b.deliveredValue), pendingCount: b.pendingCount, pendingValue: round0(b.pendingValue) }
  }

  // Count of item LINES across every order in a group — not a sum of quantities, which would add
  // together different products' different units (Litres + Units + Pieces) into a meaningless
  // decimal figure (caught live: "132.05" for a mixed-unit batch). Shared by both groupings below so
  // Summary and Detail can never drift on how a total is computed, only on what they group by.
  const rollupGroup = g => ({
    ...g,
    totalOrders: g.orders.length,
    totalItems: g.orders.reduce((s, o) => s + (o.items || []).length, 0),
    totalValue: round0(g.orders.reduce((s, o) => s + (o.items || []).reduce((s2, it) => s2 + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0), 0)),
    orderDateLabel: dateRangeLabel(g.orders, o => o.order_date),
    confirmDateLabel: dateRangeLabel(g.orders, o => o.delivery?.delivered_date),
    ...deliveryBreakdown(g.orders),
  })

  // Detail tab: one row per batch × distributor × beat (× rep) — a batch is one Retailing Complete
  // run, the natural "how this got booked" unit, unaffected by dateBasis (a batch stays a batch
  // regardless of which date lens is active). Row click drills to that batch's own order-no-wise
  // list (drillGroup Sheet below) -> full order detail. Sort always by the batch's own order_date —
  // a batch's natural "when did this happen" identity, independent of dateBasis.
  const batchGroups = {}
  filtered.forEach(o => {
    const key = multiRep ? `${o.batch_id}|${o.distributor_id}|${o.beat_id}|${o.member_id}` : `${o.batch_id}|${o.distributor_id}|${o.beat_id}`
    if (!batchGroups[key]) batchGroups[key] = { batchId: o.batch_id, distributorId: o.distributor_id, distributorName: o.distributor?.name || o.distributor_id, beatName: o.beat?.name || o.beat_id, memberName: memberName(o.member_id), date: o.order_date, orders: [] }
    batchGroups[key].orders.push(o)
  })
  const detailRows = Object.values(batchGroups).map(rollupGroup).sort((a, b) => new Date(b.date) - new Date(a.date))

  // Summary tab: same rollup, one level coarser — dateBasis's own date × distributor × beat (× rep),
  // collapsing every batch sharing that date into one row. A distributor+beat visited twice in one
  // day (two separate Retailing Complete runs) previously showed as two Summary rows purely because
  // of a technical batch boundary the business doesn't care about at this level; that detail still
  // lives one tab over, in Detail. Orders with no value at all for the active basis (e.g.
  // Confirmation Date on a still-pending order) have already been dropped by `filtered` above when
  // basis is 'confirm' — every order reaching this grouping has a real value to key on.
  const dateGroups = {}
  filtered.forEach(o => {
    const basisDate = dateBasis === 'order' ? o.order_date : o.delivery?.delivered_date
    const key = multiRep ? `${basisDate}|${o.distributor_id}|${o.beat_id}|${o.member_id}` : `${basisDate}|${o.distributor_id}|${o.beat_id}`
    if (!dateGroups[key]) dateGroups[key] = { distributorId: o.distributor_id, distributorName: o.distributor?.name || o.distributor_id, beatName: o.beat?.name || o.beat_id, memberName: memberName(o.member_id), date: basisDate, orders: [] }
    dateGroups[key].orders.push(o)
  })
  const summaryRows = Object.values(dateGroups).map(rollupGroup).sort((a, b) => new Date(b.date) - new Date(a.date))

  const orderDateHeader = dateBasis === 'order' ? 'Order Date (Filter Basis)' : 'Order Date (Reference)'
  const confirmDateHeader = dateBasis === 'confirm' ? 'Confirmation Date (Filter Basis)' : 'Confirmation Date (Reference)'
  const summaryColumns = [
    { header: orderDateHeader, key: 'orderDateLabel' }, { header: confirmDateHeader, key: 'confirmDateLabel' },
    { header: 'Distributor', key: 'distributorName' }, { header: 'Beat', key: 'beatName' },
    ...(multiRep ? [{ header: 'Sales Rep', key: 'memberName' }] : []),
    { header: 'Total Orders', key: 'totalOrders' }, { header: 'Total Items', key: 'totalItems' },
    { header: 'Total Value', key: 'totalValue' },
    { header: 'Stock Return — Orders', key: 'returnCount' }, { header: 'Stock Return — Value', key: 'returnValue' },
    { header: 'Stock Delivered — Orders', key: 'deliveredCount' }, { header: 'Stock Delivered — Value', key: 'deliveredValue' },
    { header: 'Delivery Pending — Orders', key: 'pendingCount' }, { header: 'Delivery Pending — Value', key: 'pendingValue' },
  ]
  const detailColumns = [
    { header: orderDateHeader, key: 'orderDateLabel' }, { header: confirmDateHeader, key: 'confirmDateLabel' },
    { header: 'Batch ID', key: 'batchId' },
    { header: 'Distributor', key: 'distributorName' }, { header: 'Beat', key: 'beatName' },
    ...(multiRep ? [{ header: 'Sales Rep', key: 'memberName' }] : []),
    { header: 'Total Orders', key: 'totalOrders' }, { header: 'Total Items', key: 'totalItems' },
    { header: 'Total Value', key: 'totalValue' },
    { header: 'Stock Return — Orders', key: 'returnCount' }, { header: 'Stock Return — Value', key: 'returnValue' },
    { header: 'Stock Delivered — Orders', key: 'deliveredCount' }, { header: 'Stock Delivered — Value', key: 'deliveredValue' },
    { header: 'Delivery Pending — Orders', key: 'pendingCount' }, { header: 'Delivery Pending — Value', key: 'pendingValue' },
  ]

  // Carries this report's own current filter state (including which tab was active) as the Return
  // Report's backTo.params, so its Back button lands here restored exactly as it was, not reset to
  // defaults — same chaining convention as BackTo's own doc comment (this report's own
  // navParams?.backTo, if any, rides along nested inside so a multi-hop drill can walk all the way
  // back). from/to are this report's own active range (the "parent report's filter"), not narrowed
  // to a single row's date — a row's date field isn't reliable as a filter value on its own (batches
  // are assumed single-day, but hand-entered/edge-case data can violate that), and every other
  // cross-report drill in this app already inherits the parent's real active range rather than
  // synthesizing a narrower one from whatever row was clicked.
  const goToReturnReport = g => onNavigate?.('secondaryReturnReport', {
    distributorId: g.distributorId, from, to, dateBasis,
    backTo: { id: 'distributorSecondaryReport', label: 'Distributor Secondary Report', params: { from, to, distributorId, locked, tab, dateBasis, backTo: navParams?.backTo } },
  })

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
      <BackTo backTo={navParams?.backTo} onNavigate={onNavigate} />
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
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Filter By</div>
            <select value={dateBasis} onChange={e => setDateBasis(e.target.value)} style={selStyle}>
              <option value="order">Order Date</option>
              <option value="confirm">Confirmation Date</option>
            </select>
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
          <CH title="Summary" sub={`${summaryRows.length} date × distributor × beat group(s)`} />
          {summaryRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No completed batches in this range</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1350 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {summaryColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((g, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: dateBasis === 'order' ? 700 : 400 }}>{g.orderDateLabel}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: dateBasis === 'confirm' ? 700 : 400 }}>{g.confirmDateLabel}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{g.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.beatName}</td>
                    {multiRep && <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.memberName}</td>}
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.totalOrders}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.totalItems}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{F(g.totalValue)}</td>
                    <td onClick={() => goToReturnReport(g)} title="View these returned orders — Secondary Return Report" style={{ padding: '8px 10px', fontSize: 12, color: '#b91c1c', cursor: 'pointer' }}>{g.returnCount}</td>
                    <td onClick={() => goToReturnReport(g)} title="View these returned orders — Secondary Return Report" style={{ padding: '8px 10px', fontSize: 12, color: '#b91c1c', cursor: 'pointer' }}>{F(g.returnValue)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#15803d' }}>{g.deliveredCount}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#15803d' }}>{F(g.deliveredValue)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#b45309' }}>{g.pendingCount}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#b45309' }}>{F(g.pendingValue)}</td>
                  </tr>
                ))}
              </tbody>
              {summaryRows.length > 0 && (() => {
                const sum = key => summaryRows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
                return (
                  <tfoot>
                    <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }} colSpan={multiRep ? 5 : 4}>Total</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{sum('totalOrders')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{sum('totalItems')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{F(sum('totalValue'))}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>{sum('returnCount')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>{F(sum('returnValue'))}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#15803d' }}>{sum('deliveredCount')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#15803d' }}>{F(sum('deliveredValue'))}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b45309' }}>{sum('pendingCount')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b45309' }}>{F(sum('pendingValue'))}</td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>
        </Card>
      )}

      {orders !== null && tab === 'detail' && (
        <Card>
          <CH title="Detail" sub={`${detailRows.length} batch × distributor × beat group(s) — tap a row for its orders`} />
          {detailRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No completed batches in this range</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1450 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {detailColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((g, i) => (
                  <tr key={i} onClick={() => setDrillGroup(g)} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: dateBasis === 'order' ? 700 : 400 }}>{g.orderDateLabel}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: dateBasis === 'confirm' ? 700 : 400 }}>{g.confirmDateLabel}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.batchId}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{g.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.beatName}</td>
                    {multiRep && <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.memberName}</td>}
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.totalOrders}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.totalItems}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{F(g.totalValue)}</td>
                    <td onClick={e => { e.stopPropagation(); goToReturnReport(g) }} title="View these returned orders — Secondary Return Report" style={{ padding: '8px 10px', fontSize: 12, color: '#b91c1c', cursor: 'pointer' }}>{g.returnCount}</td>
                    <td onClick={e => { e.stopPropagation(); goToReturnReport(g) }} title="View these returned orders — Secondary Return Report" style={{ padding: '8px 10px', fontSize: 12, color: '#b91c1c', cursor: 'pointer' }}>{F(g.returnValue)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#15803d' }}>{g.deliveredCount}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#15803d' }}>{F(g.deliveredValue)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#b45309' }}>{g.pendingCount}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#b45309' }}>{F(g.pendingValue)}</td>
                  </tr>
                ))}
              </tbody>
              {detailRows.length > 0 && (() => {
                const sum = key => detailRows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
                return (
                  <tfoot>
                    <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }} colSpan={multiRep ? 6 : 5}>Total</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{sum('totalOrders')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{sum('totalItems')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{F(sum('totalValue'))}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>{sum('returnCount')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>{F(sum('returnValue'))}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#15803d' }}>{sum('deliveredCount')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#15803d' }}>{F(sum('deliveredValue'))}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b45309' }}>{sum('pendingCount')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b45309' }}>{F(sum('pendingValue'))}</td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>
        </Card>
      )}

      {drillGroup && (
        <Sheet title={`${drillGroup.distributorName} — ${drillGroup.beatName}`} sub={`Batch ${drillGroup.batchId}`} onClose={() => setDrillGroup(null)}>
          {drillGroup.orders.map(o => {
            const value = round0((o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0))
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
