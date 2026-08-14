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
const round2 = n => Math.round((Number(n) || 0) * 100) / 100
// Same helper as DistributorSecondaryReport.jsx's own — collapses a group's date field to its single
// shared value, a compact range when the group's orders disagree, or a dash when none have it.
const dateRangeLabel = (orders, field) => {
  const dates = [...new Set(orders.map(field).filter(Boolean))].sort()
  if (dates.length === 0) return '—'
  if (dates.length === 1) return dates[0]
  return `${dates[0]} – ${dates[dates.length - 1]}`
}

// Return-only counterpart to DistributorSecondaryReport.jsx — same shape (Summary batch-rollup +
// Detail itemwise, same 3-way audience/filters/export), but scoped to only what came back: a
// 'not_delivered' order returns every item in full (no delivery_item rows exist for it — "0
// returned / fully returned is implicit, not stored", same convention documented for
// SecondaryOrderDetailSheet.jsx); a 'partial' order returns only whichever lines actually have a
// delivery_item row with returned_qty > 0. 'full' and still-'pending' orders never appear here —
// nothing came back from a full delivery, and a not-yet-actioned order has no return to report yet.
// Same delivered/returned split math as DistributorSecondaryReport.jsx's own deliveryBreakdown and
// stockReport.js's flattenSales — verified to reconcile with both.
export default function SecondaryReturnReport({ navParams, onNavigate }) {
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
  const [distributorId, setDistributorId] = useState(navParams?.distributorId || '')
  const [beatId, setBeatId] = useState('')
  const [repId, setRepId] = useState('')
  // Which date governs the From/To range — the other one just rides along as a reference column.
  // Same convention as DistributorSecondaryReport.jsx's own dateBasis; 'order' matches every existing
  // entry point's current behavior unless a caller explicitly opts into 'confirm'.
  const [dateBasis, setDateBasis] = useState(navParams?.dateBasis || 'order')

  const [orders, setOrders] = useState(null)
  const [tab, setTab] = useState('summary')
  const [drillGroup, setDrillGroup] = useState(null)
  const [viewOrder, setViewOrder] = useState(null)

  const effectiveMemberIds = repId ? [repId] : scopeMemberIds

  // Order Date basis narrows the fetch server-side (order_date, cheap, unchanged from before).
  // Confirmation Date basis fetches unbounded instead (delivered_date lives on the embedded delivery
  // row, not secondary_orders itself, so it can't be pushed into the same SQL filter) and the range
  // is applied below against o.delivery?.delivered_date — same "fetch wide, filter client-side"
  // convention this app already uses for Stock & Sales Report.
  const load = async () => {
    setOrders(null)
    const { data } = await db.fetchSecondaryOrdersForReport({
      memberIds: effectiveMemberIds, ...(dateBasis === 'order' ? { from, to } : {}),
    })
    setOrders(data || [])
  }
  useEffect(() => { load() }, [from, to, repId, dateBasis]) // eslint-disable-line react-hooks/exhaustive-deps

  const inConfirmRange = o => {
    const d = o.delivery?.delivered_date
    if (!d) return false
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }

  // Only orders that actually have SOME return — 'partial' or 'not_delivered'. 'full' and 'pending'
  // orders are dropped entirely before grouping, same "scope, not just a zeroed-out row" convention
  // as the Discrepancy Report's own closing-stock-only table.
  const returnable = (orders || []).filter(o => ['partial', 'not_delivered'].includes(o.delivery_status))

  const distributorOptions = uniqById(returnable.map(o => o.distributor))
  const beatOptions = uniqById(returnable.map(o => o.beat))

  const filtered = returnable.filter(o =>
    (!distributorId || o.distributor_id === distributorId) && (!beatId || o.beat_id === beatId) &&
    (dateBasis === 'order' || inConfirmRange(o))
  )

  const memberName = mid => (members || []).find(m => String(m.id) === String(mid))?.name || mid

  // Per order: which items actually returned, and how much. 'not_delivered' → every item, full qty
  // (nothing reached the outlet). 'partial' → only items with a delivery_item row, capped at ordered
  // qty (defensive against a stray return row exceeding what was ever ordered).
  const returnedItemsFor = o => {
    if (o.delivery_status === 'not_delivered') {
      return (o.items || []).map(it => ({ item: it, returnedQty: Number(it.qty) || 0 }))
    }
    const returnedByItem = {}
    ;(o.delivery?.delivery_items || []).forEach(di => { returnedByItem[di.order_item_id] = Number(di.returned_qty) || 0 })
    return (o.items || [])
      .map(it => ({ item: it, returnedQty: Math.min(Number(it.qty) || 0, returnedByItem[it.id] || 0) }))
      .filter(r => r.returnedQty > 0)
  }

  const groups = {}
  filtered.forEach(o => {
    const key = multiRep ? `${o.batch_id}|${o.distributor_id}|${o.beat_id}|${o.member_id}` : `${o.batch_id}|${o.distributor_id}|${o.beat_id}`
    if (!groups[key]) groups[key] = { batchId: o.batch_id, distributorName: o.distributor?.name || o.distributor_id, beatName: o.beat?.name || o.beat_id, memberName: memberName(o.member_id), date: o.order_date, orders: [] }
    groups[key].orders.push(o)
  })
  const summaryRows = Object.values(groups).map(g => {
    let returnItems = 0
    let returnValue = 0
    g.orders.forEach(o => {
      returnedItemsFor(o).forEach(({ item, returnedQty }) => {
        returnItems += 1
        returnValue += returnedQty * (Number(item.rate) || 0)
      })
    })
    return {
      ...g, returnOrders: g.orders.length, returnItems, returnValue,
      orderDateLabel: dateRangeLabel(g.orders, o => o.order_date),
      confirmDateLabel: dateRangeLabel(g.orders, o => o.delivery?.delivered_date),
    }
  }).sort((a, b) => new Date(b.date) - new Date(a.date))

  // Detail is itemwise — one row per actually-returned line, i.e. always exactly one order — so
  // unlike Summary's batch rollup, both dates are single real values here, never a range.
  const detailRows = filtered.flatMap(o => returnedItemsFor(o).map(({ item, returnedQty }) => ({
    date: o.order_date, orderDate: o.order_date, confirmDate: o.delivery?.delivered_date || '—',
    batchId: o.batch_id, distributorName: o.distributor?.name || o.distributor_id,
    beatName: o.beat?.name || o.beat_id, memberName: memberName(o.member_id),
    orderId: o.id, outlet: o.outlet?.name || o.outlet_id, product: item.product?.name || item.product_id,
    orderedQty: round2(item.qty), returnedQty: round2(returnedQty), rate: item.rate, value: returnedQty * (Number(item.rate) || 0),
    reason: o.delivery_status === 'not_delivered' ? 'Not Delivered' : 'Partial Return',
  })))

  const orderDateHeader = dateBasis === 'order' ? 'Order Date (Filter Basis)' : 'Order Date (Reference)'
  const confirmDateHeader = dateBasis === 'confirm' ? 'Confirmation Date (Filter Basis)' : 'Confirmation Date (Reference)'
  const summaryColumns = [
    { header: orderDateHeader, key: 'orderDateLabel' }, { header: confirmDateHeader, key: 'confirmDateLabel' },
    { header: 'Batch ID', key: 'batchId' },
    { header: 'Distributor', key: 'distributorName' }, { header: 'Beat', key: 'beatName' },
    ...(multiRep ? [{ header: 'Sales Rep', key: 'memberName' }] : []),
    { header: 'Return Orders', key: 'returnOrders' }, { header: 'Return Items', key: 'returnItems' },
    { header: 'Return Value', key: 'returnValue' },
  ]
  const detailColumns = [
    { header: orderDateHeader, key: 'orderDate' }, { header: confirmDateHeader, key: 'confirmDate' },
    { header: 'Batch ID', key: 'batchId' },
    { header: 'Distributor', key: 'distributorName' }, { header: 'Beat', key: 'beatName' },
    ...(multiRep ? [{ header: 'Sales Rep', key: 'memberName' }] : []),
    { header: 'Order No', key: 'orderId' }, { header: 'Outlet', key: 'outlet' },
    { header: 'Product', key: 'product' }, { header: 'Ordered Qty', key: 'orderedQty' },
    { header: 'Returned Qty', key: 'returnedQty' }, { header: 'Rate', key: 'rate' },
    { header: 'Return Value', key: 'value' }, { header: 'Reason', key: 'reason' },
  ]

  const activeColumns = tab === 'summary' ? summaryColumns : detailColumns
  const activeRows = tab === 'summary' ? summaryRows : detailRows
  const rangeLabel = `${from}_to_${to}`

  const exportPdf = () => downloadReportPdf({
    filename: `ReturnReport-${tab === 'summary' ? 'Summary' : 'Detail'}-${rangeLabel}.pdf`,
    title: `Distributor Secondary — Return ${tab === 'summary' ? 'Summary' : 'Detail'} Report`,
    sub: `${from} to ${to}`,
    columns: activeColumns, rows: activeRows,
  })
  const exportExcel = () => downloadReportExcel({
    filename: `ReturnReport-${tab === 'summary' ? 'Summary' : 'Detail'}-${rangeLabel}.xlsx`,
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
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={selStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>To</div>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={selStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Filter By</div>
            <select value={dateBasis} onChange={e => setDateBasis(e.target.value)} style={selStyle}>
              <option value="order">Order Date</option>
              <option value="confirm">Confirmation Date</option>
            </select>
          </div>
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
          <CH title="Summary" sub={`${summaryRows.length} batch × distributor × beat group(s) with a return`} />
          {summaryRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No returns in this range</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {summaryColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((g, i) => (
                  <tr key={i} onClick={() => setDrillGroup(g)} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: dateBasis === 'order' ? 700 : 400 }}>{g.orderDateLabel}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: dateBasis === 'confirm' ? 700 : 400 }}>{g.confirmDateLabel}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.batchId}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{g.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.beatName}</td>
                    {multiRep && <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.memberName}</td>}
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.returnOrders}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{g.returnItems}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>{F(g.returnValue)}</td>
                  </tr>
                ))}
              </tbody>
              {summaryRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }} colSpan={multiRep ? 6 : 5}>Total</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{summaryRows.reduce((s, r) => s + r.returnOrders, 0)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{summaryRows.reduce((s, r) => s + r.returnItems, 0)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>{F(summaryRows.reduce((s, r) => s + r.returnValue, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {orders !== null && tab === 'detail' && (
        <Card>
          <CH title="Detail" sub={`${detailRows.length} returned item row(s)`} />
          {detailRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No returned items in this range</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1150 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {detailColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: dateBasis === 'order' ? 700 : 400 }}>{r.orderDate}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: dateBasis === 'confirm' ? 700 : 400 }}>{r.confirmDate}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.batchId}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.beatName}</td>
                    {multiRep && <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.memberName}</td>}
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.orderId}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.outlet}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{r.product}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.orderedQty}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#b91c1c' }}>{r.returnedQty}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{F(r.rate)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>{F(r.value)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
              {detailRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }} colSpan={multiRep ? 10 : 9}>Total</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>{F(detailRows.reduce((s, r) => s + (Number(r.value) || 0), 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {drillGroup && (
        <Sheet title={`${drillGroup.distributorName} — ${drillGroup.beatName}`} sub={`Batch ${drillGroup.batchId} · returns only`} onClose={() => setDrillGroup(null)}>
          {drillGroup.orders.map(o => {
            const items = returnedItemsFor(o)
            const value = items.reduce((s, { item, returnedQty }) => s + returnedQty * (Number(item.rate) || 0), 0)
            return (
              <div key={o.id} onClick={() => setViewOrder(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{o.id}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.outlet?.name || o.outlet_id} · {items.length} item(s) returned · {o.delivery_status === 'not_delivered' ? 'Not Delivered' : 'Partial Return'}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>{F(value)}</div>
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
