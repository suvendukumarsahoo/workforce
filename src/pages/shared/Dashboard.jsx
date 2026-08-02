import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Sheet } from '../../components/ui.jsx'
import { aggregateForMembers } from '../../lib/goalAggregation.js'
import { ChartSection, MeterGauge, ContributionDonut, GoalVsAchievedBreakdown } from '../../components/charts/GoalBarChart.jsx'
import MemberGoalDetail from '../../components/MemberGoalDetail.jsx'
import SalesSnapshot from '../../components/SalesSnapshot.jsx'
import * as db from '../../lib/db.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

const SectionHeader = ({ icon, title }) => (
  <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '22px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
    <span>{icon}</span>{title}
  </div>
)

// Shared dark-panel primitives — same visual language as SalesSnapshot.jsx, reused by the
// Warehouse/Driver/HR/Accounts rollup sections so the whole Admin page reads as one system rather
// than one dark widget followed by plain light cards.
const darkContainer = { background: '#0f172a', borderRadius: 16, padding: 16, marginBottom: 20 }

const DarkStat = ({ icon, label, value, color, sub, onClick }) => (
  <div onClick={onClick} style={{ background: '#1e293b', borderRadius: 12, padding: '14px 16px', flex: '1 1 150px', minWidth: 140, cursor: onClick ? 'pointer' : 'default' }}>
    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
      {icon && <span>{icon}</span>}{label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 800, color: color || '#fff' }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{sub}</div>}
  </div>
)

const DarkFooterLinks = ({ links }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, paddingTop: 12, marginTop: 10, borderTop: '1px solid #1e293b' }}>
    {links.map(([label, onClick]) => (
      <button key={label} onClick={onClick} style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{label} →</button>
    ))}
  </div>
)

const DarkLoading = () => <div style={{ ...darkContainer, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading...</div>

export default function Dashboard({ onNavigate }) {
  const { role } = useAuth()
  const {
    goals, expenses, invoices, members, users, achievements, params, products, categories,
    distributors: customers, visits, payments,
  } = useData()
  const [selectedStage, setSelectedStage] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)
  const [selectedManagerId, setSelectedManagerId] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)

  const pendingGoals = Object.values(goals || {}).filter(g => g.status === 'pending' || g.status === 'partial').length
  const totalTarget  = Object.values(goals || {}).filter(g => g.status === 'approved').reduce((s, g) => s + (g.value_goal || 0), 0)
  const totalAch     = Object.values(achievements || {}).reduce((s, a) => s + (a.value || 0), 0)

  // Current month only — the SalesSnapshot widget above covers "today/this week" via its own
  // panels, and drilling into a Manager/Member below always means "this month," so there's no more
  // need for the Today/Monthly/Custom tab machinery that used to live here.
  const slices = useMemo(() => [{ goalsMap: goals, paramsMap: params, achievementsMap: achievements, weight: 1 }], [goals, params, achievements])

  const managers = (users || []).filter(u => u.role_id === 'r2')
  const membersByManager = managerId => (members || []).filter(m => String(m.manager_id || '') === String(managerId))
  const unassignedMembers = (members || []).filter(m => !m.manager_id)

  // Who's driving the org's achieved value — reuses each manager's own established avatar color so
  // the leaderboard stays visually consistent with the rest of the app.
  const managerContribution = useMemo(() => {
    const rows = managers.map(u => ({
      id: u.id,
      name: u.name,
      color: u.color,
      value: aggregateForMembers(membersByManager(u.id).map(m => m.id), slices, products, categories, customers).value.achieved,
    }))
    if (unassignedMembers.length > 0) {
      rows.push({ id: 'unassigned', name: 'Unassigned', color: '#9ca3af', value: aggregateForMembers(unassignedMembers.map(m => m.id), slices, products, categories, customers).value.achieved })
    }
    return rows.sort((a, b) => b.value - a.value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slices, members, users, products, categories, customers])

  const selectedManager = managers.find(u => String(u.id) === String(selectedManagerId))

  return (
    <div>
      {selectedMember && (
        <MemberGoalDetail
          member={selectedMember}
          slices={slices || []}
          products={products} categories={categories} customers={customers}
          onClose={() => setSelectedMember(null)}
          zIndex={320}
        />
      )}
      {selectedManager && (
        <ManagerLevelSheet
          manager={selectedManager}
          teamMembers={membersByManager(selectedManager.id)}
          slices={slices || []}
          products={products} categories={categories} customers={customers}
          onClose={() => setSelectedManagerId(null)}
          onSelectMember={m => setSelectedMember(m)}
        />
      )}

      <SalesSnapshot
        totalTarget={totalTarget} totalAch={totalAch} pendingGoals={pendingGoals}
        leaderboard={managerContribution} invoices={invoices} customers={customers}
        onSelectManager={id => setSelectedManagerId(id)}
      />

      {(() => {
const visitedIds = new Set((visits || []).map(v => v.distributor_id))
const newLeads = (customers || []).filter(d => visitedIds.has(d.id))
const stageCounts = { interested: 0, not_interested: 0, final: 0, distributor: 0 }
        const IN_PROGRESS_STAGES = ['final_pending', 'registration_pending', 'documents_submitted', 'documentation_verification', 'payment_pending', 'payment_verification']
        newLeads.forEach(d => {
          if (d.lead_stage === 'interested') stageCounts.interested++
          else if (d.lead_stage === 'not_interested') stageCounts.not_interested++
          else if (d.lead_stage === 'final_approved') stageCounts.distributor++
          else if (IN_PROGRESS_STAGES.includes(d.lead_stage)) stageCounts.final++
        })
        return (
          <div style={darkContainer}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              New Customer Visits — {newLeads.length} total leads
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {[['visited', 'Total Visited', newLeads.length, '#a5b4fc'], ['interested', 'Interested', stageCounts.interested, '#60a5fa'], ['not_interested', 'Not Interested', stageCounts.not_interested, '#f87171'], ['final', 'Final', stageCounts.final, '#fbbf24'], ['distributor', 'Distributor Created', stageCounts.distributor, '#34d399']].map(([key, l, v, c]) => (
                <DarkStat key={key} label={l} value={v} color={c} onClick={() => setSelectedStage(key)} />
              ))}
            </div>
          </div>
        )
      })()}
      {selectedStage && (
              <StageLeadListSheet
                stage={selectedStage}
leads={(customers || []).filter(d => d.lead_stage &&
                (selectedStage === 'final' ? ['final_pending', 'registration_pending', 'documents_submitted', 'documentation_verification', 'payment_pending', 'payment_verification'].includes(d.lead_stage) :
                   selectedStage === 'distributor' ? d.lead_stage === 'final_approved' :
                   selectedStage === 'visited' ? (visits || []).some(v => v.distributor_id === d.id) :
                   d.lead_stage === selectedStage))}
                members={members}
                payments={payments || []}
                onSelectLead={d => { setSelectedLead(d); setSelectedStage(null) }}
                onClose={() => setSelectedStage(null)}
              />
            )}
      {selectedLead && (
        <LeadDetailSheetAdmin
          lead={selectedLead}
          visits={(visits || []).filter(v => v.distributor_id === selectedLead.id)}
          payments={(payments || []).filter(p => p.distributor_id === selectedLead.id)}
          members={members}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {selectedManagerId === 'unassigned' && (
        <ManagerLevelSheet
          manager={{ id: 'unassigned', name: 'Unassigned' }}
          teamMembers={unassignedMembers}
          slices={slices || []}
          products={products} categories={categories} customers={customers}
          onClose={() => setSelectedManagerId(null)}
          onSelectMember={m => setSelectedMember(m)}
        />
      )}

      {role?.id === 'r1' && (
        <>
          <SectionHeader icon="🏭" title="Warehouse" />
          <WarehouseSection onNavigate={onNavigate} />

          <SectionHeader icon="🚚" title="Driver" />
          <DriverSection onNavigate={onNavigate} />

          <SectionHeader icon="📅" title="HR" />
          <HRSection onNavigate={onNavigate} users={users} expenses={expenses} />

          <SectionHeader icon="💰" title="Accounts" />
          <AccountsSection onNavigate={onNavigate} invoices={invoices} expenses={expenses} />
        </>
      )}
    </div>
  )
}

// ── Admin rollup sections — Warehouse / Driver / HR ─────────────────────────────
// Each fetches its own minimal summary data (none of this lives in useData's global context,
// same pattern WMDashboard.jsx/Attendance.jsx already use locally) and offers a "View full
// dashboard" link (onNavigate) for the deep, already-built drill-down each role's own page has —
// rather than re-implementing every nested Sheet those pages already contain.

function isToday(iso) {
  if (!iso) return false
  const d = new Date(iso), t = new Date()
  return d.toDateString() === t.toDateString()
}

function WarehouseSection({ onNavigate }) {
  const [data, setData] = useState(null)
  const [drill, setDrill] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([db.fetchPickingOrders(), db.fetchLoads(), db.fetchParkedAllocations(), db.fetchInProgressAllocations()])
      .then(([orders, loads, parked, inProgress]) => {
        if (cancelled) return
        setData({
          orders: orders.data || [], loads: loads.data || [],
          parked: parked.data || [], inProgress: inProgress.data || [],
        })
      })
    return () => { cancelled = true }
  }, [])

  if (!data) return <DarkLoading />

  const readyToPick = data.orders.filter(o => (o.picking_status || 'pending_picking') === 'pending_picking')
  const pendingPicking = data.orders.filter(o => o.picking_status === 'picking_done')
  const pickingComplete = data.orders.filter(o => o.picking_status === 'ready_for_load' && !o.load_id)
  const loadsToday = data.loads.filter(l => isToday(l.load_created_at))

  const tiles = [
    { key: 'ready', icon: '📦', label: 'Ready to Pick', value: readyToPick.length, rows: readyToPick, color: '#60a5fa' },
    { key: 'pending', icon: '🔧', label: 'Pending Picking', value: pendingPicking.length, rows: pendingPicking, color: '#fbbf24' },
    { key: 'complete', icon: '✅', label: 'Picking Complete', value: pickingComplete.length, rows: pickingComplete, color: '#34d399' },
    { key: 'loadsToday', icon: '🚛', label: 'Loads Created Today', value: loadsToday.length, rows: loadsToday, color: '#22d3ee' },
    { key: 'parked', icon: '🅿️', label: 'Vehicle Parked', value: data.parked.length, rows: data.parked, color: '#a78bfa' },
    { key: 'inProgress', icon: '⏳', label: 'Loading In Progress', value: data.inProgress.length, rows: data.inProgress, color: '#f87171' },
  ]

  return (
    <>
      <div style={darkContainer}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {tiles.map(t => (
            <DarkStat key={t.key} icon={t.icon} label={t.label} value={t.value} color={t.color} onClick={() => setDrill(t)} />
          ))}
        </div>
        <DarkFooterLinks links={[['View full Warehouse Dashboard', () => onNavigate('wmDashboard')]]} />
      </div>
      {drill && (
        <Sheet title={drill.label} sub={`${drill.rows.length} item(s)`} onClose={() => setDrill(null)}>
          {drill.rows.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {drill.rows.map(r => {
            const isAllocation = !!r.vehicle
            return (
              <div key={r.id} style={{ padding: '10px 4px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {isAllocation ? (r.vehicle?.vehicle_number || r.id) : (r.distributor?.name || `Order #${r.id}`)}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {isAllocation ? (r.driver?.name || 'No driver') : (r.load_id ? `Load ${r.load_id}` : `Order #${r.id}`)}
                </div>
              </div>
            )
          })}
        </Sheet>
      )}
    </>
  )
}

function DriverSection({ onNavigate }) {
  const [data, setData] = useState(null)
  const [drill, setDrill] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([db.fetchDriversWithLockStatus(), db.fetchAllocations()])
      .then(([drivers, allocations]) => {
        if (cancelled) return
        setData({ drivers: drivers.data || [], allocations: allocations.data || [] })
      })
    return () => { cancelled = true }
  }, [])

  if (!data) return <DarkLoading />

  const activeDrivers = data.drivers.filter(d => d.locked)
  const availableDrivers = data.drivers.filter(d => !d.locked)
  const inTransit = data.allocations.filter(a => a.status === 'in_transit')
  const pendingApproval = data.allocations.filter(a => a.status === 'pending_journey_approval')

  const allocationForDriver = (memberId) => data.allocations.find(a => String(a.driver_id) === String(memberId) && a.status !== 'completed')

  return (
    <>
      <div style={darkContainer}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <DarkStat icon="🚚" label="Active Drivers" value={activeDrivers.length} color="#f87171" onClick={() => setDrill('active')} />
          <DarkStat icon="🟢" label="Available Drivers" value={availableDrivers.length} color="#34d399" onClick={() => setDrill('available')} />
          <DarkStat icon="🛣️" label="Loads In Transit" value={inTransit.length} color="#60a5fa" />
          <DarkStat icon="🏁" label="Awaiting Journey Approval" value={pendingApproval.length} color="#fbbf24" onClick={() => onNavigate('journeyApprovals')} />
        </div>
        <DarkFooterLinks links={[['View Load Created List', () => onNavigate('loadCreatedList')]]} />
      </div>
      {drill && (
        <Sheet title={drill === 'active' ? 'Active Drivers' : 'Available Drivers'} sub={`${(drill === 'active' ? activeDrivers : availableDrivers).length} driver(s)`} onClose={() => setDrill(null)}>
          {(drill === 'active' ? activeDrivers : availableDrivers).length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {(drill === 'active' ? activeDrivers : availableDrivers).map(d => {
            const alloc = allocationForDriver(d.member_id)
            return (
              <div key={d.member_id} style={{ padding: '10px 4px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{alloc ? `${alloc.vehicle?.vehicle_number || alloc.id} — ${alloc.status.replace(/_/g, ' ')}` : 'No active load'}</div>
              </div>
            )
          })}
        </Sheet>
      )}
    </>
  )
}

// Shared drill-row renderer for approval-queue-style Sheets across HR/Accounts sections — branches
// on row shape since punch/activity rows (r.user), expense rows (r.member), and invoice rows
// (r.distributor/r.member) each carry the "who" under a different key.
function ApprovalDrillRow({ r }) {
  const isInvoice = !!r.lines || !!r.invoice_lines
  const who = r.user?.name || r.member?.name || r.distributor?.name || (isInvoice ? `Invoice #${r.id}` : '—')
  const sub = isInvoice ? (r.date || (r.erp_invoice_number ? `ERP: ${r.erp_invoice_number}` : '')) : (r.date || r.description || r.id)
  const invoiceTotal = isInvoice ? (r.lines || r.invoice_lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0) : null
  const amount = invoiceTotal != null ? F(invoiceTotal) : (r.amount != null ? F(r.amount) : null)
  return (
    <div style={{ padding: '10px 4px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{who}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>
      </div>
      {amount && <div style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{amount}</div>}
    </div>
  )
}

function HRSection({ onNavigate, users, expenses }) {
  const [data, setData] = useState(null)
  const [drill, setDrill] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([db.fetchPendingPunchApprovals(), db.fetchPendingActivityApprovals()])
      .then(([punch, activity]) => {
        if (cancelled) return
        setData({ punch: punch.data || [], activity: activity.data || [] })
      })
    return () => { cancelled = true }
  }, [])

  if (!data) return <DarkLoading />

  const presentToday = Math.max(0, (users || []).length - data.punch.length - data.activity.length)
  const pendingExpenses = (expenses || []).filter(e => e.status === 'pending')

  const tiles = [
    { key: 'punch', icon: '📥', label: 'Punch-In Approvals Pending', value: data.punch.length, rows: data.punch, color: '#fbbf24' },
    { key: 'activity', icon: '📝', label: 'Activity Approvals Pending', value: data.activity.length, rows: data.activity, color: '#fbbf24' },
    { key: 'expenses', icon: '💳', label: 'Expenses Pending', value: pendingExpenses.length, rows: pendingExpenses, color: '#fbbf24' },
  ]

  return (
    <>
      <div style={darkContainer}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <DarkStat icon="👥" label="Total Employees" value={(users || []).length} color="#60a5fa" />
          <DarkStat icon="✅" label="Fully Approved Today" value={presentToday} color="#34d399" sub="Both stages approved" />
          {tiles.map(t => (
            <DarkStat key={t.key} icon={t.icon} label={t.label} value={t.value} color={t.color} onClick={() => setDrill(t)} />
          ))}
        </div>
        <DarkFooterLinks links={[
          ['View full Attendance Dashboard', () => onNavigate('attendance')],
          ['View Expense Approvals', () => onNavigate('expApprovals')],
        ]} />
      </div>
      {drill && (
        <Sheet title={drill.label} sub={`${drill.rows.length} pending`} onClose={() => setDrill(null)}>
          {drill.rows.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {drill.rows.map(r => <ApprovalDrillRow key={r.id} r={r} />)}
        </Sheet>
      )}
    </>
  )
}

function AccountsSection({ onNavigate, invoices, expenses }) {
  const [drill, setDrill] = useState(null)

  const allInvoices = invoices || []
  const pendingInvoices = allInvoices.filter(i => i.status === 'pending_approval')
  const approvedInvoices = allInvoices.filter(i => (i.status || 'approved') === 'approved')
  const pendingExpenses = (expenses || []).filter(e => e.status === 'pending')

  const tiles = [
    { key: 'total', icon: '🧾', label: 'Total Invoices', value: allInvoices.length, rows: allInvoices, color: '#60a5fa' },
    { key: 'pendingInv', icon: '⏳', label: 'Invoices Pending Approval', value: pendingInvoices.length, rows: pendingInvoices, color: '#fbbf24' },
    { key: 'approvedInv', icon: '✅', label: 'Invoices Approved', value: approvedInvoices.length, rows: approvedInvoices, color: '#34d399' },
    { key: 'expenses', icon: '💳', label: 'Expenses Pending', value: pendingExpenses.length, rows: pendingExpenses, color: '#fbbf24' },
  ]

  return (
    <>
      <div style={darkContainer}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {tiles.map(t => (
            <DarkStat key={t.key} icon={t.icon} label={t.label} value={t.value} color={t.color} onClick={() => setDrill(t)} />
          ))}
        </div>
        <DarkFooterLinks links={[
          ['View full Invoices', () => onNavigate('invoices')],
          ['View Expense Approvals', () => onNavigate('expApprovals')],
        ]} />
      </div>
      {drill && (
        <Sheet title={drill.label} sub={`${drill.rows.length} item(s)`} onClose={() => setDrill(null)}>
          {drill.rows.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {drill.rows.map(r => <ApprovalDrillRow key={r.id} r={r} />)}
        </Sheet>
      )}
    </>
  )
}

function ManagerLevelSheet({ manager, teamMembers, slices, products, categories, customers, onClose, onSelectMember }) {
  const agg = aggregateForMembers((teamMembers || []).map(m => m.id), slices, products, categories, customers)
  const hasMeters = agg.value.goal > 0 || agg.visits.goal > 0 || agg.acq.goal > 0
  const hasAny = hasMeters || agg.products.length > 0 || agg.categories.length > 0

  const memberContribution = (teamMembers || []).map(m => ({
    name: m.name,
    color: m.color,
    value: aggregateForMembers([m.id], slices, products, categories, customers).value.achieved,
  }))

  return (
    <Sheet title={manager.name} sub={`${(teamMembers || []).length} team member(s)`} onClose={onClose}>
      {!hasAny && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No approved goals for this period</div>}
      {hasMeters && (
        <ChartSection title="Team — This Period">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around', gap: 8 }}>
            {agg.value.goal > 0 && <MeterGauge label="Sales Value" value={agg.value.achieved} goal={agg.value.goal} formatValue={F} />}
            {agg.visits.goal > 0 && <MeterGauge label="Outlet Visits" value={agg.visits.achieved} goal={agg.visits.goal} />}
            {agg.acq.goal > 0 && <MeterGauge label="Distributors" value={agg.acq.achieved} goal={agg.acq.goal} />}
          </div>
        </ChartSection>
      )}
      <ChartSection title="Achieved Value by Team Member" sub="Share of this team's achieved sales value">
        <ContributionDonut rows={memberContribution} formatValue={F} />
      </ChartSection>
      {agg.products.length > 0 && (
        <ChartSection title="Products — Team">
          <GoalVsAchievedBreakdown rows={agg.products} />
        </ChartSection>
      )}
      {agg.categories.length > 0 && (
        <ChartSection title="Categories — Team">
          <GoalVsAchievedBreakdown rows={agg.categories} />
        </ChartSection>
      )}
      <Card>
        <CH title="Team Members" sub="Tap a member for full detail" />
        {(teamMembers || []).length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No members</div>}
        {(teamMembers || []).map(m => (
          <div key={m.id} onClick={() => onSelectMember(m)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <Av av={m.avatar} color={m.color} sz={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
            </div>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>›</span>
          </div>
        ))}
      </Card>
    </Sheet>
  )
}

function StageLeadListSheet({ stage, leads, members, onSelectLead, onClose }) {
const stageLabel = { interested: 'Interested', not_interested: 'Not Interested', final: 'Final', distributor: 'Distributor Created', visited: 'Total Visited' }[stage] || stage
  return (
    <Sheet title={stageLabel} sub={`${leads.length} lead(s)`} onClose={onClose}>
      {leads.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No leads in this stage</div>}
      {leads.map(d => {
        const ownerId = (d.assignedTo || [])[0]
        const owner = (members || []).find(m => m.id === ownerId)
        return (
          <div key={d.id} onClick={() => onSelectLead(d)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{d.area || '—'}{d.next_followup_date ? ` · Next: ${d.next_followup_date}` : ''}</div>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{owner?.name || 'Unassigned'}</div>
          </div>
        )
      })}
    </Sheet>
  )
}

function LeadDetailSheetAdmin({ lead, visits, payments, members, onClose }) {
    const ownerId = (lead.assignedTo || [])[0]
  const owner = (members || []).find(m => m.id === ownerId)
  return (
    <Sheet title={lead.name} sub={lead.area || 'Visit history'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Current stage</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{lead.lead_stage || 'new'}</div>
        </div>
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Owner</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{owner?.name || 'Unassigned'}</div>
        </div>
      </div>
      {lead.next_followup_date && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>Next follow-up: {lead.next_followup_date}</div>}
      {lead.lead_stage === 'final_approved' && (payments || []).length > 0 && (
        <div style={{ fontSize: 13, color: '#166534', fontWeight: 700, marginBottom: 14 }}>
          Payment: ₹{Number((payments[0].transaction_amount) || 0).toLocaleString('en-IN')}
        </div>
      )}
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
