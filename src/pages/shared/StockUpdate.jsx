import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet } from '../../components/ui.jsx'
import { ISSUE_CATEGORIES, hasAnyIssue, activeIssueFields, labelForField } from '../../lib/productionIssues.js'
import * as db from '../../lib/db.js'

const STATUS_BG = { Available: '#dcfce7', Wait: '#ffedd5', Unavailable: '#fee2e2' }
const STATUS_TEXT = { Available: '#15803d', Wait: '#c2410c', Unavailable: '#b91c1c' }
const STATUSES = ['Available', 'Wait', 'Unavailable']

const fmtTs = ts => ts ? new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function StockUpdate() {
  const { currentUser } = useAuth()
  const { products, setProducts, categories, showToast } = useData()
  const [saving, setSaving] = useState({})
  const [issuesFor, setIssuesFor] = useState(null)

  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'

  const groups = {}
  ;(products || []).forEach(p => {
    const key = categoryName(p.category_id)
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  })

  const setStatus = async (product, status) => {
    setSaving(s => ({ ...s, [product.id]: true }))
    const { data, error } = await db.updateProductStockStatus(product.id, status, currentUser?.id)
    setSaving(s => ({ ...s, [product.id]: false }))
    if (error) { showToast('Error updating status'); return }
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...data } : p))

    // Marking a product Available again means whatever issue caused it to be flagged no longer
    // applies — auto-clear any active 3M reasons and log the resolution timestamp.
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
          🟢 Available — orderable · 🟡 Wait — flagged, still orderable · 🔴 Unavailable — cannot be ordered.
          Status is global across all warehouses and stays as set until you change it again.
        </div>
      </Card>

      {Object.entries(groups).map(([cat, items]) => (
        <Card key={cat}>
          <CH title={cat} sub={`${items.length} product(s)`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Product', 'Status', 'Last Updated', 'Issues'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(p => {
                  const status = p.stock_status || 'Available'
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
                      <td style={{ padding: '8px 10px', fontSize: 11, color: '#9ca3af' }}>{fmtTs(p.stock_status_updated_at)}</td>
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

      {(products || []).length === 0 && (
        <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No products found</div>
      )}

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
    </div>
  )
}
