import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Tile, Card, CH, Av, GBadge, Bar, Btn, Sheet } from '../../components/ui.jsx'
import { pct } from '../../lib/achievementEngine.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function Dashboard({ onNavigate }) {
  const { can, hasMenu } = useAuth()
  const { goals, expenses, invoices, members, achievements, params, products, categories, customers, attendance } = useData()
  const [selectedMember, setSelectedMember] = useState(null)

  const pendingGoals = Object.values(goals || {}).filter(g => g.status === 'pending' || g.status === 'partial').length
  const pendingExp   = (expenses || []).filter(e => e.status === 'pending').length
  const totalTarget  = Object.entries(goals || {}).filter(([,g]) => g.status === 'approved').reduce((s,[id,g]) => s + (g.value_goal || 0), 0)
  const totalAch     = Object.values(achievements || {}).reduce((s, a) => s + (a.value || 0), 0)

  return (
    <div>
      {selectedMember && (
        <MemberDetailSheet
          member={selectedMember}
          goal={(goals || {})[selectedMember.id] || { status: 'draft' }}
          achievement={(achievements || {})[selectedMember.id] || { value: 0, prods: {}, cats: {}, custs: {} }}
          param={(params || {})[selectedMember.id] || {}}
          products={products}
          categories={categories}
          customers={customers}
          expenses={(expenses || []).filter(e => e.member_id === selectedMember.id)}
          attendance={(attendance || []).filter(a => a.member_id === selectedMember.id)}
          onClose={() => setSelectedMember(null)}
        />
      )}

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
              onClick={() => setSelectedMember(m)}
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

function MemberDetailSheet({ member, goal, achievement, param, products, categories, customers, expenses, attendance, onClose }) {
  const g = goal || {}
  const a = achievement || {}
  const p = param || {}
  const totalExp = (expenses || []).filter(e => e.status === 'approved').reduce((s, e) => s + (e.amount || 0), 0)
  const present  = (attendance || []).filter(x => x.status === 'P').length
  const absent   = (attendance || []).filter(x => x.status === 'A').length

  return (
    <Sheet title={member.name} sub={member.role} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Goal status</div>
          <GBadge status={g.status || 'draft'} />
        </div>
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Attendance</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{present}P / {absent}A</div>
        </div>
      </div>

      {p.enable_value && g.value_goal > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Sales value</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{F(a.value)} / {F(g.value_goal)}</div>
          {g.status === 'approved' && <Bar val={pct(a.value, g.value_goal)} />}
        </div>
      )}

      {p.enable_products && (p.sel_prods || []).map(pid => {
        const prod = (products || []).find(x => x.id === pid); if (!prod) return null
        const fg = (g.products || {})[pid]
        const done = (a.prods || {})[pid] || 0
        return (
          <div key={pid} style={{ marginBottom: 10, background: '#f9fafb', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{prod.name}</span>
              <GBadge status={fg?.status || 'draft'} />
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Goal: {fg?.goal || '—'} {prod.unit} · Done: {done}</div>
          </div>
        )
      })}

      {p.enable_categories && (p.sel_cats || []).map(cid => {
        const cat = (categories || []).find(x => x.id === cid); if (!cat) return null
        const fg = (g.categories || {})[cid]
        const done = (a.cats || {})[cid] || 0
        return (
          <div key={cid} style={{ marginBottom: 10, background: '#f9fafb', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
              <GBadge status={fg?.status || 'draft'} />
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Goal: {fg?.goal || '—'} {cat.unit} · Done: {done}</div>
          </div>
        )
      })}

      {p.enable_customers && (p.sel_custs || []).map(cid => {
        const cust = (customers || []).find(x => x.id === cid); if (!cust) return null
        const fg = (g.customers || {})[cid]
        const done = (a.custs || {})[cid] || 0
        return (
          <div key={cid} style={{ marginBottom: 10, background: '#f9fafb', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{cust.name}</span>
              <GBadge status={fg?.status || 'draft'} />
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Goal: {fg ? F(fg.goal) : '—'} · Done: {F(done)}</div>
          </div>
        )
      })}

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Expenses (approved)</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{F(totalExp)} total across {(expenses || []).length} claims</div>
      </div>

      <Btn full onClick={onClose}>Close</Btn>
    </Sheet>
  )
}