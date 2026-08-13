import { useState, useEffect } from 'react'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, F } from '../../components/ui.jsx'
import { availableUnitsForProduct, toBaseQty } from '../../lib/unitConversion.js'
import { haversineMeters } from '../../lib/geo.js'
import { computeStockTakePeriods } from '../../lib/stockReport.js'
import * as db from '../../lib/db.js'

// Soft-warn only, for now — "later we will hard code it to not allow" (a future, deliberate flip
// to a hard block, tracked here as the single constant to change when that day comes). Kept as its
// own named constant rather than inline so that flip is a one-line diff, not a re-derivation.
const GEOFENCE_RADIUS_M = 100
const GEOFENCE_HARD_BLOCK = false

const orderValue = o => (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)

// A physical stock take is an EXHAUSTIVE count — unlike Distributor Secondary's order cart, every
// active product gets a line (including explicit 0s), because "not counted" and "counted as zero"
// are different facts to the report (see stockReport.js). Used two ways: embedded directly inside
// PunchInGate.jsx's overdue block screen (forced), and as a normal Sales Team menu item for
// voluntary/early counts (src/pages/team/TeamApp.jsx MORE_ITEMS, id 'stockTakeEntry').
export default function StockTakeEntry({ distributor, memberId, onDone, onCancel }) {
  const { products, categories, showToast } = useData()
  const [cart, setCart] = useState({}) // { [product_id]: { qty, unit } }, default qty 0, unit 'base'
  const [catFilter, setCatFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingBatches, setPendingBatches] = useState(null) // null = still checking, [] = none, [...] = some
  const [confirmedPending, setConfirmedPending] = useState(false)

  // Sales is now real, sourced from Order Delivery outcomes (see stockReport.js) — a count taken
  // while this distributor still has undelivered batches is worth surfacing to the rep first (soft
  // confirmation, not a block: they can still proceed, matching this file's own geofence convention).
  useEffect(() => {
    db.fetchPendingDeliveryBatchesForDistributor(distributor.id).then(({ data }) => {
      const groups = {}
      ;(data || []).forEach(o => {
        if (!groups[o.batch_id]) groups[o.batch_id] = { batchId: o.batch_id, date: o.order_date, orders: [] }
        groups[o.batch_id].orders.push(o)
      })
      setPendingBatches(Object.values(groups))
    })
  }, [distributor.id])

  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'
  const visibleProducts = (products || []).filter(p => !catFilter || p.category_id === catFilter)

  const setQty = (pid, qty) => setCart(prev => {
    const q = Math.max(0, Number(qty) || 0)
    return { ...prev, [pid]: { unit: prev[pid]?.unit || 'base', qty: q } }
  })
  const setUnit = (pid, unit) => setCart(prev => ({ ...prev, [pid]: { qty: prev[pid]?.qty || 0, unit } }))

  // Best-effort geolocation capture — resolves with nulls on denial/timeout rather than rejecting,
  // so a location failure never blocks the count itself (only the distance check downstream does,
  // and only once GEOFENCE_HARD_BLOCK flips true).
  const captureLocation = () => new Promise(resolve => {
    if (!navigator.geolocation) { resolve({ lat: null, lng: null }); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })

  // Fire-and-forget — a failure here shouldn't undo or hold up a stock take that already saved
  // successfully; same non-blocking convention as db.logActivity elsewhere in this app. Reuses the
  // exact same pure computeStockTakePeriods() the live Stock & Sales Report itself runs, scoped to
  // just this one distributor (cheap, and guarantees the snapshot can never compute differently from
  // what the report would have shown at that moment).
  const generateDiscrepancyReport = async (take) => {
    const [{ data: stockTakes }, { data: invoices }, { data: secondaryOrders }, { data: openingStocks }] = await Promise.all([
      db.fetchStockTakesForDistributors({ distributorIds: [distributor.id] }),
      db.fetchReceiptsForStockReport({ distributorIds: [distributor.id] }),
      db.fetchDeliveredSecondaryOrdersForStockReport({ distributorIds: [distributor.id] }),
      db.fetchOpeningStocks({ distributorIds: [distributor.id] }),
    ])
    const { periods } = computeStockTakePeriods({
      stockTakes: stockTakes || [], invoices: invoices || [], secondaryOrders: secondaryOrders || [], openingStocks: openingStocks || [],
      products: products || [], distributorIds: [distributor.id], productIds: null,
    })
    // Match on takeId, not take_date — two stock takes for the same distributor can share a
    // calendar date (a same-day recount), and a date-string match would ambiguously pick up both
    // takes' periods, duplicating/conflicting rows in the generated report (caught live: a same-day
    // recount during verification produced two rows for one product with different numbers).
    const thisPeriods = periods.filter(p => p.takeId === take.id)
    if (!thisPeriods.length) return
    await db.createDiscrepancyReport({
      distributorId: distributor.id, takeId: take.id, reportDate: take.take_date, fromDate: thisPeriods[0]?.from,
      items: thisPeriods.map(p => ({
        product_id: p.productId,
        opening: p.opening, opening_value: p.openingValue,
        receipts: p.receipts, receipts_value: p.receiptsValue,
        sales: p.sales, sales_value: p.salesValue,
        calculated_closing: p.calculatedClosing, calculated_closing_value: p.calculatedClosingValue,
        physical_closing: p.closing, physical_closing_value: p.closingValue,
        variance: p.variance, variance_value: p.varianceValue,
      })),
    })
  }

  const save = async () => {
    setSaving(true)

    const { lat, lng } = await captureLocation()
    let distanceM = null, locationFlag = false, geofenceWarning = null
    // Distributor has no confirmed location on file — nothing to check against, allow through
    // unverified rather than blocking on a Distributor-master data gap.
    if (lat != null && lng != null && distributor.confirmed_latitude != null && distributor.confirmed_longitude != null) {
      distanceM = Math.round(haversineMeters(lat, lng, distributor.confirmed_latitude, distributor.confirmed_longitude))
      if (distanceM > GEOFENCE_RADIUS_M) {
        locationFlag = true
        if (GEOFENCE_HARD_BLOCK) {
          setSaving(false)
          showToast(`Blocked — you're ${distanceM}m from ${distributor.name} (limit ${GEOFENCE_RADIUS_M}m)`)
          return
        }
        // Held until the save actually succeeds below, then shown as ONE toast together with the
        // save confirmation — two separate showToast() calls in quick succession would just have
        // the second (save-confirmed) message silently clobber this warning before it's readable,
        // since the app only ever shows one toast at a time.
        geofenceWarning = `⚠ ${distanceM}m from ${distributor.name}'s location — recorded anyway`
      }
    }

    // Exhaustive — every active product gets a line, not just the ones the rep touched (a
    // never-touched product still needs an explicit 0 on record, see the file header comment).
    const items = (products || []).map(p => {
      const entry = cart[p.id] || { qty: 0, unit: 'base' }
      return {
        product_id: p.id, category_id: p.category_id,
        physical_qty: toBaseQty(p, entry.unit, entry.qty),
        entered_unit: entry.unit, entered_qty: entry.qty,
      }
    })
    const { data: take, error } = await db.createStockTake(
      { distributor_id: distributor.id, member_id: memberId, lat, lng, distance_m: distanceM, location_flag: locationFlag },
      items,
    )
    setSaving(false)
    if (error) { showToast('Error saving stock take'); return }
    if (take) generateDiscrepancyReport(take).catch(() => {})
    showToast(geofenceWarning ? `Stock take saved · ${geofenceWarning}` : 'Physical stock take saved')
    onDone()
  }

  const groups = {}
  visibleProducts.forEach(p => {
    const key = categoryName(p.category_id)
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  })

  if (pendingBatches === null) {
    return <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Checking pending deliveries...</div>
  }

  if (pendingBatches.length > 0 && !confirmedPending) {
    return (
      <div>
        <Card style={{ background: '#fef3c7' }}>
          <CH title="Pending Deliveries" sub={`${pendingBatches.length} batch(es) not yet delivered for ${distributor?.name}`} />
          <div style={{ padding: '0 14px 12px', fontSize: 12, color: '#92400e' }}>
            These orders haven't been marked delivered yet — Sales for this stock take's period won't
            include them until they are. You can still proceed with the count.
          </div>
          {pendingBatches.map(b => (
            <div key={b.batchId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderTop: '1px solid #fde68a', fontSize: 12 }}>
              <div>{b.batchId} <span style={{ color: '#92400e' }}>· {b.date}</span></div>
              <div style={{ fontWeight: 600 }}>{b.orders.length} order(s) · {F(b.orders.reduce((s, o) => s + orderValue(o), 0))}</div>
            </div>
          ))}
        </Card>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Btn v="pri" full onClick={() => setConfirmedPending(true)}>Confirm & Proceed to Stock Take</Btn>
          {onCancel && <Btn full onClick={onCancel}>Cancel</Btn>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Card style={{ background: '#f9fafb' }}>
        <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>
          Enter the physical count for every product at <strong>{distributor?.name}</strong>. Leave
          a product at 0 if none is actually on hand — that's still a real count, not a skip.
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button onClick={() => setCatFilter('')} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', background: !catFilter ? '#2563eb' : '#f3f4f6', color: !catFilter ? '#fff' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>All</button>
        {(categories || []).map(c => (
          <button key={c.id} onClick={() => setCatFilter(c.id)} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', background: catFilter === c.id ? '#2563eb' : '#f3f4f6', color: catFilter === c.id ? '#fff' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{c.name}</button>
        ))}
      </div>

      {Object.entries(groups).map(([cat, items]) => (
        <Card key={cat}>
          <CH title={cat} sub={`${items.length} product(s)`} />
          {items.map(p => {
            const entry = cart[p.id]
            const qty = entry?.qty || 0
            const unit = entry?.unit || 'base'
            const unitOpts = availableUnitsForProduct(p)
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.unit}</div>
                </div>
                {unitOpts.length > 1 && (
                  <select value={unit} onChange={e => setUnit(p.id, e.target.value)} style={{ padding: '5px 7px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
                    {unitOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setQty(p.id, qty - 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 16, cursor: 'pointer' }}>−</button>
                  <span style={{ minWidth: 24, textAlign: 'center', fontSize: 14, fontWeight: 700 }}>{qty}</span>
                  <button onClick={() => setQty(p.id, qty + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 16, cursor: 'pointer' }}>+</button>
                </div>
              </div>
            )
          })}
        </Card>
      ))}

      {(products || []).length === 0 && (
        <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No products found</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn v="pri" full disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Complete Stock Take'}</Btn>
        {onCancel && <Btn full onClick={onCancel}>Cancel</Btn>}
      </div>
    </div>
  )
}
