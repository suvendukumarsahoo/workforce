/**
 * lib/achievementEngine.js
 * Pure function — no database calls.
 * Computes member achievements from invoices against approved goals only.
 * Input/output shapes are backend-agnostic.
 */

/**
 * computeAchievements
 * @param {Array}  invoices   - array of invoice objects with lines
 * @param {Object} goals      - { [memberId]: goalObject }
 * @param {Array}  products   - product master array
 * @param {Array}  distributors - distributor master array (for Distributor Appointment count)
 * @param {Array}  visits     - distributor_visits rows (for "New Customer Visits" achievement)
 * @param {Array}  retailVisits - retail_visits rows (Distributor Secondary beat-outlet visits) —
 *                               feeds the Distributor Secondary goal category's Productive Outlets
 *                               / Total No. of Orders fields ONLY. Reverted 5 Aug 2026: this used
 *                               to also add to the general Visits achievement (a session-4-Aug
 *                               addition); now that Distributor Secondary has its own dedicated
 *                               goal fields, that combination was removed — "New Customer Visits"
 *                               (the renamed general Visits field) is `visits`-only again.
 * @param {Array}  retailOutlets - retail_outlets rows (Distributor Secondary) — feeds New Outlets.
 * @param {Array}  secondaryOrders - secondary_orders rows w/ joined `items` (qty, rate) —
 *                               feeds Value.
 * @param {Object} [dateRange] - optional { from, to } ISO date strings (inclusive). When given,
 *                               invoices/visits/distributor-acquisitions outside the range are
 *                               excluded. Omitted = all-time (unchanged prior behavior).
 * @returns {Object}          - { [memberId]: { value, custs, prods, cats, acq, visits,
 *                               new_outlets, productive_outlets, secondary_orders, secondary_value } }
 */
export function computeAchievements(invoices = [], goals = {}, products = [], distributors = [], visits = [], retailVisits = [], retailOutlets = [], secondaryOrders = [], dateRange = null) {
  const result = {}
  const inRange = iso => {
    if (!dateRange || !iso) return true
    const d = String(iso).slice(0, 10)
    return d >= dateRange.from && d <= dateRange.to
  }

  // Initialise empty achievement for every member that has a goal
  Object.keys(goals).forEach(memberId => {
    result[memberId] = {
      value: 0, custs: {}, prods: {}, cats: {}, acq: 0, visits: 0,
      new_outlets: 0, productive_outlets: 0, secondary_orders: 0, secondary_value: 0,
    }
  })

  // Gating is per-field (value/products/categories/customers/visits/acq are independently
  // approvable parameters — see Parameters.jsx's enable_* toggles), NOT by the goal's overall
  // status. A "partial" goal (some fields approved, some rejected) still tracks achievement for
  // whichever specific fields ARE approved — matches what every consumer (TeamApp.jsx, Dashboard,
  // Targets.jsx) already assumes by checking `fg?.status === 'approved'` per field before display.
  invoices.forEach(invoice => {
    // Only approved invoices count toward achievement — a pending_approval invoice shouldn't move
    // the needle until Admin/Accounts signs off on it (see AwaitingInvoiceTile.jsx/
    // InvoiceApprovalTile.jsx). This guard was documented in CLAUDE.md as already applied but had
    // never actually landed in code — restored here.
    if (invoice.status && invoice.status !== 'approved') return

    const mid  = String(invoice.member_id || invoice.memberId)
    const goal = goals[mid]
    if (!goal) return
    if (!inRange(invoice.date || invoice.order_date || invoice.created_at)) return

    const ach = result[mid]
    if (!ach) return

    let invoiceTotal = 0
    const lines = invoice.lines || invoice.invoice_lines || []

    lines.forEach(line => {
      const productId = line.product_id || line.pid
      const qty       = Number(line.qty)  || 0
      const rate      = Number(line.rate) || 0
      invoiceTotal += qty * rate

      // Product qty — only if this specific product's goal field is approved
      if ((goal.products || {})[productId]?.status === 'approved') {
        ach.prods[productId] = (ach.prods[productId] || 0) + qty
      }

      // Category qty — look up category from product master, gated on that category's own field
      const product = products.find(p => p.id === productId)
      if (product) {
        const catId = product.category_id || product.catId
        if ((goal.categories || {})[catId]?.status === 'approved') {
          ach.cats[catId] = (ach.cats[catId] || 0) + qty
        }
      }
    })

    // Value — independent parameter, gated on value_status
    if (goal.value_status === 'approved') {
      ach.value += invoiceTotal
    }

    // Customer (distributor) value — gated on that specific distributor's goal field
    const custId = invoice.distributor_id || invoice.custId
    const namedCust = (goal.customers || {})[custId]
    if (namedCust?.status === 'approved') {
      ach.custs[custId] = (ach.custs[custId] || 0) + invoiceTotal
    } else if (!namedCust && goal.customers?.__other__ && goal.value_status === 'approved') {
      // "Other Distributors" — auto-derived (Sales Value goal minus named distributor targets), so
      // it inherits value_status rather than having its own approval, and rolls up every invoice
      // from a distributor NOT individually named in this member's goal.
      ach.custs.__other__ = (ach.custs.__other__ || 0) + invoiceTotal
    }
  })

  // "New Customer Visits" count (renamed label; column/field name `visits` unchanged) —
  // distributor_visits-only, see the JSDoc note above for why retail_visits no longer adds here.
  visits.forEach(v => {
    const mid = String(v.member_id)
    const goal = goals[mid]
    const ach = result[mid]
    if (!ach || !goal || goal.visits_status !== 'approved') return
    if (!inRange(v.visit_date)) return
    ach.visits += 1
  })

  // Distributor Secondary — New Outlets: retail_outlets created in range, attributed via
  // created_by (stores members.id, same key space as every other loop here).
  retailOutlets.forEach(o => {
    const mid = String(o.created_by)
    const goal = goals[mid]
    const ach = result[mid]
    if (!ach || !goal || goal.new_outlets_status !== 'approved') return
    if (!inRange(o.created_at)) return
    ach.new_outlets += 1
  })

  // Distributor Secondary — Productive Outlets (distinct outlets with >=1 order in range) and
  // Total No. of Orders (count of order-outcome visits in range) — both derived from retailVisits,
  // gated independently on their own field's approval status.
  const productiveOutletSets = {}
  retailVisits.forEach(v => {
    if (v.outcome !== 'order') return
    if (!inRange(v.visit_date)) return
    const mid = String(v.member_id)
    const goal = goals[mid]
    const ach = result[mid]
    if (!ach || !goal) return
    if (goal.secondary_orders_status === 'approved') ach.secondary_orders += 1
    if (goal.productive_outlets_status === 'approved') {
      if (!productiveOutletSets[mid]) productiveOutletSets[mid] = new Set()
      productiveOutletSets[mid].add(v.outlet_id)
    }
  })
  Object.entries(productiveOutletSets).forEach(([mid, set]) => {
    if (result[mid]) result[mid].productive_outlets = set.size
  })

  // Distributor Secondary — Value: sum of secondary_order_items (qty*rate) for orders in range.
  secondaryOrders.forEach(o => {
    const mid = String(o.member_id)
    const goal = goals[mid]
    const ach = result[mid]
    if (!ach || !goal || goal.secondary_value_status !== 'approved') return
    if (!inRange(o.order_date)) return
    const orderTotal = (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
    ach.secondary_value += orderTotal
  })

  // Distributor Appointment count — only counts leads that completed the full appointment pipeline.
  // NOT gated on acq_status: this is the same real-world event as the "Distributor Created" pipeline
  // stage shown elsewhere (TeamSnapshot.jsx), so it must always reflect the true count — only the
  // acq goal's *target* number stays gated on approval (see goalAggregation.js), matching how the
  // pipeline tile has no goal-approval concept at all.
distributors.forEach(d => {
  if (d.lead_stage !== 'final_approved') return
  if (!inRange(d.stage_updated_at)) return
  const ownerIds = d.assignedTo || []
  ownerIds.forEach(mid => {
    const key = String(mid)
    if (result[key]) result[key].acq += 1
  })
})

  return result
}
/**
 * getGoalOverallStatus
 * Derives the overall goal status from individual field statuses.
 * If `param` is provided, only counts fields whose parameter toggle is currently enabled —
 * this prevents stale/orphaned field data (from a since-disabled parameter) from permanently
 * stuck a goal in 'pending'.
 * draft    → nothing submitted
 * pending  → submitted, awaiting review
 * partial  → some approved, some rejected
 * approved → all fields approved
 * rejected → all fields rejected
 */
export function getGoalOverallStatus(goal, param = null) {
  if (!goal) return 'draft'

  const statuses = []
  const enableValue      = param ? param.enable_value      : true
  const enableCustomers  = param ? param.enable_customers  : true
  const enableProducts   = param ? param.enable_products   : true
  const enableCategories = param ? param.enable_categories : true
  const enableVisits     = param ? param.enable_visits     : true
  const enableAcq        = param ? param.enable_acq        : true
  const enableNewOutlets        = param ? param.enable_new_outlets        : true
  const enableProductiveOutlets = param ? param.enable_productive_outlets : true
  const enableSecondaryOrders   = param ? param.enable_secondary_orders   : true
  const enableSecondaryValue    = param ? param.enable_secondary_value    : true

  if (enableValue && goal.value_status) statuses.push(goal.value_status)
  if (enableVisits && goal.visits_status) statuses.push(goal.visits_status)
  if (enableAcq && goal.acq_status) statuses.push(goal.acq_status)
  if (enableNewOutlets && goal.new_outlets_status) statuses.push(goal.new_outlets_status)
  if (enableProductiveOutlets && goal.productive_outlets_status) statuses.push(goal.productive_outlets_status)
  if (enableSecondaryOrders && goal.secondary_orders_status) statuses.push(goal.secondary_orders_status)
  if (enableSecondaryValue && goal.secondary_value_status) statuses.push(goal.secondary_value_status)

  if (enableCustomers) {
    const selIds = param?.sel_custs || null
    Object.entries(goal.customers || {}).forEach(([id, c]) => {
      if (selIds && !selIds.includes(id)) return
      if (c && c.status) statuses.push(c.status)
    })
  }
  if (enableProducts) {
    const selIds = param?.sel_prods || null
    Object.entries(goal.products || {}).forEach(([id, p]) => {
      if (selIds && !selIds.includes(id)) return
      if (p && p.status) statuses.push(p.status)
    })
  }
  if (enableCategories) {
    const selIds = param?.sel_cats || null
    Object.entries(goal.categories || {}).forEach(([id, c]) => {
      if (selIds && !selIds.includes(id)) return
      if (c && c.status) statuses.push(c.status)
    })
  }

  if (!statuses.length) return 'draft'

  const hasPending  = statuses.some(s => s === 'pending')
  const hasRejected = statuses.some(s => s === 'rejected')
  const allApproved = statuses.every(s => s === 'approved')
  const allRejected = statuses.every(s => s === 'rejected')

  if (allApproved) return 'approved'
  if (allRejected) return 'rejected'
  // Any rejection at all means the member has something to revise — even if every other field is
  // still sitting in 'pending' (manager hasn't gotten to them yet), not necessarily 'approved'. The
  // old `hasApproved && hasRejected` check missed exactly that "one rejected, rest still pending"
  // case, silently falling through to 'pending' below — which hid the rejection from TeamApp.jsx's
  // `hasRejected`/`canEnter` checks, so the member never saw a way to revise it.
  if (hasRejected) return 'partial'
  if (hasPending) return 'pending'
  return 'draft'
}

/**
 * pct — safe percentage
 */
export const pct = (achieved, target) =>
  target > 0 ? Math.round((achieved / target) * 100) : 0
