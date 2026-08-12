// Aggregates every "needs your action" queue this app already has (Order/Goal/Invoice/Expense/
// Distributor/Journey/Stock-Take-Rule/Attendance/Waiver approvals, Sales Team's own review/stock-take
// items, WM's picking queues, Driver's assigned loads) into one role-scoped list, for the Pending
// Tasks bell (src/components/PendingTasksBell.jsx). Each category reuses the EXACT same fetch +
// filter its own source page already uses, so a count here can never drift from what that page shows
// (see CLAUDE.md's "Menu list duplicated in up to 3 places" bug pattern — the same drift risk applies
// to any duplicated filter, not just menu lists).
//
// v1 scope: tapping a task navigates to that category's existing page/tab (`nav`, a menu/tab id
// this app's onNavigate/setTab already understands) — not a deep link into the exact record. True
// per-record auto-open would need "open record X" support added to ~12 pages individually; deferred
// as its own follow-up, see the commit that introduced this file.
import * as db from './db.js'
import { computeDueStatus } from './stockTakeSchedule.js'
import { localDateStr } from './period.js'

// Lead stages where the CURRENT viewer (Admin or Manager) specifically has a button to click —
// NOT every stage in the pipeline (registration_pending/payment_pending are on the rep to clear,
// and final_approved is already done). Mirrors DistributorApproval.jsx's own per-stage gates.
const ADMIN_ACTIONABLE_LEAD_STAGES = ['final_pending', 'documents_submitted', 'documentation_verification', 'payment_verification']
const MANAGER_ACTIONABLE_LEAD_STAGES = ['final_pending']

function task(category, icon, id, title, subtitle, nav) {
  return { id: `${category}-${id}`, category, icon, title, subtitle, nav }
}

// currentUser/role/hasMenu from useAuth(); context = the subset of useData() this needs (already
// loaded globally, no extra fetch for these): goals, expenses, invoices, distributors, members.
export async function fetchPendingTasks({ currentUser, role, hasMenu, context }) {
  const roleId = role?.id
  const uid = currentUser?.id
  const mid = currentUser?.member_id
  const { goals, expenses, invoices, distributors, members } = context
  const tasks = []
  const fetches = []

  // ---- Goal Approvals (already-loaded context, no fetch) ----
  if (hasMenu('goalApprovals')) {
    const isManager = roleId === 'r2'
    Object.values(goals || {}).forEach(g => {
      if (!(g.status === 'pending' || g.status === 'partial')) return
      const mem = (members || []).find(m => m.id === g.member_id)
      if (isManager && String(mem?.manager_id) !== String(uid)) return
      tasks.push(task('Goal Approval', '🎯', `${g.member_id}-${g.period}`,
        mem?.name || 'Goal submission', `${g.period} · awaiting approval`, 'goalApprovals'))
    })
  }

  // ---- Invoice Approvals (already-loaded context, no fetch) ----
  if (hasMenu('invoices')) {
    (invoices || []).filter(inv => inv.status === 'pending_approval').forEach(inv => {
      tasks.push(task('Invoice Approval', '🧾', inv.id, inv.id, 'awaiting approval', 'invoices'))
    })
  }

  // ---- Expense Approvals (already-loaded context, no fetch) ----
  if (hasMenu('expApprovals')) {
    (expenses || []).filter(e => e.status === 'pending').forEach(e => {
      tasks.push(task('Expense Approval', '💳', e.id, e.member?.name || e.category || 'Expense', 'awaiting approval', 'expApprovals'))
    })
  }

  // ---- Distributor Approval (already-loaded context, no fetch) ----
  if (hasMenu('distributorApproval')) {
    const stages = roleId === 'r2' ? MANAGER_ACTIONABLE_LEAD_STAGES : ADMIN_ACTIONABLE_LEAD_STAGES;
    (distributors || []).filter(d => stages.includes(d.lead_stage)).forEach(d => {
      tasks.push(task('Distributor Approval', '📋', d.id, d.name, d.lead_stage.replace(/_/g, ' '), 'distributorApproval'))
    })
  }

  // ---- Order Approval + Orders Sent for Your Review (one shared fetch) ----
  const needOrders = hasMenu('orderApproval') || roleId === 'r5'
  if (needOrders) {
    fetches.push(db.fetchAllOrdersWithItems().then(({ data }) => {
      const orders = data || []
      if (hasMenu('orderApproval')) {
        const relevant = orders.filter(o =>
          roleId === 'r1' ? ['manager_approved_admin_pending', 'confirmed'].includes(o.status)
          : roleId === 'r2' ? o.status === 'order_submitted'
          : false
        )
        relevant.forEach(o => tasks.push(task('Order Approval', '📝', o.id, o.distributor?.name || o.id, `Order ${o.id}`, 'orderApproval')))
      }
      const reviewNav = hasMenu('orderApproval') ? 'orderApproval' : (roleId === 'r5' ? 'dashboard' : null)
      if (reviewNav) {
        orders.filter(o => String(o.review_assigned_to) === String(uid)).forEach(o =>
          tasks.push(task('Order Review', '🔎', o.id, o.distributor?.name || o.id, `Order ${o.id} sent for your review`, reviewNav)))
      }
    }))
  }

  // ---- Journey Approvals ----
  if (hasMenu('journeyApprovals')) {
    fetches.push(db.fetchPendingJourneyApprovals().then(({ data }) => {
      (data || []).forEach(a => tasks.push(task('Journey Approval', '🏁', a.id, a.vehicle?.vehicle_number || a.id, `Driver: ${a.driver?.name || '—'}`, 'journeyApprovals')))
    }))
  }

  // ---- Stock Take Rule Approvals ----
  if (hasMenu('stockTakeRuleApprovals')) {
    fetches.push(db.fetchPendingStockTakeRuleChanges().then(({ data }) => {
      (data || []).forEach(r => tasks.push(task('Stock Take Rule', '🗓️', r.distributor_id, r.distributor?.name || r.distributor_id, 'schedule change proposed', 'stockTakeRuleApprovals')))
    }))
  }

  // ---- Attendance Approvals (Stage 1 + Stage 2) ----
  if (hasMenu('attendanceApprovals')) {
    fetches.push(Promise.all([db.fetchPendingPunchApprovals(), db.fetchPendingActivityApprovals()]).then(([s1, s2]) => {
      (s1.data || []).forEach(p => tasks.push(task('Attendance Approval', '📅', `s1-${p.id}`, p.user?.name || 'Punch-in', `${p.date} · Stage 1`, 'attendanceApprovals')))
      ;(s2.data || []).forEach(p => tasks.push(task('Attendance Approval', '📅', `s2-${p.id}`, p.user?.name || 'Activity', `${p.date} · Stage 2`, 'attendanceApprovals')))
    }))
  }

  // ---- Waiver Approvals (Late Present / Half Day) ----
  if (hasMenu('attendanceRules')) {
    fetches.push(db.fetchPendingWaiverApprovals().then(({ data }) => {
      const all = data || []
      const mine = (roleId === 'r1' || roleId === 'r4')
        ? all
        : all.filter(p => p.rule_waiver_status === 'pending' && p.rule?.approver1_role === 'manager' && String(p.user?.manager_id) === String(uid))
      mine.forEach(p => tasks.push(task('Waiver Approval', '⏱️', p.id, p.user?.name || 'Waiver', `${p.date} · ${p.rule_waiver_status === 'stage1_approved' ? 'Stage 2' : 'Stage 1'}`, 'attendanceRules')))
    }))
  }

  // ---- Warehouse: Ready to Pick / Pending Picking ----
  if (hasMenu('wmDashboard')) {
    fetches.push(db.fetchPickingOrders().then(({ data }) => {
      const orders = data || []
      orders.filter(o => (o.picking_status || 'pending_picking') === 'pending_picking').forEach(o =>
        tasks.push(task('Ready to Pick', '📦', o.id, o.distributor?.name || o.id, `Order ${o.id}`, 'wmDashboard')))
      orders.filter(o => o.picking_status === 'picking_done').forEach(o =>
        tasks.push(task('Pending Picking', '🔧', o.id, o.distributor?.name || o.id, `Order ${o.id} — waiting for Admin`, 'wmDashboard')))
    }))
  }

  // ---- Driver: Assigned Loads awaiting acceptance ----
  if (hasMenu('assignedLoads') && mid) {
    fetches.push(db.fetchDriverAllocations(mid).then(({ data }) => {
      (data || []).filter(a => a.status === 'waiting_driver_acceptance').forEach(a =>
        tasks.push(task('Assigned Load', '🚚', a.id, a.vehicle?.vehicle_number || a.id, `Warehouse: ${a.warehouse?.name || '—'}`, 'assignedLoads')))
    }))
  }

  // ---- Sales Team: Pending Visits (follow-ups due) ----
  if (hasMenu('newCustomerVisit') && mid) {
    (distributors || []).filter(d => (d.assignedTo || []).includes(mid) && d.contact_today).forEach(d =>
      tasks.push(task('Pending Visit', '📌', d.id, d.name, 'follow-up due today', 'pendingVisits')))
  }

  // ---- Sales Team: Stock Take overdue ----
  if (hasMenu('stockTakeEntry') && mid) {
    const myDistributorIds = (distributors || [])
      .filter(d => d.type === 'Distributor' && (d.assignedTo || []).includes(mid))
      .map(d => d.id)
    if (myDistributorIds.length) {
      fetches.push(Promise.all([
        db.fetchStockTakeRules({ distributorIds: myDistributorIds }),
        db.fetchStockTakesForDistributors({ distributorIds: myDistributorIds }),
      ]).then(([{ data: ruleRows }, { data: takes }]) => {
        const latest = {}
        ;(takes || []).forEach(t => { latest[t.distributor_id] = t.take_date })
        const today = localDateStr(new Date())
        myDistributorIds.forEach(distId => {
          const rule = (ruleRows || []).find(r => r.distributor_id === distId)
          const status = computeDueStatus(rule, latest[distId] || null, today)
          if (status.state === 'overdue') {
            const d = (distributors || []).find(dd => dd.id === distId)
            // 'dashboard', not 'stockTakeSchedule' (that's Manager's rule-authoring page) — the
            // rep's own Home tab already has StockTakeScheduleCard with a "Take Stock Now" button.
            tasks.push(task('Stock Take Overdue', '🗓️', distId, d?.name || distId, `${status.daysOverdue} day(s) overdue`, 'dashboard'))
          }
        })
      }))
    }
  }

  await Promise.all(fetches)
  return tasks
}
