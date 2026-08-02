import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Bar, GBadge } from '../../components/ui.jsx'
import { pct } from '../../lib/achievementEngine.js'
import { useState } from 'react'
import MemberGoalDetail from '../../components/MemberGoalDetail.jsx'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function Targets() {
const { members, goals, achievements, params, products, categories, distributors: customers } = useData()
const [drill, setDrill] = useState(null)

  return (
    <div>
      {drill && (
        <MemberGoalDetail
          member={drill}
          slices={[{ goalsMap: goals, paramsMap: params, achievementsMap: achievements, weight: 1 }]}
          products={products} categories={categories} customers={customers}
          onClose={() => setDrill(null)}
        />
      )}
      <Card>
        <CH title="Approved targets" sub="This month — achievement measured only vs approved goals, from invoices" />
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
