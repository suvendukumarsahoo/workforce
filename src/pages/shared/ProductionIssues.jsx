import { useState, useEffect } from 'react'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH } from '../../components/ui.jsx'
import { ISSUE_CATEGORIES, hasAnyIssue } from '../../lib/productionIssues.js'
import * as db from '../../lib/db.js'

const fmtTs = ts => ts ? new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const TABS = [
  { key: 'item', label: 'Itemwise' },
  { key: 'issue', label: 'Issuewise' },
  { key: 'resolved', label: 'Resolved' },
]

export default function ProductionIssues() {
  const { products, categories } = useData()
  const [view, setView] = useState('item')
  const [resolutions, setResolutions] = useState([])
  const [resolutionsLoaded, setResolutionsLoaded] = useState(false)

  useEffect(() => {
    if (view !== 'resolved' || resolutionsLoaded) return
    db.fetchProductIssueResolutions().then(({ data }) => {
      setResolutions(data || [])
      setResolutionsLoaded(true)
    })
  }, [view, resolutionsLoaded])

  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'
  const flagged = (products || []).filter(hasAnyIssue)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setView(t.key)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: view === t.key ? '#2563eb' : '#f3f4f6', color: view === t.key ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>

      {view !== 'resolved' && flagged.length === 0 && (
        <Card><div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No active production issues</div></Card>
      )}

      {view === 'item' && flagged.map(p => (
        <Card key={p.id}>
          <CH title={p.name} sub={categoryName(p.category_id)} />
          <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ISSUE_CATEGORIES.flatMap(c => c.reasons).filter(r => p[r.field]).map(r => (
              <span key={r.field} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>{r.label}</span>
            ))}
          </div>
          <div style={{ padding: '0 12px 10px', fontSize: 11, color: '#9ca3af' }}>Updated {fmtTs(p.issue_updated_at)}</div>
        </Card>
      ))}

      {view === 'issue' && ISSUE_CATEGORIES.map(cat => (
        <Card key={cat.key}>
          <CH title={cat.key} />
          {cat.reasons.map(r => {
            const affected = flagged.filter(p => p[r.field])
            return (
              <div key={r.field} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                  {r.label} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({affected.length})</span>
                </div>
                {affected.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af' }}>None</div>}
                {affected.map(p => (
                  <div key={p.id} style={{ fontSize: 12, padding: '3px 0' }}>{p.name} <span style={{ color: '#9ca3af', fontSize: 11 }}>· {categoryName(p.category_id)}</span></div>
                ))}
              </div>
            )
          })}
        </Card>
      ))}

      {view === 'resolved' && (
        <Card>
          <CH title="Recently Resolved" sub={`Last ${resolutions.length} resolution(s)`} />
          {resolutionsLoaded && resolutions.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No resolutions yet</div>
          )}
          {resolutions.map(r => (
            <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.product?.name || r.product_id} <span style={{ fontWeight: 400, color: '#6b7280' }}>— {r.reason_label}</span></div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                Resolved {fmtTs(r.resolved_at)}{r.resolver?.name ? ` by ${r.resolver.name}` : ''}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
