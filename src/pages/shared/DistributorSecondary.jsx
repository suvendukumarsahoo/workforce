import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Inp, Sheet, F } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { downloadSecondaryOrderPdf, downloadSecondaryOrdersBatch } from '../../lib/printSecondaryOrder.js'
import { downloadDaySummaryPdf } from '../../lib/printDaySummary.js'
import { availableUnitsForProduct, toBaseQty } from '../../lib/unitConversion.js'
import { haversineMeters } from '../../lib/geo.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ~4 km/h on-foot estimate between nearby retail outlets — deliberately tentative (straight-line
// haversine distance, no real routing/roads involved), same spirit as this app's other "tentative"
// ETA figures (e.g. RouteMapSheet's OSRM estimate vs actual). Outlets missing lat/lng (geolocation
// was denied when they were added) sort to the end with distance/ETA shown as unknown rather than
// being dropped from the list — every remaining outlet stays choosable either way.
const WALK_MPS = 4000 / 3600
const distanceLabel = m => m == null ? 'Distance unknown' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
const etaLabel = m => m == null ? '' : `~${Math.max(1, Math.round(m / WALK_MPS / 60))} min`

function sortOutletsByDistance(from, outlets) {
  const withDist = (outlets || []).map(o => {
    const hasCoords = from?.lat != null && from?.lng != null && o.lat != null && o.lng != null
    const meters = hasCoords ? haversineMeters(from.lat, from.lng, o.lat, o.lng) : null
    return { ...o, distanceMeters: meters }
  })
  return withDist.sort((a, b) => {
    if (a.distanceMeters == null && b.distanceMeters == null) return 0
    if (a.distanceMeters == null) return 1
    if (b.distanceMeters == null) return -1
    return a.distanceMeters - b.distanceMeters
  })
}

// Soft-fail promise-wrapped geolocation — same pattern as NewCustomerVisit.jsx's getLocation().
function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    )
  })
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const stockColor = s => s === 'Unavailable' ? '#fee2e2' : s === 'Wait' ? '#ffedd5' : '#fff'

export default function DistributorSecondary() {
  const { currentUser } = useAuth()
  const { distributors, products, categories, showToast, loadAll } = useData()
  const mid = currentUser?.member_id

  const [tab, setTab] = useState('beats') // 'beats' | 'visit' | 'summary'
  const [beats, setBeats] = useState([])
  const [showCreateBeat, setShowCreateBeat] = useState(false)
  // Distributor is the first thing a rep picks — beats are scoped underneath it, not mixed
  // together across every distributor. Persists across tab switches (not reset on 'visit'/
  // 'summary' navigation) so backing out of a beat/outlet returns to the same distributor's list;
  // only the explicit "← Distributors" back action clears it.
  const [selectedDistributor, setSelectedDistributor] = useState(null)

  const [activeBeat, setActiveBeat] = useState(null)
  const [outlets, setOutlets] = useState([])
  const [visitedToday, setVisitedToday] = useState({}) // { outlet_id: {outcome, ...} }
  const [showAddOutlet, setShowAddOutlet] = useState(false)
  // After a visit is recorded, suggest nearby remaining outlets instead of auto-opening one —
  // { from, options } | null.
  const [nextOutletChoice, setNextOutletChoice] = useState(null)
  const [activeOutlet, setActiveOutlet] = useState(null)

  const [summaryVisits, setSummaryVisits] = useState(null)
  const [summaryOrders, setSummaryOrders] = useState(null)
  const [daySummaryRecord, setDaySummaryRecord] = useState(null)

  // Ongoing Orders — its own tab (before Day Summary), not a popup: today's not-yet-locked orders,
  // Edit/Delete each, Retailing Complete at the bottom. editingOrder tracks an order reopened via
  // Edit from that tab.
  const [ongoingOrders, setOngoingOrders] = useState(null)
  const [editingOrder, setEditingOrder] = useState(null)

  const myDistributors = (distributors || []).filter(d => (d.assignedTo || []).includes(mid) && d.type === 'Distributor')

  const loadBeats = async () => {
    const { data } = await db.fetchMyBeats(mid)
    setBeats(data || [])
  }
  useEffect(() => {
    let cancelled = false
    db.fetchMyBeats(mid).then(({ data }) => { if (!cancelled) setBeats(data || []) })
    return () => { cancelled = true }
  }, [mid])

  const loadOutletsAndStatus = async (beat) => {
    const [{ data: out }, { data: vis }] = await Promise.all([
      db.fetchOutletsForBeat(beat.id),
      db.fetchRetailVisitsForDate(mid, todayStr()),
    ])
    setOutlets(out || [])
    setVisitedToday(Object.fromEntries((vis || []).filter(v => v.beat_id === beat.id).map(v => [v.outlet_id, v])))
  }

  const openBeat = async (beat) => {
    setActiveBeat(beat)
    await loadOutletsAndStatus(beat)
    setTab('visit')
  }

  const loadSummary = async () => {
    setSummaryVisits(null); setSummaryOrders(null)
    const [{ data: vis }, { data: ord }, { data: rec }] = await Promise.all([
      db.fetchRetailVisitsForDate(mid, todayStr()),
      db.fetchSecondaryOrdersForDate(mid, todayStr()),
      db.fetchDaySummaryForDate(mid, todayStr()),
    ])
    setSummaryVisits(vis || [])
    setSummaryOrders(ord || [])
    setDaySummaryRecord(rec || null)
  }

  const openSummary = () => { setTab('summary'); loadSummary() }

  const loadOngoing = async () => {
    setOngoingOrders(null)
    const { data } = await db.fetchOngoingSecondaryOrders(mid, todayStr())
    setOngoingOrders(data || [])
  }
  const openOngoing = () => { setTab('ongoing'); loadOngoing() }

  const afterVisitRecorded = async () => {
    const completedOutlet = activeOutlet
    setActiveOutlet(null)
    setEditingOrder(null)
    if (activeBeat) await loadOutletsAndStatus(activeBeat)
    // No more auto-opening the next outlet — instead, suggest remaining outlets nearest-first
    // (straight-line distance from the one just completed) and let the rep pick, same reasoning as
    // "the next outlet is not necessarily the right one to walk into automatically."
    const { data: out } = await db.fetchOutletsForBeat(activeBeat.id)
    const { data: vis } = await db.fetchRetailVisitsForDate(mid, todayStr())
    const doneIds = new Set((vis || []).filter(v => v.beat_id === activeBeat.id).map(v => v.outlet_id))
    const remaining = (out || []).filter(o => !doneIds.has(o.id))
    if (remaining.length === 0) { showToast('All outlets in this beat are done for today'); return }
    setNextOutletChoice({ from: completedOutlet, options: sortOutletsByDistance(completedOutlet, remaining) })
  }

  const TABS = [
    ['beats', 'Beats'],
    ...(activeBeat ? [['visit', activeBeat.name]] : []),
    ['ongoing', 'Ongoing Orders'],
    ['summary', 'Day Summary'],
  ]

  return (
    <div>
      {showCreateBeat && selectedDistributor && (
        <CreateBeatSheet
          distributor={selectedDistributor}
          onSave={async (payload) => {
            const { error } = await db.createBeat(selectedDistributor.id, payload.name, payload.coverageDays, mid)
            if (error) { showToast('Error creating beat'); return }
            await loadBeats()
            setShowCreateBeat(false)
            showToast('Beat created')
          }}
          onClose={() => setShowCreateBeat(false)}
        />
      )}

      {showAddOutlet && activeBeat && (
        <AddOutletSheet
          onSave={async (payload) => {
            const loc = await getLocation()
            const { data, error } = await db.createRetailOutlet(activeBeat.id, payload.name, payload.number, loc?.lat, loc?.lng, mid)
            if (error) { showToast('Error creating outlet'); return }
            await loadOutletsAndStatus(activeBeat)
            setShowAddOutlet(false)
            setActiveOutlet(data)
          }}
          onClose={() => setShowAddOutlet(false)}
        />
      )}

      {activeOutlet && activeBeat && (
        <ItemOrderSheet
          outlet={activeOutlet}
          beat={activeBeat}
          mid={mid}
          products={products}
          categories={categories}
          showToast={showToast}
          existingOrder={editingOrder}
          onClose={() => { setActiveOutlet(null); setEditingOrder(null) }}
          onDone={async () => { await afterVisitRecorded(); await loadAll() }}
        />
      )}

      {nextOutletChoice && (
        <NextOutletSheet
          options={nextOutletChoice.options}
          onSelect={(o) => { setActiveOutlet(o); setNextOutletChoice(null) }}
          onClose={() => setNextOutletChoice(null)}
        />
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => key === 'summary' ? openSummary() : key === 'ongoing' ? openOngoing() : setTab(key)}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tab === key ? '#2563eb' : '#f3f4f6', color: tab === key ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'beats' && !selectedDistributor && (
        <>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Select a distributor to see or create beats under them</div>
          {myDistributors.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No distributors assigned to you</div>}
          {myDistributors.map(d => {
            const count = beats.filter(b => b.distributor_id === d.id).length
            return (
              <Card key={d.id} onClick={() => setSelectedDistributor(d)}>
                <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{count} beat{count === 1 ? '' : 's'}</span>
                </div>
              </Card>
            )
          })}
        </>
      )}

      {tab === 'beats' && selectedDistributor && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button onClick={() => setSelectedDistributor(null)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Distributors</button>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{selectedDistributor.name}</span>
          </div>
          <Btn v="pri" full onClick={() => setShowCreateBeat(true)} style={{ marginBottom: 12 }}>+ Create Beat</Btn>
          {beats.filter(b => b.distributor_id === selectedDistributor.id).length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No beats created yet under this distributor</div>
          )}
          {beats.filter(b => b.distributor_id === selectedDistributor.id).map(b => (
            <Card key={b.id} onClick={() => openBeat(b)}>
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{b.id}</span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{(b.coverage_days || []).join(', ') || 'No coverage days set'}</div>
              </div>
            </Card>
          ))}
        </>
      )}

      {tab === 'visit' && activeBeat && (
        <>
          <Btn full onClick={() => setShowAddOutlet(true)} style={{ marginBottom: 12 }}>+ Add Outlet</Btn>
          {outlets.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No outlets under this beat yet</div>}
          {outlets.map(o => {
            const v = visitedToday[o.id]
            const status = v ? (v.outcome === 'order' ? 'Ordered' : 'No Order') : 'Not Visited'
            const color = v ? (v.outcome === 'order' ? '#10b981' : '#ef4444') : '#9ca3af'
            return (
              <Card key={o.id} onClick={() => !v && setActiveOutlet(o)} style={{ opacity: v ? 0.7 : 1 }}>
                <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.id}{o.number ? ` · ${o.number}` : ''}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color }}>{status}</span>
                </div>
              </Card>
            )
          })}
        </>
      )}

      {tab === 'ongoing' && (
        <OngoingOrdersTab
          mid={mid}
          orders={ongoingOrders}
          products={products}
          showToast={showToast}
          onRefresh={loadOngoing}
          onEdit={(order) => {
            const beat = beats.find(b => b.id === order.beat_id) || { id: order.beat_id, distributor_id: order.distributor_id }
            setActiveBeat(beat)
            setActiveOutlet(order.outlet ? { ...order.outlet, id: order.outlet_id } : { id: order.outlet_id })
            setEditingOrder(order)
          }}
          onCancelled={async () => { await loadOngoing(); if (activeBeat) await loadOutletsAndStatus(activeBeat) }}
          onRetailingComplete={async () => {
            await loadOngoing()
            if (activeBeat) await loadOutletsAndStatus(activeBeat)
            await loadAll()
            const { data: rec } = await db.fetchDaySummaryForDate(mid, todayStr())
            setDaySummaryRecord(rec || null)
          }}
        />
      )}

      {tab === 'summary' && (
        <DaySummary
          daySummaryRecord={daySummaryRecord}
          visits={summaryVisits}
          orders={summaryOrders}
          products={products}
          onRefresh={loadSummary}
          showToast={showToast}
        />
      )}
    </div>
  )
}

function CreateBeatSheet({ distributor, onSave, onClose }) {
  const [name, setName] = useState('')
  const [coverageDays, setCoverageDays] = useState([])

  const toggleDay = d => setCoverageDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  return (
    <Sheet title="Create Beat" sub={`Under ${distributor.name}`} onClose={onClose}>
      <Inp label="Beat Name" value={name} onChange={setName} placeholder="e.g. North Market Route" />
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Coverage Days</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAYS.map(d => (
            <button key={d} onClick={() => toggleDay(d)}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: coverageDays.includes(d) ? '#2563eb' : '#f3f4f6', color: coverageDays.includes(d) ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <Btn v="pri" full disabled={!name}
        onClick={() => onSave({ name, coverageDays })}>
        Save Beat
      </Btn>
    </Sheet>
  )
}

function AddOutletSheet({ onSave, onClose }) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')

  return (
    <Sheet title="Add Retail Outlet" sub="Location captured automatically on save" onClose={onClose}>
      <Inp label="Outlet Name" value={name} onChange={setName} placeholder="e.g. Sharma General Store" />
      <Inp label="Number" value={number} onChange={setNumber} placeholder="Phone number" />
      <Btn v="pri" full disabled={!name} onClick={() => onSave({ name, number })}>Save Outlet</Btn>
    </Sheet>
  )
}

// Shown right after a visit is recorded (order or no-order) instead of auto-opening the next
// outlet — remaining outlets in the beat, nearest-first by straight-line distance from the one
// just completed, each with a tentative walking ETA. Tapping any option opens it for ordering;
// closing without picking just returns to the beat's own outlet list (still fully browsable there,
// "choose any other outlet" per the ask).
function NextOutletSheet({ options, onSelect, onClose }) {
  return (
    <Sheet title="Visit Recorded" sub="Nearest remaining outlets first" onClose={onClose} zIndex={330}>
      {options.map(o => (
        <Card key={o.id} onClick={() => onSelect(o)}>
          <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.id}{o.number ? ` · ${o.number}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{distanceLabel(o.distanceMeters)}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{etaLabel(o.distanceMeters)}</div>
            </div>
          </div>
        </Card>
      ))}
    </Sheet>
  )
}

function ItemOrderSheet({ outlet, beat, mid, products, categories, showToast, onClose, onDone, existingOrder }) {
  const [catFilter, setCatFilter] = useState('all')
  // Pre-filled from existingOrder (Edit, from the Ongoing Orders sheet) when present — same
  // { product_id: { qty, unit } } shape the rest of this component already works with.
  const [cart, setCart] = useState(() => Object.fromEntries(
    (existingOrder?.items || []).map(it => [it.product_id, { qty: it.entered_qty ?? it.qty, unit: it.entered_unit || 'base' }])
  ))
  const [showNoOrder, setShowNoOrder] = useState(false)
  const [noOrderReason, setNoOrderReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Tracks the saved-but-not-yet-locked order for this visit — null until the first successful
  // save, after which re-checking-out updates that same order instead of creating a duplicate.
  const [savedOrderId, setSavedOrderId] = useState(existingOrder?.id || null)
  const [confirmData, setConfirmData] = useState(null) // { orderId, itemCount, total } | null

  const visibleProducts = (products || []).filter(p => catFilter === 'all' || p.category_id === catFilter)
  // Entries are kept (not deleted) at qty 0 so a unit picked before any + tap survives —
  // cartLines below filters qty>0 so a 0-qty entry never reaches the total/checkout.
  const setQty = (pid, qty) => setCart(prev => {
    const q = Math.max(0, Number(qty) || 0)
    return { ...prev, [pid]: { unit: prev[pid]?.unit || 'base', qty: q } }
  })
  const setUnit = (pid, unit) => setCart(prev => (
    { ...prev, [pid]: { qty: prev[pid]?.qty || 0, unit } }
  ))

  const cartLines = Object.entries(cart)
    .filter(([, entry]) => entry.qty > 0)
    .map(([pid, entry]) => {
      const p = (products || []).find(x => x.id === pid)
      const baseQty = toBaseQty(p, entry.unit, entry.qty)
      return {
        product_id: pid, qty: baseQty, rate: Number(p?.price) || 0, category_id: p?.category_id,
        entered_unit: entry.unit, entered_qty: entry.qty,
      }
    })
  const cartTotal = cartLines.reduce((s, l) => s + l.qty * l.rate, 0)

  // Saves immediately (same DB write as before), but no longer closes/advances on success — instead
  // shows a review dialog (order id/items/total, Edit or Confirm). Edit just closes the dialog and
  // leaves the cart open for more changes; re-checking-out from there updates the same order
  // (savedOrderId is already set) rather than creating a second one. Confirm is what actually moves
  // on (see confirmDialog below).
  const checkout = async () => {
    if (cartLines.length === 0) { showToast('Add at least one item'); return }
    setSubmitting(true)
    if (savedOrderId) {
      const { error } = await db.updateSecondaryOrderItems(savedOrderId, cartLines)
      setSubmitting(false)
      if (error) { showToast('Error saving order'); return }
      setConfirmData({ orderId: savedOrderId, itemCount: cartLines.length, total: cartTotal })
      return
    }
    const { data: order, error } = await db.createSecondaryOrder(
      { outlet_id: outlet.id, beat_id: beat.id, distributor_id: beat.distributor_id, member_id: mid },
      cartLines,
    )
    if (error) { showToast('Error saving order'); setSubmitting(false); return }
    const { error: visitError } = await db.createRetailVisit({
      beat_id: beat.id, outlet_id: outlet.id, member_id: mid, outcome: 'order', order_id: order.id,
      // Explicit local calendar date rather than relying on the DB's `default current_date` —
      // that resolves in the database session's own timezone (commonly UTC), which can land a
      // late-night/early-morning IST visit on the wrong day relative to every query here that
      // filters by this file's own local todayStr() (same bug class just fixed for order_date
      // in db.createSecondaryOrder).
      visit_date: todayStr(),
    })
    setSubmitting(false)
    if (visitError) { showToast('Order saved, but visit log failed'); }
    setSavedOrderId(order.id)
    setConfirmData({ orderId: order.id, itemCount: cartLines.length, total: cartTotal })
  }

  const confirmNoOrder = async () => {
    if (!noOrderReason.trim()) { showToast('Enter a reason'); return }
    setSubmitting(true)
    const { error } = await db.createRetailVisit({
      beat_id: beat.id, outlet_id: outlet.id, member_id: mid, outcome: 'no_order', no_order_reason: noOrderReason,
      visit_date: todayStr(), // same UTC-default fix as the 'order' outcome above
    })
    setSubmitting(false)
    if (error) { showToast('Error saving'); return }
    showToast('No-order logged')
    onDone()
  }

  return (
    <Sheet title={outlet.name} sub={`${outlet.id} — item order`} onClose={onClose} zIndex={320}>
      {showNoOrder ? (
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Why is there no order from this outlet today?</div>
          <textarea value={noOrderReason} onChange={e => setNoOrderReason(e.target.value)}
            placeholder="Reason..." style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 70, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn v="bad" full disabled={submitting} onClick={confirmNoOrder}>Confirm No Order</Btn>
            <Btn full onClick={() => setShowNoOrder(false)}>Back</Btn>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
            <button onClick={() => setCatFilter('all')} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, border: 'none', background: catFilter === 'all' ? '#2563eb' : '#f3f4f6', color: catFilter === 'all' ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>All</button>
            {(categories || []).map(c => (
              <button key={c.id} onClick={() => setCatFilter(c.id)} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, border: 'none', background: catFilter === c.id ? '#2563eb' : '#f3f4f6', color: catFilter === c.id ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{c.name}</button>
            ))}
          </div>

          <div>
            {visibleProducts.map(p => {
              const unavailable = (p.stock_status || 'Available') === 'Unavailable'
              const entry = cart[p.id]
              const qty = entry?.qty || 0
              const unit = entry?.unit || 'base'
              const unitOpts = availableUnitsForProduct(p)
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid #f3f4f6', background: stockColor(p.stock_status), opacity: unavailable ? 0.55 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}{unavailable ? ' (Unavailable)' : ''}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{F(p.price)} / {p.unit}</div>
                  </div>
                  {unitOpts.length > 1 && (
                    <select disabled={unavailable} value={unit} onChange={e => setUnit(p.id, e.target.value)}
                      style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff' }}>
                      {unitOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button disabled={unavailable} onClick={() => setQty(p.id, qty - 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>−</button>
                    <span style={{ width: 24, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{qty}</span>
                    <button disabled={unavailable} onClick={() => setQty(p.id, qty + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '10px 0', marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span>{cartLines.length} item(s)</span>
              <span style={{ fontWeight: 700 }}>{F(cartTotal)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn v="pri" full disabled={submitting} onClick={checkout}>{savedOrderId ? 'Save Changes' : 'Checkout'}</Btn>
              {!savedOrderId && <Btn full disabled={submitting} onClick={() => setShowNoOrder(true)}>No Order</Btn>}
            </div>
          </div>
        </>
      )}

      {confirmData && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 340, width: '100%' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Order Saved</div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>Order ID: <strong>{confirmData.orderId}</strong></div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>Items: <strong>{confirmData.itemCount}</strong></div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 16 }}>Total Value: <strong>{F(confirmData.total)}</strong></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn v="pri" full onClick={() => { setConfirmData(null); onDone() }}>Confirm</Btn>
              <Btn full onClick={() => setConfirmData(null)}>Edit</Btn>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}

// Its own tab, positioned right before Day Summary — today's not-yet-locked, not-cancelled orders,
// with Edit/Delete per row, and the one-time "Retailing Complete" action at the bottom. Data is
// fetched by the parent (loadOngoing, mirroring loadSummary's existing pattern) and passed in as
// `orders`, so switching to this tab always shows a fresh list rather than a stale mount-time fetch.
function OngoingOrdersTab({ mid, orders, products, showToast, onRefresh, onEdit, onCancelled, onRetailingComplete }) {
  const [cancellingId, setCancellingId] = useState(null)
  const [showComplete, setShowComplete] = useState(false)

  const orderValue = o => (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)

  // "Delete" in the UI — soft-cancel underneath (matches this app's existing convention, e.g.
  // distributor_order_items.cancelled, and keeps an audit trail) rather than a hard delete.
  const deleteOrder = async (order) => {
    setCancellingId(order.id)
    const { error } = await db.cancelSecondaryOrder(order.id)
    setCancellingId(null)
    if (error) { showToast('Error deleting order'); return }
    showToast('Order deleted')
    await onCancelled()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Today — not yet locked</div>
        <Btn sm onClick={onRefresh}>↻ Refresh</Btn>
      </div>

      {orders === null && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Loading...</div>}
      {orders !== null && orders.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No ongoing orders today</div>}
      {(orders || []).map(o => (
        <Card key={o.id}>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{o.outlet?.name || o.outlet_id}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.id} · {(o.items || []).length} item(s) · {F(orderValue(o))}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn sm onClick={() => onEdit(o)}>✏️ Edit</Btn>
              <Btn sm v="bad" disabled={cancellingId === o.id} onClick={() => deleteOrder(o)}>{cancellingId === o.id ? 'Deleting...' : '🗑️ Delete'}</Btn>
            </div>
          </div>
        </Card>
      ))}

      <Btn v="pri" full disabled={!orders || orders.length === 0} style={{ marginTop: 14 }} onClick={() => setShowComplete(true)}>
        Retailing Complete
      </Btn>

      {showComplete && (
        <RetailingCompleteDialog
          mid={mid}
          orders={orders || []}
          products={products}
          showToast={showToast}
          onCancel={() => setShowComplete(false)}
          onConfirmed={async () => { setShowComplete(false); await onRetailingComplete() }}
        />
      )}
    </div>
  )
}

function RetailingCompleteDialog({ mid, orders, products, showToast, onCancel, onConfirmed }) {
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState(null) // set once created — switches this dialog to its success/download state
  const total = orders.reduce((s, o) => s + (o.items || []).reduce((s2, it) => s2 + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0), 0)
  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid

  const confirm = async () => {
    setSubmitting(true)
    const { error } = await db.lockSecondaryOrdersForDate(mid, todayStr())
    if (error) { setSubmitting(false); showToast('Error completing retailing'); return }
    const { data: visits } = await db.fetchRetailVisitsForDate(mid, todayStr())
    const outletsVisited = new Set((visits || []).map(v => v.outlet_id)).size
    const { data: daySummary, error: summaryError } = await db.createDaySummary(mid, todayStr(), {
      outletsVisited, orders: orders.length, value: total,
    })
    setSubmitting(false)
    if (summaryError) { showToast('Retailing complete, but summary record failed'); onConfirmed(); return }
    showToast('Retailing complete — orders locked')
    setSummary({ record: daySummary, visits: visits || [] })
  }

  const download = () => {
    downloadDaySummaryPdf({ summary: summary.record, visits: summary.visits, orders, productName })
  }

  if (summary) {
    return (
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 340, width: '100%' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>✓ Retailing Complete</div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>Summary ID: <strong>{summary.record.id}</strong></div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 16 }}>Generated: <strong>{new Date(summary.record.created_at).toLocaleString('en-IN')}</strong></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn v="pri" full onClick={download}>⬇ Download Summary</Btn>
            <Btn full onClick={onConfirmed}>Done</Btn>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 340, width: '100%' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Complete Retailing for Today?</div>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>Orders: <strong>{orders.length}</strong></div>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 16 }}>Total Value: <strong>{F(total)}</strong></div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>Once confirmed, today's orders are locked and can no longer be edited or cancelled.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn v="pri" full disabled={submitting} onClick={confirm}>{submitting ? 'Locking...' : 'Confirm'}</Btn>
          <Btn full disabled={submitting} onClick={onCancel}>Cancel</Btn>
        </div>
      </div>
    </div>
  )
}

function DaySummary({ daySummaryRecord, visits, orders, products, onRefresh, showToast }) {
  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid

  const downloadSummary = () => {
    downloadDaySummaryPdf({ summary: daySummaryRecord, visits, orders, productName })
  }

  if (visits === null) return <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>

  const orderedOutletIds = new Set((orders || []).map(o => o.outlet_id))
  const noOrderVisits = (visits || []).filter(v => v.outcome === 'no_order')

  const productTotals = {}
  ;(orders || []).forEach(o => {
    (o.items || []).forEach(it => {
      const key = it.product_id
      if (!productTotals[key]) productTotals[key] = { name: it.product?.name || productName(key), qty: 0, value: 0 }
      productTotals[key].qty += Number(it.qty) || 0
      productTotals[key].value += (Number(it.qty) || 0) * (Number(it.rate) || 0)
    })
  })
  const productRows = Object.values(productTotals).sort((a, b) => b.value - a.value)

  const orderValue = o => (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)

  const downloadBatch = async () => {
    if (!orders || orders.length === 0) { showToast('No orders to download'); return }
    await downloadSecondaryOrdersBatch(orders, { outletName: o => o.outlet?.name || o.outlet_id, productName })
  }

  return (
    <div>
      {daySummaryRecord && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>✓ Retailing Complete — {daySummaryRecord.id}</div>
            <div style={{ fontSize: 11, color: '#047857' }}>Generated {new Date(daySummaryRecord.created_at).toLocaleString('en-IN')}</div>
          </div>
          <Btn sm v="pri" onClick={downloadSummary}>⬇ Download Summary</Btn>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{visits.length} outlet(s) visited today</div>
        <Btn sm onClick={onRefresh}>↻ Refresh</Btn>
      </div>

      <Card>
        <CH title="Outlet-wise" />
        {visits.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No visits recorded yet today</div>}
        {(orders || []).map(o => (
          <div key={o.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{o.outlet?.name || o.outlet_id}</div>
              <div style={{ fontSize: 11, color: '#10b981' }}>Ordered · {F(orderValue(o))} · {o.id}</div>
            </div>
            <Btn sm onClick={() => downloadSecondaryOrderPdf({ order: o, outletName: o.outlet?.name || o.outlet_id, productName })}>PDF</Btn>
          </div>
        ))}
        {noOrderVisits.map(v => (
          <div key={v.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{v.outlet?.name || v.outlet_id}</div>
            <div style={{ fontSize: 11, color: '#ef4444' }}>No Order — {v.no_order_reason}</div>
          </div>
        ))}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <CH title="Product-wise" />
        {productRows.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No orders yet today</div>}
        {productRows.map(p => (
          <div key={p.name} style={{ padding: '8px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>{p.name}</span>
            <span>{p.qty} · {F(p.value)}</span>
          </div>
        ))}
      </Card>

      {orderedOutletIds.size > 0 && (
        <Btn v="pri" full style={{ marginTop: 14 }} onClick={downloadBatch}>⬇ Download Batch (ZIP)</Btn>
      )}
    </div>
  )
}
