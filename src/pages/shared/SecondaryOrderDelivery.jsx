import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Tile, Btn, Sheet, F } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { localDateStr } from '../../lib/period.js'
import SecondaryOrderDetailSheet from '../../components/SecondaryOrderDetailSheet.jsx'

const orderValue = o => (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
const round2 = n => Math.round((Number(n) || 0) * 100) / 100
const today = () => localDateStr(new Date())
// A batch/sheet can list several orders — the delivery date shared across whatever action is taken
// there must be valid for every one of them, so the real floor is the LATEST of their order_dates
// (valid for that order is automatically valid for every earlier one too).
const minDeliveredDateFor = orders => (orders || []).reduce((max, o) => (o.order_date > max ? o.order_date : max), orders?.[0]?.order_date || '')
// Local calendar day after a 'YYYY-MM-DD' string — local date parts, not toISOString() (see
// CLAUDE.md's IST-boundary bug pattern), so this can't land on the wrong day near midnight IST.
const dayAfter = dateStr => {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return localDateStr(d)
}

// Individual (Sales Team, r5): their own pending-delivery batches, with the actual mark-delivered
// actions. Manager (r2)/Admin (r1): read-only team/org rollup, drilling rep → batch → order detail,
// no action buttons — only the rep who took the order marks its delivery (see CLAUDE.md's Order
// Delivery module for why). "No age limit" scope: fetchSecondaryOrdersForReport is called without a
// date range, matching this module's chosen definition of "pending" (locked, not cancelled, not yet
// delivered — forever, until acted on).
export default function SecondaryOrderDelivery() {
  const { currentUser, role } = useAuth()
  const { members, users, showToast } = useData()

  const isOwnView = role?.id === 'r5'
  const multiRep = !isOwnView
  const salesTeamMemberIds = new Set((users || []).filter(u => u.role_id === 'r5' && u.member_id != null).map(u => u.member_id))
  const scopeMembers = isOwnView
    ? (members || []).filter(m => m.id === currentUser?.member_id)
    : role?.id === 'r2'
      ? (members || []).filter(m => salesTeamMemberIds.has(m.id) && String(m.manager_id || '') === String(currentUser?.id))
      : (members || []).filter(m => salesTeamMemberIds.has(m.id)) // r1 Admin — every Sales Team member
  const scopeMemberIds = scopeMembers.map(m => m.id)
  const memberName = mid => (members || []).find(m => String(m.id) === String(mid))?.name || mid

  const [orders, setOrders] = useState(null)
  const [drillMemberId, setDrillMemberId] = useState(null)     // Manager/Admin only — rep-wise drill
  const [processBatch, setProcessBatch] = useState(null)       // r5 only — batch chosen for the bulk Full/Partial/Not-Delivered sheet
  const [orderDrillBatch, setOrderDrillBatch] = useState(null) // batch opened to review its individual orders (r5: after "Partial"; Manager/Admin: always, read-only)
  const [partialOrder, setPartialOrder] = useState(null)       // r5 only — order currently getting item-level return qty entered
  const [partialItems, setPartialItems] = useState({})         // order_item_id -> returned_qty, while partialOrder is open
  const [viewOrder, setViewOrder] = useState(null)             // any role — read-only detail sheet
  const [busy, setBusy] = useState(false)
  const [deliveredDate, setDeliveredDate] = useState(today())  // r5 only — shared by whichever action sheet is currently open, reset to today whenever one opens
  const [latestTakeDateByDistributor, setLatestTakeDateByDistributor] = useState({})

  const load = async () => {
    if (!scopeMemberIds.length) { setOrders([]); return }
    const { data } = await db.fetchSecondaryOrdersForReport({ memberIds: scopeMemberIds })
    const ords = data || []
    setOrders(ords)
    // A Discrepancy Report is already a frozen snapshot as of each distributor's last physical stock
    // take — a delivery back-dated to on or before that date would silently invalidate it (the
    // report's Calculated Closing wouldn't reflect a sale that, per the ledger, actually happened
    // before that snapshot was taken). Fetched per distributor actually appearing in this rep's
    // orders, not the whole scope, to keep this cheap.
    const distributorIds = Array.from(new Set(ords.map(o => o.distributor_id)))
    if (distributorIds.length) {
      const { data: takes } = await db.fetchStockTakesForDistributors({ distributorIds })
      const latest = {}
      ;(takes || []).forEach(t => { latest[t.distributor_id] = t.take_date }) // ascending order — last write wins = latest
      setLatestTakeDateByDistributor(latest)
    } else {
      setLatestTakeDateByDistributor({})
    }
  }
  useEffect(() => { load() }, [scopeMemberIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Combines both floors: the batch/order's own date, and (if this distributor has ever had a
  // physical stock take) the day right after the latest one — "cannot be on or before" the last
  // take date, enforced as a hard min, not a soft warning.
  const effectiveMinDate = orders => {
    const orderFloor = minDeliveredDateFor(orders)
    const distributorId = orders?.[0]?.distributor_id
    const lastTake = distributorId ? latestTakeDateByDistributor[distributorId] : null
    if (!lastTake) return orderFloor
    const takeFloor = dayAfter(lastTake)
    return takeFloor > orderFloor ? takeFloor : orderFloor
  }
  const minDateReason = (orders, minDate) => {
    const distributorId = orders?.[0]?.distributor_id
    const lastTake = distributorId ? latestTakeDateByDistributor[distributorId] : null
    if (lastTake && minDate === dayAfter(lastTake)) return `a discrepancy report already exists for the period ending ${lastTake} — pick a later date`
    return `the order date (${minDate})`
  }

  const pendingOrders = (orders || []).filter(o => (o.delivery_status || 'pending') === 'pending')
  const pendingCount = pendingOrders.length
  const pendingValue = pendingOrders.reduce((s, o) => s + orderValue(o), 0)

  // Rep-wise rollup, Manager/Admin only
  const repRollup = {}
  pendingOrders.forEach(o => {
    if (!repRollup[o.member_id]) repRollup[o.member_id] = { memberId: o.member_id, count: 0, value: 0 }
    repRollup[o.member_id].count += 1
    repRollup[o.member_id].value += orderValue(o)
  })
  const repRows = Object.values(repRollup).sort((a, b) => b.value - a.value)

  // Batches (grouped by batch_id, i.e. one Retailing Complete run) among currently-pending orders —
  // either the rep's own actionable list, or (drillMemberId set) a read-only view of one rep's.
  const batchSourceOrders = isOwnView ? pendingOrders : pendingOrders.filter(o => o.member_id === drillMemberId)
  const batchGroups = {}
  batchSourceOrders.forEach(o => {
    if (!batchGroups[o.batch_id]) batchGroups[o.batch_id] = { batchId: o.batch_id, date: o.order_date, orders: [] }
    batchGroups[o.batch_id].orders.push(o)
  })
  const batchRows = Object.values(batchGroups).map(b => ({
    ...b, count: b.orders.length, value: b.orders.reduce((s, o) => s + orderValue(o), 0),
  })).sort((a, b) => new Date(b.date) - new Date(a.date))

  async function runBulk(orderIds, batchId, status, { closeBatchSheets = true } = {}) {
    setBusy(true)
    const { error } = await db.markOrdersDelivered({ orderIds, batchId, status, memberId: currentUser?.member_id, deliveredDate })
    setBusy(false)
    if (error) { showToast('Failed: ' + error.message); return }
    if (closeBatchSheets) {
      setProcessBatch(null)
      setOrderDrillBatch(null)
    } else {
      // orderDrillBatch is a snapshot taken when the sheet opened, not a live view — drop the
      // just-processed orders from it locally so it doesn't keep showing them as still-pending until
      // the background load() below catches up, and close it outright once nothing pending is left.
      setOrderDrillBatch(prev => {
        if (!prev) return prev
        const remaining = prev.orders.filter(o => !orderIds.includes(o.id))
        return remaining.length ? { ...prev, orders: remaining, count: remaining.length } : null
      })
    }
    showToast(status === 'full' ? 'Marked delivered' : 'Marked not delivered')
    load()
  }

  async function savePartial() {
    if (!partialOrder) return
    setBusy(true)
    const items = (partialOrder.items || []).map(it => ({ order_item_id: it.id, returned_qty: Number(partialItems[it.id]) || 0 }))
    const { error } = await db.markOrderPartiallyDelivered({
      orderId: partialOrder.id, batchId: partialOrder.batch_id, memberId: currentUser?.member_id, items, deliveredDate,
    })
    setBusy(false)
    const orderId = partialOrder.id
    setPartialOrder(null)
    setPartialItems({})
    if (error) { showToast('Failed: ' + error.message); return }
    // Same staleness fix as runBulk's non-closing branch — drop the now-resolved order from the
    // still-open order-drill sheet's local snapshot.
    setOrderDrillBatch(prev => {
      if (!prev) return prev
      const remaining = prev.orders.filter(o => o.id !== orderId)
      return remaining.length ? { ...prev, orders: remaining, count: remaining.length } : null
    })
    showToast('Partial delivery recorded')
    load()
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Tile icon="📦" label="Pending Deliveries" value={pendingCount} color="#b45309" />
        <Tile icon="💰" label="Pending Value" value={F(pendingValue)} color="#b45309" />
      </div>

      {orders === null && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>}

      {orders !== null && multiRep && !drillMemberId && (
        <Card>
          <CH title="By Sales Rep" sub={`${repRows.length} rep(s) with pending deliveries`} />
          {repRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Nothing pending — every order is delivered or accounted for 🎉</div>}
          {repRows.map(r => (
            <div key={r.memberId} onClick={() => setDrillMemberId(r.memberId)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{memberName(r.memberId)}</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{F(r.value)}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.count} order(s)</div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {orders !== null && (isOwnView || drillMemberId) && (
        <Card>
          <CH
            title={isOwnView ? 'Pending Batches' : `${memberName(drillMemberId)} — Pending Batches`}
            sub={`${batchRows.length} batch(es)`}
            right={!isOwnView && <Btn sm onClick={() => setDrillMemberId(null)}>← Back</Btn>}
          />
          {batchRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Nothing pending here 🎉</div>}
          {batchRows.map(b => (
            <div key={b.batchId} onClick={() => { if (isOwnView) { setProcessBatch(b); setDeliveredDate(today()) } else setOrderDrillBatch(b) }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{b.batchId}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{b.date} · {b.count} order(s)</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{F(b.value)}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Batch-level bulk action — the fast path: one tap covers every still-pending order in the
          batch. Only "Partial" needs to drop into the per-order list below. */}
      {processBatch && (() => {
        const minDate = effectiveMinDate(processBatch.orders)
        const dateInvalid = deliveredDate < minDate
        return (
          <Sheet title={processBatch.batchId} sub={`${processBatch.count} order(s) · ${F(processBatch.value)}`} onClose={() => setProcessBatch(null)}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
              Applies to every pending order in this batch. If some orders weren't delivered exactly as
              ordered, use "Partial — Review Orders" to go order by order instead.
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Delivered On</div>
              <input type="date" min={minDate} value={deliveredDate} onChange={e => setDeliveredDate(e.target.value)}
                style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
              {dateInvalid && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>Can't be before {minDateReason(processBatch.orders, minDate)}</div>}
            </div>
            <Btn v="pri" full disabled={busy || dateInvalid} onClick={() => runBulk(processBatch.orders.map(o => o.id), processBatch.batchId, 'full')} style={{ marginBottom: 8 }}>
              ✅ Mark All Fully Delivered
            </Btn>
            <Btn full disabled={busy} onClick={() => { setOrderDrillBatch(processBatch); setProcessBatch(null) }} style={{ marginBottom: 8 }}>
              ⚠️ Partial — Review Orders
            </Btn>
            <Btn v="bad" full disabled={busy || dateInvalid} onClick={() => runBulk(processBatch.orders.map(o => o.id), processBatch.batchId, 'not_delivered')}>
              ❌ Mark All Not Delivered
            </Btn>
          </Sheet>
        )
      })()}

      {/* Per-order list within a batch — r5: Full/Not Delivered fire immediately, Partial opens the
          item-qty sheet below. Manager/Admin: read-only, opens the shared detail sheet instead. */}
      {orderDrillBatch && (() => {
        const minDate = effectiveMinDate(orderDrillBatch.orders)
        const dateInvalid = deliveredDate < minDate
        return (
          <Sheet title={orderDrillBatch.batchId} sub={`${orderDrillBatch.count} order(s)`} onClose={() => setOrderDrillBatch(null)} zIndex={310}>
            {isOwnView && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Delivered On (applies to Full/Not Delivered below)</div>
                <input type="date" min={minDate} value={deliveredDate} onChange={e => setDeliveredDate(e.target.value)}
                  style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                {dateInvalid && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>Can't be before {minDateReason(orderDrillBatch.orders, minDate)}</div>}
              </div>
            )}
            {orderDrillBatch.orders.map(o => (
              <div key={o.id} style={{ padding: '10px 4px', borderBottom: '1px solid #f3f4f6' }}>
                <div onClick={() => !isOwnView && setViewOrder(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: isOwnView ? 'default' : 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{o.id}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.outlet?.name || o.outlet_id}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{F(orderValue(o))}</div>
                </div>
                {isOwnView && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <Btn sm v="pri" disabled={busy || dateInvalid} onClick={() => runBulk([o.id], o.batch_id, 'full', { closeBatchSheets: false })}>Full</Btn>
                    <Btn sm disabled={busy} onClick={() => { setPartialOrder(o); setPartialItems({}); setDeliveredDate(today()) }}>Partial</Btn>
                    <Btn sm v="bad" disabled={busy || dateInvalid} onClick={() => runBulk([o.id], o.batch_id, 'not_delivered', { closeBatchSheets: false })}>Not Delivered</Btn>
                  </div>
                )}
              </div>
            ))}
          </Sheet>
        )
      })()}

      {/* Item-level return qty entry for one order marked Partial */}
      {partialOrder && (() => {
        const minDate = effectiveMinDate([partialOrder])
        const dateInvalid = deliveredDate < minDate
        return (
          <Sheet title={partialOrder.id} sub="Enter returned qty per product (leave 0 for fully delivered items)" onClose={() => { setPartialOrder(null); setPartialItems({}) }} zIndex={320}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Delivered On</div>
              <input type="date" min={minDate} value={deliveredDate} onChange={e => setDeliveredDate(e.target.value)}
                style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
              {dateInvalid && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>Can't be before {minDateReason([partialOrder], minDate)}</div>}
            </div>
            {(partialOrder.items || []).map(it => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 13 }}>{it.product?.name || it.product_id} <span style={{ color: '#9ca3af' }}>(ordered {round2(it.qty)})</span></div>
                <input
                  type="number" min={0} max={it.qty} step="any"
                  value={partialItems[it.id] ?? ''}
                  onChange={e => setPartialItems(p => ({ ...p, [it.id]: e.target.value }))}
                  placeholder="0"
                  style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
              </div>
            ))}
            <Btn v="pri" full disabled={busy || dateInvalid} onClick={savePartial} style={{ marginTop: 12 }}>Save Partial Delivery</Btn>
          </Sheet>
        )
      })()}

      {viewOrder && <SecondaryOrderDetailSheet order={viewOrder} onClose={() => setViewOrder(null)} zIndex={330} />}
    </div>
  )
}
