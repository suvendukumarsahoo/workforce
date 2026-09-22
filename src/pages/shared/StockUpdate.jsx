import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet } from '../../components/ui.jsx'
import { ISSUE_CATEGORIES, hasAnyIssue, activeIssueFields, labelForField } from '../../lib/productionIssues.js'
import * as db from '../../lib/db.js'

const STATUS_BG = { Available: '#dcfce7', Wait: '#ffedd5', Unavailable: '#fee2e2' }
const STATUS_TEXT = { Available: '#15803d', Wait: '#c2410c', Unavailable: '#b91c1c' }
const STATUSES = ['Available', 'Wait', 'Unavailable']
// `loading_stage` values that mean an order has already been physically loaded onto a vehicle —
// see the comment at this constant's usage below for why this, not `load_id`/allocation status,
// is the right cutoff for "Total Picked Qty".
const LOADED_STAGES = ['wm_loaded', 'driver_confirmed']
const selStyle = { padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }

const fmtTs = ts => ts ? new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

// Rolls a product's per-warehouse statuses up into the one flat `products.stock_status` column —
// DistributorOrder.jsx's cart (a rep never picks a warehouse when creating an order — that only
// happens later, at OrderApproval.jsx's advance-to-picking step) still reads that flat column for
// its Available/Wait/Unavailable option styling, unchanged, so it must stay live rather than
// freezing at whatever it last was the moment this screen went warehouse-scoped. Most-permissive-
// wins: if even one warehouse can supply it, a rep shouldn't be blocked from ordering it — which
// specific warehouse fulfills the order isn't decided until later anyway.
function rollupStatus(mapRowsForProduct) {
  if (mapRowsForProduct.some(r => r.stock_status === 'Available')) return 'Available'
  if (mapRowsForProduct.some(r => r.stock_status === 'Wait')) return 'Wait'
  if (mapRowsForProduct.length > 0) return 'Unavailable'
  return null // not mapped anywhere — leave products.stock_status untouched
}

export default function StockUpdate() {
  const { currentUser, role } = useAuth()
  const { products, setProducts, categories, warehouses, showToast } = useData()
  const [saving, setSaving] = useState({})
  const [issuesFor, setIssuesFor] = useState(null)
  const [pickingOrders, setPickingOrders] = useState([])
  const [pickedFor, setPickedFor] = useState(null)
  const [mapRows, setMapRows] = useState([])
  const [adminWarehouseId, setAdminWarehouseId] = useState('')

  const isAdmin = role?.id === 'r1'
  // A Warehouse Manager is hard-scoped to whichever warehouse Employees.jsx has them assigned to
  // (users.warehouse_id) — Admin instead gets a picker, since Admin oversees every warehouse rather
  // than belonging to one.
  const viewerWarehouseId = isAdmin ? adminWarehouseId : (currentUser?.warehouse_id || '')

  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'

  useEffect(() => {
    db.fetchPickingOrders().then(({ data }) => setPickingOrders((data || []).filter(o => !LOADED_STAGES.includes(o.loading_stage))))
    db.fetchProductWarehouseMap().then(({ data }) => setMapRows(data || []))
  }, [])

  // Orders reaching picking from before this shipped never got a warehouse_id (OrderApproval.jsx's
  // advance-to-picking step is the only place it's ever set) — treated as visible at every
  // warehouse rather than silently vanishing from Total Picked Qty for whoever's still working them.
  const scopedPickingOrders = pickingOrders.filter(o => !o.warehouse_id || o.warehouse_id === viewerWarehouseId)

  // Only items WM has actually marked Available count as "picked" — Wait/Unavailable items
  // contributed 0 toward a product's picked quantity (they weren't successfully picked).
  const pickedRowsFor = productId => scopedPickingOrders.flatMap(o =>
    (o.items || [])
      .filter(it => it.product_id === productId && it.availability === 'Available' && !it.cancelled)
      .map(it => ({ orderId: o.id, distributorName: o.distributor?.name || o.distributor_id, qty: it.final_qty }))
  )
  const pickedQtyFor = productId => pickedRowsFor(productId).reduce((s, r) => s + (r.qty || 0), 0)

  // Only products actually mapped to the warehouse in view (Warehouses.jsx's own checklist, or the
  // upsert this screen's own status-setter performs) — an unmapped product has no per-warehouse
  // status to show here at all.
  const rowFor = productId => mapRows.find(r => r.product_id === productId && r.warehouse_id === viewerWarehouseId)
  const mappedProducts = viewerWarehouseId ? (products || []).filter(p => rowFor(p.id)) : []

  const groups = {}
  mappedProducts.forEach(p => {
    const key = categoryName(p.category_id)
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  })

  const setStatus = async (product, status) => {
    setSaving(s => ({ ...s, [product.id]: true }))
    const { data, error } = await db.updateProductWarehouseStatus(product.id, viewerWarehouseId, status, currentUser?.id)
    setSaving(s => ({ ...s, [product.id]: false }))
    if (error) { showToast('Error updating status'); return }

    const nextMapRows = [
      ...mapRows.filter(r => !(r.product_id === product.id && r.warehouse_id === viewerWarehouseId)),
      data,
    ]
    setMapRows(nextMapRows)

    const rolled = rollupStatus(nextMapRows.filter(r => r.product_id === product.id))
    if (rolled) {
      const { data: prodData } = await db.updateProductStockStatus(product.id, rolled, currentUser?.id)
      if (prodData) setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...prodData } : p))
    }

    // Marking a product Available at this warehouse means whatever issue caused it to be flagged
    // no longer applies here — auto-clear any active 3M reasons and log the resolution timestamp.
    // 3M issues stay a global (not per-warehouse) concept — see this file's own module comment in
    // CLAUDE.md — a production problem affects every warehouse alike.
    if (status === 'Available') {
      const fields = activeIssueFields(product)
      if (fields.length) {
        const { data: resolved, error: resolveError } = await db.resolveProductIssues(product.id, fields, currentUser?.id, fields.map(labelForField))
        if (!resolveError && resolved) setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...resolved } : p))
      }
    }
    showToast(`${product.name} marked ${status}`)
  }

  const toggleIssue = async (product, field) => {
    const turningOff = !!product[field]
    const { data, error } = turningOff
      ? await db.resolveProductIssues(product.id, [field], currentUser?.id, [labelForField(field)])
      : await db.updateProductIssues(product.id, { [field]: true }, currentUser?.id)
    if (error) { showToast('Error updating issue'); return }
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...data } : p))
    setIssuesFor(prev => prev && prev.id === product.id ? { ...prev, ...data } : prev)
  }

  return (
    <div>
      <Card style={{ background: '#f9fafb' }}>
        <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>
          🟢 Available — orderable at this warehouse · 🟡 Wait — flagged, still orderable · 🔴 Unavailable — cannot be picked here.
          Status is now per-warehouse; only products mapped to the selected warehouse (via the Warehouses master screen) show up below.
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Warehouse</div>
            <select value={adminWarehouseId} onChange={e => setAdminWarehouseId(e.target.value)} style={selStyle}>
              <option value="">Select warehouse...</option>
              {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </Card>
      )}

      {!isAdmin && !viewerWarehouseId && (
        <Card>
          <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>
            You're not assigned to a warehouse yet — ask an Admin to set it on your profile (Employees screen).
          </div>
        </Card>
      )}

      {viewerWarehouseId && Object.keys(groups).length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>
            No products mapped to this warehouse yet — map some from the Warehouses master screen.
          </div>
        </Card>
      )}

      {Object.entries(groups).map(([cat, items]) => (
        <Card key={cat}>
          <CH title={cat} sub={`${items.length} product(s)`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Product', 'Status', 'Total Picked Qty', 'Last Updated', 'Issues'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(p => {
                  const row = rowFor(p.id)
                  const status = row?.stock_status || 'Available'
                  const pickedQty = pickedQtyFor(p.id)
                  return (
                    <tr key={p.id} style={{ background: STATUS_BG[status], borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <select
                          value={status}
                          disabled={!!saving[p.id]}
                          onChange={e => setStatus(p, e.target.value)}
                          style={{ padding: '5px 7px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, fontWeight: 600, color: STATUS_TEXT[status], background: '#fff' }}
                        >
                          {STATUSES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        {saving[p.id] && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>Saving...</span>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {pickedQty > 0 ? (
                          <button
                            onClick={() => setPickedFor(p)}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {pickedQty}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 11, color: '#9ca3af' }}>{fmtTs(row?.stock_status_updated_at)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <Btn sm v={hasAnyIssue(p) ? 'warn' : 'gh'} onClick={() => setIssuesFor(p)}>
                          {hasAnyIssue(p) ? '⚠ Issues' : 'Add Issue'}
                        </Btn>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {issuesFor && (
        <Sheet title={issuesFor.name} sub="Tick any reason(s) this product currently can't be fully produced/packed" onClose={() => setIssuesFor(null)}>
          {ISSUE_CATEGORIES.map(cat => (
            <div key={cat.key} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{cat.key}</div>
              {cat.reasons.map(r => (
                <label key={r.field} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!issuesFor[r.field]}
                    onChange={() => toggleIssue(issuesFor, r.field)}
                    style={{ width: 16, height: 16 }}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Last updated: {fmtTs(issuesFor.issue_updated_at)}</div>
        </Sheet>
      )}

      {pickedFor && (
        <Sheet title={pickedFor.name} sub="Picked quantity by distributor, not yet loaded onto a vehicle" onClose={() => setPickedFor(null)}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
            Total Picked: {pickedQtyFor(pickedFor.id)}
          </div>
          {pickedRowsFor(pickedFor.id).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.distributorName}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Order #{r.orderId}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', flexShrink: 0 }}>{r.qty}</div>
            </div>
          ))}
        </Sheet>
      )}
    </div>
  )
}
