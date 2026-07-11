import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Tile, Card, CH, Av, GBadge, Bar, Btn } from '../../components/ui.jsx'
import { pct } from '../../lib/achievementEngine.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function Dashboard({ onNavigate }) {
  const { can, hasMenu } = useAuth()
  const { goals, expenses, invoices, members, achievements, params } = useData()

  const pendingGoals = Object.values(goals || {}).filter(g => g.status === 'pending' || g.status === 'partial').length
  const pendingExp   = (expenses || []).filter(e => e.status === 'pending').length
  const totalTarget  = Object.entries(goals || {}).filter(([,g]) => g.status === 'approved').reduce((s,[id,g]) => s + (g.value_goal || 0), 0)
  const totalAch     = Object.values(achievements || {}).reduce((s, a) => s + (a.value || 0), 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        <Tile icon="🎯" label="Approved targets" value={F(totalTarget)} />
        <Tile icon="📈" label="Achieved" value={F(totalAch)} color="#10b981" sub={`${pct(totalAch, totalTarget)}% of target`} />
        {hasMenu('goalApprovals') && <Tile icon="✅" label="Goals pending" value={pendingGoals} color={pendingGoals ? '#f59e0b' : '#10b981'} onClick={() => onNavigate('goalApprovals')} />}
        {hasMenu('expApprovals')  && <Tile icon="💳" label="Expenses pending" value={pendingExp} color={pendingExp ? '#f59e0b' : '#10b981'} onClick={() => onNavigate('expApprovals')} />}
        {hasMenu('invoices')      && <Tile icon="🧾" label="Invoices" value={(invoices || []).length} onClick={() => onNavigate('invoices')} />}
      </div>

      <Card>
        <CH title="Team — goal status" sub="Tap a member for full detail" />
        {(members || []).map(m => {
          const g = (goals || {})[m.id] || { status: 'draft' }
          const a = (achievements || {})[m.id] || { value: 0 }
          const p = (params || {})[m.id] || {}
          const v = g.status === 'approved' ? pct(a.value, g.value_goal || 1) : 0
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <Av av={m.avatar} color={m.color} sz={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                {g.status === 'approved'
                  ? <><div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>{F(a.value)} / {F(g.value_goal || 0)}</div><Bar val={v} /></>
                  : <div style={{ fontSize: 11, color: '#9ca3af' }}>{m.role}</div>
                }
              </div>
              <GBadge status={g.status} />
              {g.status === 'approved' && <span style={{ fontWeight: 700, fontSize: 13, color: v >= 75 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444', marginLeft: 4 }}>{v}%</span>}
            </div>
          )
        })}
      </Card>
    </div>
  )
}
