import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Inp, Sheet, F } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { downloadSecondaryOrderPdf, downloadSecondaryOrdersBatch } from '../../lib/printSecondaryOrder.js'
import { availableUnitsForProduct, toBaseQty } from '../../lib/unitConversion.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

  const [activeBeat, setActiveBeat] = useState(null)
  const [outlets, setOutlets] = useState([])
  const [visitedToday, setVisitedToday] = useState({}) // { outlet_id: {outcome, ...} }
  const [showAddOutlet, setShowAddOutlet] = useState(false)
  const [activeOutlet, setActiveOutlet] = useState(null)

  const [summaryVisits, setSummaryVisits] = useState(null)
  const [summaryOrders, setSummaryOrders] = useState(null)

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
    const [{ data: vis }, { data: ord }] = await Promise.all([
      db.fetchRetailVisitsForDate(mid, todayStr()),
      db.fetchSecondaryOrdersForDate(mid, todayStr()),
    ])
    setSummaryVisits(vis || [])
    setSummaryOrders(ord || [])
  }

  const openSummary = () => { setTab('summary'); loadSummary() }

  const afterVisitRecorded = async () => {
    setActiveOutlet(null)
    if (activeBeat) await loadOutletsAndStatus(activeBeat)
    // auto-advance: open the next un-visited outlet in list order, if any
    const { data: out } = await db.fetchOutletsForBeat(activeBeat.id)
    const { data: vis } = await db.fetchRetailVisitsForDate(mid, todayStr())
    const doneIds = new Set((vis || []).filter(v => v.beat_id === activeBeat.id).map(v => v.outlet_id))
    const next = (out || []).find(o => !doneIds.has(o.id))
    if (next) setActiveOutlet(next)
    else showToast('All outlets in this beat are done for today')
  }

  const TABS = [
    ['beats', 'Beats'],
    ...(activeBeat ? [['visit', activeBeat.name]] : []),
    ['summary', 'Day Summary'],
  ]

  return (
    <div>
      {showCreateBeat && (
        <CreateBeatSheet
          distributors={myDistributors}
          onSave={async (payload) => {
            const { error } = await db.createBeat(payload.distributorId, payload.name, payload.coverageDays, mid)
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
          onClose={() => setActiveOutlet(null)}
          onDone={async () => { await afterVisitRecorded(); await loadAll() }}
        />
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => key === 'summary' ? openSummary() : setTab(key)}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tab === key ? '#2563eb' : '#f3f4f6', color: tab === key ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'beats' && (
        <>
          <Btn v="pri" full onClick={() => setShowCreateBeat(true)} style={{ marginBottom: 12 }}>+ Create Beat</Btn>
          {beats.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No beats created yet</div>}
          {beats.map(b => (
            <Card key={b.id} onClick={() => openBeat(b)}>
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{b.id}</span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{b.distributor?.name || b.distributor_id}</div>
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

      {tab === 'summary' && (
        <DaySummary
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

function CreateBeatSheet({ distributors, onSave, onClose }) {
  const [distributorId, setDistributorId] = useState('')
  const [name, setName] = useState('')
  const [coverageDays, setCoverageDays] = useState([])

  const toggleDay = d => setCoverageDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  return (
    <Sheet title="Create Beat" sub="Under a distributor" onClose={onClose}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Distributor</label>
        <select value={distributorId} onChange={e => setDistributorId(e.target.value)}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit' }}>
          <option value="">Select distributor...</option>
          {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
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
      <Btn v="pri" full disabled={!distributorId || !name}
        onClick={() => onSave({ distributorId, name, coverageDays })}>
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

function ItemOrderSheet({ outlet, beat, mid, products, categories, showToast, onClose, onDone }) {
  const [catFilter, setCatFilter] = useState('all')
  const [cart, setCart] = useState({}) // { product_id: { qty, unit } }
  const [showNoOrder, setShowNoOrder] = useState(false)
  const [noOrderReason, setNoOrderReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  const checkout = async () => {
    if (cartLines.length === 0) { showToast('Add at least one item'); return }
    setSubmitting(true)
    const { data: order, error } = await db.createSecondaryOrder(
      { outlet_id: outlet.id, beat_id: beat.id, distributor_id: beat.distributor_id, member_id: mid },
      cartLines,
    )
    if (error) { showToast('Error saving order'); setSubmitting(false); return }
    const { error: visitError } = await db.createRetailVisit({
      beat_id: beat.id, outlet_id: outlet.id, member_id: mid, outcome: 'order', order_id: order.id,
    })
    setSubmitting(false)
    if (visitError) { showToast('Order saved, but visit log failed'); }
    showToast('Order confirmed')
    onDone()
  }

  const confirmNoOrder = async () => {
    if (!noOrderReason.trim()) { showToast('Enter a reason'); return }
    setSubmitting(true)
    const { error } = await db.createRetailVisit({
      beat_id: beat.id, outlet_id: outlet.id, member_id: mid, outcome: 'no_order', no_order_reason: noOrderReason,
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
              <Btn v="pri" full disabled={submitting} onClick={checkout}>Checkout & Confirm</Btn>
              <Btn full disabled={submitting} onClick={() => setShowNoOrder(true)}>No Order</Btn>
            </div>
          </div>
        </>
      )}
    </Sheet>
  )
}

function DaySummary({ visits, orders, products, onRefresh, showToast }) {
  const productName = pid => (products || []).find(p => p.id === pid)?.name || pid

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
