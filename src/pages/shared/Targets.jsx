import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Bar, GBadge, Sheet } from '../../components/ui.jsx'
import { pct } from '../../lib/achievementEngine.js'
import { useState } from 'react'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function Targets() {
const { members, goals, achievements, params, products, categories } = useData()
const [drill, setDrill] = useState(null)

  return (
    <div>
      {drill && <DrillSheet member={drill} goals={goals} achievements={achievements} params={params} products={products} categories={categories} customers={customers} onClose={() => setDrill(null)} />}
      <Card>
        <CH title="Approved targets" sub="Achievement measured only vs approved goals — from invoices" />
        {(members || []).map(m => {
          const g  = (goals || {})[m.id] || { status: 'draft' }
          const a  = (achievements || {})[m.id] || { value: 0 }
          const ok = g.status === 'approved'
          const v  = ok ? pct(a.value, g.value_goal || 1) : 0
          return (
            <div key={m.id} onClick={() => setDrill(m)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <Av av={m.avatar} color={m.color} sz={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                {ok
                  ? <><div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>{F(a.value)} / {F(g.value_goal || 0)}</div><Bar val={v} /></>
                  : <GBadge status={g.status} />
                }
              </div>
              {ok && <span style={{ fontWeight: 700, fontSize: 13, color: v >= 75 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444', marginLeft: 8 }}>{v}%</span>}
            </div>
          )
        })}
      </Card>
    </div>
  )
}

function DrillSheet({ member, goals, achievements, params, products, categories, customers, onClose }) {
  const [tab, setTab] = useState('overview')
  const g  = (goals || {})[member.id] || { status: 'draft' }
  const a  = (achievements || {})[member.id] || { value: 0, custs: {}, prods: {}, cats: {} }
  const p  = (params || {})[member.id] || {}
  const ok = g.status === 'approved'
  const TABS = ['overview', 'products', 'categories', 'customers']

  return (
    <Sheet title={member.name} sub={member.role} onClose={onClose}>
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 14 }}>
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', background: tab === t ? '#2563eb' : '#f3f4f6', color: tab === t ? '#fff' : '#374151', fontSize: 11, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', textTransform: 'capitalize' }}>{t}</button>)}
      </div>

      {tab === 'overview' && (
        <>
          {!ok && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12, color: '#92400e' }}>Achievement tracking starts only after goal is approved.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[['Target', ok ? F(g.value_goal || 0) : '—', '#2563eb'], ['Achieved', ok ? F(a.value) : '—', '#10b981'], ['Progress', ok ? pct(a.value, g.value_goal || 1) + '%' : '—', '#374151']].map(([l, v, c]) => (
              <div key={l} style={{ background: '#f9fafb', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#6b7280' }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          {ok && <Bar val={pct(a.value, g.value_goal || 1)} />}
        </>
      )}

      {tab === 'products' && (p.sel_prods || []).map(pid => {
        const prod = (products || []).find(x => x.id === pid); if (!prod) return null
        const fg   = (g.products || {})[pid]
        const done = ok ? ((a.prods || {})[pid] || 0) : 0
        const p2   = fg?.status === 'approved' ? pct(done, fg.goal || 1) : 0
        return (
          <div key={pid} style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{prod.name}</span>
              <GBadge status={fg?.status || 'draft'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: fg?.status === 'approved' ? 6 : 0 }}>
              <div style={{ background: '#fff', borderRadius: 8, padding: '6px 8px' }}><div style={{ fontSize: 9, color: '#9ca3af' }}>Goal</div><div style={{ fontWeight: 700 }}>{fg?.goal || 0} {prod.unit}</div></div>
              <div style={{ background: '#fff', borderRadius: 8, padding: '6px 8px' }}><div style={{ fontSize: 9, color: '#9ca3af' }}>Done</div><div style={{ fontWeight: 700, color: '#10b981' }}>{ok ? done : '—'} {prod.unit}</div></div>
            </div>
            {fg?.status === 'approved' && <Bar val={p2} />}
          </div>
        )
      })}

      {tab === 'categories' && (p.sel_cats || []).map(cid => {
        const cat  = (categories || []).find(x => x.id === cid); if (!cat) return null
        const fg   = (g.categories || {})[cid]
        const done = ok ? ((a.cats || {})[cid] || 0) : 0
        const p2   = fg?.status === 'approved' ? pct(done, fg.goal || 1) : 0
        return (
          <div key={cid} style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{cat.name}</span>
              <GBadge status={fg?.status || 'draft'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: fg?.status === 'approved' ? 6 : 0 }}>
              <div style={{ background: '#fff', borderRadius: 8, padding: '6px 8px' }}><div style={{ fontSize: 9, color: '#9ca3af' }}>Goal</div><div style={{ fontWeight: 700 }}>{fg?.goal || 0} {cat.unit}</div></div>
              <div style={{ background: '#fff', borderRadius: 8, padding: '6px 8px' }}><div style={{ fontSize: 9, color: '#9ca3af' }}>Done</div><div style={{ fontWeight: 700, color: '#10b981' }}>{ok ? done : '—'} {cat.unit}</div></div>
            </div>
            {fg?.status === 'approved' && <Bar val={p2} />}
          </div>
        )
      })}

      {tab === 'customers' && (p.sel_custs || []).map(cid => {
        const cust = (customers || []).find(x => x.id === cid); if (!cust) return null
        const fg   = (g.customers || {})[cid]
        const done = ok ? ((a.custs || {})[cid] || 0) : 0
        return (
          <div key={cid} style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{cust.name}</span>
              <GBadge status={fg?.status || 'draft'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={{ background: '#fff', borderRadius: 8, padding: '6px 8px' }}><div style={{ fontSize: 9, color: '#9ca3af' }}>Goal</div><div style={{ fontWeight: 700 }}>{fg ? F(fg.goal || 0) : '—'}</div></div>
              <div style={{ background: '#fff', borderRadius: 8, padding: '6px 8px' }}><div style={{ fontSize: 9, color: '#9ca3af' }}>Done</div><div style={{ fontWeight: 700, color: '#10b981' }}>{ok ? F(done) : '—'}</div></div>
            </div>
          </div>
        )
      })}
    </Sheet>
  )
}
