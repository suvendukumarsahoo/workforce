import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Btn, Inp, Bar, GBadge, SBadge, AttCal, Sheet } from '../../components/ui.jsx'
import { pct } from '../../lib/achievementEngine.js'
import * as db from '../../lib/db.js'
import { getGoalOverallStatus } from '../../lib/achievementEngine.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const netS = s => (s.basic||0)+(s.hra||0)+(s.ta||0)+(s.da||0)-(s.pf||0)-(s.tds||0)

export default function TeamApp() {
  const { currentUser, logout, hasMenu } = useAuth()
  const { params, goals, setGoals, achievements, expenses, setExpenses, attendance, salaries, products, categories, customers, showToast } = useData()

  const [tab, setTab]           = useState('dashboard')
  const [showGoalEntry, setShowGoalEntry] = useState(false)
  const [showExpForm, setShowExpForm]     = useState(false)
  const [expForm, setExpForm]             = useState({ cat: 'Travel', desc: '', amt: '' })

  const mid  = currentUser?.member_id
  const p    = (params || {})[mid] || {}
  const g    = (goals  || {})[mid] || { status: 'draft' }
  const a    = (achievements || {})[mid] || { value: 0, custs: {}, prods: {}, cats: {} }
  const sal  = (salaries || []).find(s => s.member_id === mid)
  const myExp = (expenses || []).filter(e => e.member_id === mid)
  const spent = myExp.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0)

  const overallStatus = getGoalOverallStatus(g)
  const hasRejected   = overallStatus === 'partial' || overallStatus === 'rejected'
  const canEnter      = overallStatus === 'draft' || hasRejected
  const approvedVal   = g.value_status === 'approved' ? (g.value_goal || 0) : 0
  const valPct        = approvedVal ? pct(a.value, approvedVal) : 0

  const getAtt = () => {
    const days = (attendance || []).filter(x => x.member_id === mid)
    return {
      present: days.filter(d => d.status === 'P').length,
      absent:  days.filter(d => d.status === 'A').length,
      half:    days.filter(d => d.status === 'H').length,
      days:    Array.from({ length: 27 }, (_, i) => { const d = days.find(x => new Date(x.date).getDate() === i + 1); return d ? d.status : 'W' }),
    }
  }
  const att = getAtt()
  const attRate = Math.round(att.present / 26 * 100)

  const submitGoal = async (memberId, draft) => {
    const existing = (goals || {})[memberId] || {}
    const now      = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const updated  = {
      ...existing,
      value_goal:   Number(draft.value?.goal) || existing.value_goal,
      value_status: 'pending',
      customers:    { ...(existing.customers || {}), ...Object.fromEntries(Object.entries(draft.custs || {}).map(([id, v]) => [id, { goal: Number(v.goal), status: 'pending' }])) },
      products:     { ...(existing.products || {}),  ...Object.fromEntries(Object.entries(draft.prods || {}).map(([id, v]) => [id, { goal: Number(v.goal), status: 'pending' }])) },
      categories:   { ...(existing.categories || {}), ...Object.fromEntries(Object.entries(draft.cats || {}).map(([id, v])  => [id, { goal: Number(v.goal), status: 'pending' }])) },
      visits_goal:  Number(draft.visits?.goal) || existing.visits_goal,
      visits_status:'pending',
      acq_goal:     Number(draft.acq?.goal)    || existing.acq_goal,
      acq_status:   'pending',
      submitted_at: now,
      status:       'pending',
    }
    const { error } = await db.upsertGoal(memberId, updated)
    if (error) { showToast('Error submitting goals'); return }
    setGoals(prev => ({ ...prev, [memberId]: updated }))
    setShowGoalEntry(false)
    showToast('Goals submitted for manager approval')
  }

  const submitExp = async () => {
    if (!expForm.desc || !expForm.amt) return
    const payload = { member_id: mid, category: expForm.cat, description: expForm.desc, amount: Number(expForm.amt), date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), status: 'pending' }
    const { data, error } = await db.createExpense(payload)
    if (error) { showToast('Error submitting expense'); return }
    setExpenses(prev => [{ ...payload, id: data?.id || Date.now(), member: currentUser }, ...prev])
    setExpForm({ cat: 'Travel', desc: '', amt: '' })
    setShowExpForm(false)
    showToast('Expense submitted for approval')
  }

  const TABS = [
    hasMenu('dashboard')    && { id: 'dashboard',    icon: '🏠', label: 'Home'     },
    hasMenu('myGoals')      && { id: 'myGoals',      icon: '🎯', label: 'Goals'    },
    hasMenu('myExpenses')   && { id: 'myExpenses',   icon: '💳', label: 'Expenses' },
    hasMenu('myAttendance') && { id: 'myAttendance', icon: '📅', label: 'Attend.'  },
    hasMenu('mySalary')     && { id: 'mySalary',     icon: '💰', label: 'Salary'   },
  ].filter(Boolean)

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 72, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      {showGoalEntry && (
        <GoalEntrySheet member={currentUser} param={p} goal={g} products={products} categories={categories} customers={customers} onSubmit={submitGoal} onClose={() => setShowGoalEntry(false)} />
      )}

      {/* Header */}
      <div style={{ background: '#0f172a', color: '#fff', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{currentUser?.name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Sales Team</div>
        </div>
        <Btn sm onClick={logout} style={{ background: '#1e293b', color: '#fff', border: 'none' }}>Logout</Btn>
      </div>

      <div style={{ padding: 14 }}>

        {/* Goal status banner */}
        {canEnter && (
          <Card style={{ background: hasRejected ? '#fef2f2' : '#eff6ff', border: `1px solid ${hasRejected ? '#fecaca' : '#bfdbfe'}` }}>
            <div style={{ padding: 14 }}>
              {hasRejected && <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>Some goals were rejected by your manager — please revise and resubmit.</div>}
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{hasRejected ? 'Revise rejected goals' : "You haven't set your goals yet"}</div>
              <Btn v="pri" full onClick={() => setShowGoalEntry(true)}>{hasRejected ? 'Revise & resubmit' : 'Set my goals'}</Btn>
            </div>
          </Card>
        )}
        {overallStatus === 'pending' && (
          <Card style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
            <div style={{ padding: 12, fontSize: 13, color: '#92400e' }}>⏳ Goals submitted — waiting for manager review.</div>
          </Card>
        )}

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {[['My target', approvedVal ? F(approvedVal) : '—', '#2563eb'], ['Achieved', approvedVal ? F(a.value) : '—', '#10b981'], ['Progress', approvedVal ? valPct + '%' : '—', valPct >= 75 ? '#10b981' : valPct >= 50 ? '#f59e0b' : '#ef4444'], ['Goal status', overallStatus.toUpperCase(), '#374151']].map(([l, v, c]) => (
                <div key={l} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{l}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: c }}>{v}</div>
                </div>
              ))}
            </div>
            {approvedVal > 0 && <><Bar val={valPct} /><div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, marginBottom: 14, textAlign: 'right' }}>{valPct}% vs approved target</div></>}
            <Card>
              <CH title="Attendance" sub={new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
              <div style={{ padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
                  {[['P', att.present, '#10b981'], ['A', att.absent, '#ef4444'], ['H', att.half, '#f59e0b'], ['Rate', attRate + '%', attRate >= 90 ? '#10b981' : attRate >= 75 ? '#f59e0b' : '#ef4444']].map(([l, v, c]) => (
                    <div key={l} style={{ textAlign: 'center' }}><div style={{ fontSize: 9, color: '#6b7280' }}>{l}</div><div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div></div>
                  ))}
                </div>
                <AttCal days={att.days} />
              </div>
            </Card>
          </>
        )}

        {/* MY GOALS */}
        {tab === 'myGoals' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <GBadge status={overallStatus} />
              {canEnter && <Btn v="pri" sm onClick={() => setShowGoalEntry(true)}>{hasRejected ? 'Revise' : 'Set goals'}</Btn>}
            </div>

            {/* Value goal */}
            {p.enable_value && g.value_goal > 0 && (
              <Card>
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Sales value</span>
                    <GBadge status={g.value_status || 'draft'} />
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: g.value_status === 'approved' ? 6 : 0 }}>Goal: {F(g.value_goal)} {g.value_status === 'approved' && `· Achieved: ${F(a.value)}`}</div>
                  {g.value_status === 'rejected' && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>❌ {g.value_note}</div>}
                  {g.value_status === 'approved' && <Bar val={pct(a.value, g.value_goal)} />}
                </div>
              </Card>
            )}

            {/* Product goals */}
            {p.enable_products && (p.sel_prods || []).map(pid => {
              const prod = (products || []).find(x => x.id === pid); if (!prod) return null
              const fg   = (g.products || {})[pid]
              const done = (a.prods || {})[pid] || 0
              return (
                <Card key={pid}>
                  <div style={{ padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{prod.name}</span>
                      <GBadge status={fg?.status || 'draft'} />
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: fg?.status === 'approved' ? 6 : 0 }}>Goal: {fg?.goal || '—'} {prod.unit} {fg?.status === 'approved' && `· Done: ${done}`}</div>
                    {fg?.status === 'rejected' && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>❌ {fg.note}</div>}
                    {fg?.status === 'approved' && <Bar val={pct(done, fg.goal)} />}
                  </div>
                </Card>
              )
            })}

            {/* Category goals */}
            {p.enable_categories && (p.sel_cats || []).map(cid => {
              const cat  = (categories || []).find(x => x.id === cid); if (!cat) return null
              const fg   = (g.categories || {})[cid]
              const done = (a.cats || {})[cid] || 0
              return (
                <Card key={cid}>
                  <div style={{ padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
                      <GBadge status={fg?.status || 'draft'} />
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: fg?.status === 'approved' ? 6 : 0 }}>Goal: {fg?.goal || '—'} {cat.unit} {fg?.status === 'approved' && `· Done: ${done}`}</div>
                    {fg?.status === 'rejected' && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>❌ {fg.note}</div>}
                    {fg?.status === 'approved' && <Bar val={pct(done, fg.goal)} />}
                  </div>
                </Card>
              )
            })}

            {/* Customer goals */}
            {p.enable_customers && (p.sel_custs || []).map(cid => {
              const cust = (customers || []).find(x => x.id === cid); if (!cust) return null
              const fg   = (g.customers || {})[cid]
              const done = (a.custs || {})[cid] || 0
              return (
                <Card key={cid}>
                  <div style={{ padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{cust.name}</span>
                      <GBadge status={fg?.status || 'draft'} />
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Goal: {fg ? F(fg.goal) : '—'} {fg?.status === 'approved' && `· Done: ${F(done)}`}</div>
                    {fg?.status === 'rejected' && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>❌ {fg.note}</div>}
                  </div>
                </Card>
              )
            })}
          </>
        )}

        {/* MY EXPENSES */}
        {tab === 'myExpenses' && (
          <>
            <Btn v="pri" full onClick={() => setShowExpForm(!showExpForm)} style={{ marginBottom: 12 }}>{showExpForm ? 'Cancel' : '+ New expense claim'}</Btn>
            {showExpForm && (
              <Card>
                <div style={{ padding: 14 }}>
                  <Inp label="Category" value={expForm.cat} onChange={v => setExpForm(f => ({ ...f, cat: v }))} options={['Travel', 'Entertainment', 'Hotel', 'Medical', 'Fuel', 'Misc']} />
                  <Inp label="Description" value={expForm.desc} onChange={v => setExpForm(f => ({ ...f, desc: v }))} placeholder="What is this for?" />
                  <Inp label="Amount (₹)" type="number" value={expForm.amt} onChange={v => setExpForm(f => ({ ...f, amt: v }))} placeholder="0" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn v="pri" full onClick={submitExp}>Submit</Btn>
                    <Btn full onClick={() => setShowExpForm(false)}>Cancel</Btn>
                  </div>
                </div>
              </Card>
            )}
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Budget: {F(p.exp_budget || 0)} · Spent: {F(spent)}</div>
            {myExp.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No expenses yet</div>}
            {myExp.map(e => (
              <Card key={e.id}>
                <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{e.description}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{e.category} · {e.date}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>{F(e.amount)}</div>
                    <SBadge s={e.status} />
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}

        {/* MY ATTENDANCE */}
        {tab === 'myAttendance' && (
          <Card>
            <CH title="Attendance" sub={new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
            <div style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
                {[['Present', att.present, '#10b981'], ['Absent', att.absent, '#ef4444'], ['Half', att.half, '#f59e0b'], ['Rate', attRate + '%', '#374151']].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: 'center' }}><div style={{ fontSize: 9, color: '#6b7280' }}>{l}</div><div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div></div>
                ))}
              </div>
              <AttCal days={att.days} />
            </div>
          </Card>
        )}

        {/* MY SALARY */}
        {tab === 'mySalary' && sal && (
          <Card>
            <CH title="Salary" sub={new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} right={<span style={{ fontWeight: 700, color: '#10b981', fontSize: 15 }}>{F(netS(sal))}</span>} />
            <div style={{ padding: 14 }}>
              {[['Basic', sal.basic, false], ['HRA', sal.hra, false], ['TA', sal.ta, false], ['DA', sal.da, false], ['PF', sal.pf, true], ['TDS', sal.tds, true]].map(([k, v, ded]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>{k}</span>
                  <span style={{ color: ded ? '#ef4444' : '#374151', fontWeight: 500 }}>{ded ? '– ' : ''}{F(v)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', zIndex: 50 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', color: tab === t.id ? '#2563eb' : '#9ca3af', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 20 }}>{t.icon}</div>
            <div style={{ fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function GoalEntrySheet({ member, param, goal, products, categories, customers, onSubmit, onClose }) {
  const g        = goal || {}
  const canEdit  = s => !s || s === 'draft' || s === 'rejected'
  const [d, setD] = useState({
    value:  { goal: g.value_goal || '' },
    custs:  Object.fromEntries((param.sel_custs || []).map(id => [id, { goal: (g.customers || {})[id]?.goal || '' }])),
    prods:  Object.fromEntries((param.sel_prods || []).map(id => [id, { goal: (g.products  || {})[id]?.goal || '' }])),
    cats:   Object.fromEntries((param.sel_cats  || []).map(id => [id, { goal: (g.categories|| {})[id]?.goal || '' }])),
    visits: { goal: g.visits_goal || '' },
    acq:    { goal: g.acq_goal    || '' },
  })

  const Wrap = ({ fg, children }) => canEdit(fg?.status) ? (
    <div style={{ background: fg?.status === 'rejected' ? '#fef2f2' : '#f9fafb', border: `1px solid ${fg?.status === 'rejected' ? '#fecaca' : 'transparent'}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
      {fg?.status === 'rejected' && <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 8 }}>❌ Manager note: {fg.note}</div>}
      {children}
    </div>
  ) : null

  return (
    <Sheet title="Set my goals" sub="Enter your goal values for each parameter" onClose={onClose}>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#1e40af' }}>
        Once submitted, goals are locked. If manager rejects specific fields, only those will be unlocked for revision.
      </div>

      {param.enable_value && (
        <Wrap fg={{ goal: g.value_goal, status: g.value_status, note: g.value_note }}>
          <Inp label="Sales value goal (₹)" type="number" value={d.value.goal} onChange={v => setD(x => ({ ...x, value: { goal: v } }))} placeholder="e.g. 1100000" req />
        </Wrap>
      )}

      {param.enable_customers && (param.sel_custs || []).map(id => {
        const c  = (customers || []).find(x => x.id === id); if (!c) return null
        const fg = (g.customers || {})[id]
        return (
          <Wrap key={id} fg={fg}>
            <Inp label={`${c.name} — value goal (₹)`} type="number" value={d.custs[id]?.goal || ''} onChange={v => setD(x => ({ ...x, custs: { ...x.custs, [id]: { goal: v } } }))} req />
          </Wrap>
        )
      })}

      {param.enable_products && (param.sel_prods || []).map(id => {
        const p  = (products || []).find(x => x.id === id); if (!p) return null
        const fg = (g.products || {})[id]
        return (
          <Wrap key={id} fg={fg}>
            <Inp label={`${p.name} — qty goal (${p.unit})`} type="number" value={d.prods[id]?.goal || ''} onChange={v => setD(x => ({ ...x, prods: { ...x.prods, [id]: { goal: v } } }))} req />
          </Wrap>
        )
      })}

      {param.enable_categories && (param.sel_cats || []).map(id => {
        const c  = (categories || []).find(x => x.id === id); if (!c) return null
        const fg = (g.categories || {})[id]
        return (
          <Wrap key={id} fg={fg}>
            <Inp label={`${c.name} — qty goal (${c.unit})`} type="number" value={d.cats[id]?.goal || ''} onChange={v => setD(x => ({ ...x, cats: { ...x.cats, [id]: { goal: v } } }))} req />
          </Wrap>
        )
      })}

      {param.enable_visits && (
        <Wrap fg={{ goal: g.visits_goal, status: g.visits_status, note: g.visits_note }}>
          <Inp label="Outlet visits goal" type="number" value={d.visits.goal} onChange={v => setD(x => ({ ...x, visits: { goal: v } }))} req />
        </Wrap>
      )}

      {param.enable_acq && (
        <Wrap fg={{ goal: g.acq_goal, status: g.acq_status, note: g.acq_note }}>
          <Inp label="New customer acquisition goal" type="number" value={d.acq.goal} onChange={v => setD(x => ({ ...x, acq: { goal: v } }))} req />
        </Wrap>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn v="pri" full onClick={() => onSubmit(member?.member_id, d)}>Submit for approval</Btn>
        <Btn full onClick={onClose}>Cancel</Btn>
      </div>
    </Sheet>
  )
}
