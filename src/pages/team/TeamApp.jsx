import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Btn, Inp, Bar, GBadge, SBadge, AttCal, Sheet } from '../../components/ui.jsx'
import { pct } from '../../lib/achievementEngine.js'
import * as db from '../../lib/db.js'
import NewCustomerVisit from '../shared/NewCustomerVisit.jsx'
import { getGoalOverallStatus } from '../../lib/achievementEngine.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const netS = s => (s.basic||0)+(s.hra||0)+(s.ta||0)+(s.da||0)-(s.pf||0)-(s.tds||0)

export default function TeamApp() {
  const { currentUser, logout, hasMenu } = useAuth()
  const { params, goals, setGoals, achievements, expenses, setExpenses, attendance, salaries, products, categories, distributors: customers, visits, showToast, loadAll } = useData()
  const [tab, setTab]           = useState('dashboard')
  const [showGoalEntry, setShowGoalEntry] = useState(false)
  const [showExpForm, setShowExpForm]     = useState(false)
  const [expForm, setExpForm]             = useState({ cat: 'Travel', desc: '', amt: '' })
  const [showMore, setShowMore] = useState(false)
  const [selectedStage, setSelectedStage] = useState(null)
  const [selectedLead, setSelectedLead]   = useState(null)
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
    
    // Helper: preserve status if value unchanged, else set to pending
    const mergeFieldStatus = (newGoal, existingVal, existingField) => {
      const newVal = Number(newGoal) || 0
      const oldVal = Number(existingField?.goal) || Number(existingVal) || 0
      if (newVal === oldVal && existingField?.status) return existingField
      return { goal: newVal, status: 'pending' }
    }
    
    const updated  = {
      ...existing,
      value_goal:   Number(draft.value?.goal) || existing.value_goal,
      value_status: Number(draft.value?.goal) !== Number(existing.value_goal) ? 'pending' : (existing.value_status || 'pending'),
      customers:    { ...(existing.customers || {}), ...Object.fromEntries(Object.entries(draft.custs || {}).map(([id, v]) => [id, mergeFieldStatus(v.goal, existing.value_goal, (existing.customers || {})[id])])) },
      products:     { ...(existing.products || {}),  ...Object.fromEntries(Object.entries(draft.prods || {}).map(([id, v]) => [id, mergeFieldStatus(v.goal, existing.value_goal, (existing.products || {})[id])])) },
      categories:   { ...(existing.categories || {}), ...Object.fromEntries(Object.entries(draft.cats || {}).map(([id, v]) => [id, mergeFieldStatus(v.goal, existing.value_goal, (existing.categories || {})[id])])) },
      visits_goal:  Number(draft.visits?.goal) || existing.visits_goal,
      visits_status: Number(draft.visits?.goal) !== Number(existing.visits_goal) ? 'pending' : (existing.visits_status || 'pending'),
      acq_goal:     Number(draft.acq?.goal)    || existing.acq_goal,
      acq_status:   Number(draft.acq?.goal) !== Number(existing.acq_goal) ? 'pending' : (existing.acq_status || 'pending'),
      submitted_at: now,
      status:       'pending',
    }
    const { error } = await db.upsertGoal(memberId, updated)
    if (error) { showToast('Error submitting goals'); return }
    setGoals(prev => ({ ...prev, [memberId]: updated }))
    await loadAll()
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
    await loadAll()
    setShowExpForm(false)
    showToast('Expense submitted for approval')
  }

  const MORE_ITEMS = [
    hasMenu('newCustomerVisit') && { id: 'newCustomerVisit', icon: '🚶', label: 'New Customer Visit' },
  ].filter(Boolean)

  const TABS = [
    hasMenu('dashboard')    && { id: 'dashboard',    icon: '🏠', label: 'Home'     },
    hasMenu('myGoals')      && { id: 'myGoals',      icon: '🎯', label: 'Goals'    },
    hasMenu('myExpenses')   && { id: 'myExpenses',   icon: '💳', label: 'Expenses' },
    hasMenu('myAttendance') && { id: 'myAttendance', icon: '📅', label: 'Attend.'  },
    hasMenu('mySalary')     && { id: 'mySalary',     icon: '💰', label: 'Salary'   },
    MORE_ITEMS.length > 0   && { id: '__more',        icon: '☰', label: 'More'     },
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
        {(() => {
              const myVisits = (visits || []).filter(v => v.member_id === mid)
              const myLeads = (customers || []).filter(d => (d.assignedTo || []).includes(mid) && d.type === 'New Customer')
              const stageCounts = { interested: 0, not_interested: 0, final: 0 }
              myLeads.forEach(d => {
                if (d.lead_stage === 'interested') stageCounts.interested++
                else if (d.lead_stage === 'not_interested') stageCounts.not_interested++
                else if (d.lead_stage === 'final_pending' || d.lead_stage === 'final_approved') stageCounts.final++
              })
              return (
                <Card style={{ marginBottom: 12 }}>
                  <CH title="My New Customer Visits" sub={`${myVisits.length} total visits logged — tap a stage to view leads`} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: 14 }}>
                    {[['interested', 'Interested', stageCounts.interested, '#2563eb'], ['not_interested', 'Not Interested', stageCounts.not_interested, '#ef4444'], ['final', 'Final', stageCounts.final, '#10b981']].map(([key, l, v, c]) => (
                      <div key={key} onClick={() => setSelectedStage(key)} style={{ textAlign: 'center', cursor: 'pointer', padding: '6px 4px', borderRadius: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <div style={{ fontSize: 9, color: '#6b7280' }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })()}

            {selectedStage && (
              <LeadListSheet
                stage={selectedStage}
                leads={(customers || []).filter(d => (d.assignedTo || []).includes(mid) && d.type === 'New Customer' &&
                  (selectedStage === 'final' ? (d.lead_stage === 'final_pending' || d.lead_stage === 'final_approved') : d.lead_stage === selectedStage))}
                onSelectLead={d => { setSelectedLead(d); setSelectedStage(null) }}
                onClose={() => setSelectedStage(null)}
              />
            )}

            {selectedLead && (
              <LeadDetailSheet
                lead={selectedLead}
                visits={(visits || []).filter(v => v.distributor_id === selectedLead.id)}
                onClose={() => setSelectedLead(null)}
              />
            )}
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
        {tab === 'newCustomerVisit' && <NewCustomerVisit />}
      </div>

{/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', zIndex: 50 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => t.id === '__more' ? setShowMore(true) : setTab(t.id)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', color: tab === t.id ? '#2563eb' : '#9ca3af', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 20 }}>{t.icon}</div>
            <div style={{ fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </button>
        ))}
      </div>

      {showMore && (
        <Sheet title="More" sub="Additional functions" onClose={() => setShowMore(false)}>
          {MORE_ITEMS.map(item => (
            <div key={item.id} onClick={() => { setTab(item.id); setShowMore(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
            </div>
          ))}
        </Sheet>
      )}
    </div>
  )
}
function GoalEntrySheet({ member, param, goal, products, categories, customers, onSubmit, onClose }) {
  const g = goal || {}
  const canEdit = s => !s || s === 'draft' || s === 'rejected'
  
  // Use refs to collect values - prevents re-render on every keystroke
  const vals = {}
  const set = (key, val) => { vals[key] = val }
  const get = (key, fallback) => vals[key] !== undefined ? vals[key] : fallback

  const StableInp = ({ label, fieldKey, defaultVal, fg }) => {
    if (!canEdit(fg?.status)) return null
    return (
      <div style={{ background: fg?.status === 'rejected' ? '#fef2f2' : '#f9fafb', border: `1px solid ${fg?.status === 'rejected' ? '#fecaca' : 'transparent'}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
        {fg?.status === 'rejected' && <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 8 }}>❌ Manager note: {fg.note}</div>}
        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{label}</label>
        <input
          type="number"
          defaultValue={defaultVal || ''}
          onChange={e => set(fieldKey, e.target.value)}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </div>
    )
  }

  const handleSubmit = async () => {
    const draft = {
      value:  { goal: get('value', g.value_goal) },
      custs:  Object.fromEntries((param.sel_custs || []).map(id => [id, { goal: get(`cust_${id}`, (g.customers||{})[id]?.goal) }])),
      prods:  Object.fromEntries((param.sel_prods || []).map(id => [id, { goal: get(`prod_${id}`, (g.products||{})[id]?.goal)  }])),
      cats:   Object.fromEntries((param.sel_cats  || []).map(id => [id, { goal: get(`cat_${id}`,  (g.categories||{})[id]?.goal)}])),
      visits: { goal: get('visits', g.visits_goal) },
      acq:    { goal: get('acq',    g.acq_goal)    },
    }
    await onSubmit(member?.member_id, draft)
  }

  return (
    <Sheet title="Set my goals" sub="Enter your goal values for each parameter" onClose={onClose}>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#1e40af' }}>
        Once submitted, goals are locked. If manager rejects specific fields, only those will be unlocked for revision.
      </div>

      {param.enable_value && (
        <StableInp label="Sales value goal (₹)" fieldKey="value" defaultVal={g.value_goal} fg={{ status: g.value_status, note: g.value_note }} />
      )}

      {param.enable_customers && (param.sel_custs || []).map(id => {
        const c = (customers || []).find(x => x.id === id); if (!c) return null
        const fg = (g.customers || {})[id]
        return <StableInp key={id} label={`${c.name} — value goal (₹)`} fieldKey={`cust_${id}`} defaultVal={fg?.goal} fg={fg} />
      })}

      {param.enable_products && (param.sel_prods || []).map(id => {
        const p = (products || []).find(x => x.id === id); if (!p) return null
        const fg = (g.products || {})[id]
        return <StableInp key={id} label={`${p.name} — qty goal (${p.unit})`} fieldKey={`prod_${id}`} defaultVal={fg?.goal} fg={fg} />
      })}

      {param.enable_categories && (param.sel_cats || []).map(id => {
        const c = (categories || []).find(x => x.id === id); if (!c) return null
        const fg = (g.categories || {})[id]
        return <StableInp key={id} label={`${c.name} — qty goal (${c.unit})`} fieldKey={`cat_${id}`} defaultVal={fg?.goal} fg={fg} />
      })}

      {param.enable_visits && (
        <StableInp label="Outlet visits goal" fieldKey="visits" defaultVal={g.visits_goal} fg={{ status: g.visits_status, note: g.visits_note }} />
      )}

      {param.enable_acq && (
        <StableInp label="New customer acquisition goal" fieldKey="acq" defaultVal={g.acq_goal} fg={{ status: g.acq_status, note: g.acq_note }} />
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn v="pri" full onClick={async () => { await handleSubmit() }}>Submit for approval</Btn>
        <Btn full onClick={onClose}>Cancel</Btn>
      </div>
    </Sheet>
  )
}


function LeadListSheet({ stage, leads, onSelectLead, onClose }) {
  const stageLabel = { interested: 'Interested', not_interested: 'Not Interested', final: 'Final' }[stage] || stage
  return (
    <Sheet title={stageLabel} sub={`${leads.length} lead(s)`} onClose={onClose}>
      {leads.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No leads in this stage</div>}
      {leads.map(d => (
        <div key={d.id} onClick={() => onSelectLead(d)}
          style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{d.area || '—'}{d.next_followup_date ? ` · Next: ${d.next_followup_date}` : ''}</div>
        </div>
      ))}
    </Sheet>
  )
}

function LeadDetailSheet({ lead, visits, onClose }) {
  return (
    <Sheet title={lead.name} sub={lead.area || 'Visit history'} onClose={onClose}>
      <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Current stage</div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{lead.lead_stage || 'new'}</div>
        {lead.next_followup_date && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Next follow-up: {lead.next_followup_date}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Visit history ({visits.length})</div>
      {visits.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No visits recorded</div>}
      {visits.map(v => (
        <div key={v.id} style={{ padding: '10px 4px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{v.outcome?.replace('_', ' ')}</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(v.visit_date).toLocaleDateString('en-IN')}</span>
          </div>
          {v.notes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{v.notes}</div>}
          {v.latitude && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>📍 {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}</div>}
        </div>
      ))}
    </Sheet>
  )
}