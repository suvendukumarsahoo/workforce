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
 * @param {Array}  visits     - distributor_visits rows (for Outlet Visits achievement)
 * @param {Array}  retailVisits - retail_visits rows (Distributor Secondary beat-outlet visits) —
 *                               additive with `visits` toward the same Outlet Visits achievement
 * @param {Object} [dateRange] - optional { from, to } ISO date strings (inclusive). When given,
 *                               invoices/visits/distributor-acquisitions outside the range are
 *                               excluded. Omitted = all-time (unchanged prior behavior).
 * @returns {Object}          - { [memberId]: { value, custs, prods, cats, acq, visits } }
 */
export function computeAchievements(invoices = [], goals = {}, products = [], distributors = [], visits = [], retailVisits = [], dateRange = null) {
  const result = {}
  const inRange = iso => {
    if (!dateRange || !iso) return true
    const d = String(iso).slice(0, 10)
    return d >= dateRange.from && d <= dateRange.to
  }

  // Initialise empty achievement for every member that has a goal
  Object.keys(goals).forEach(memberId => {
    result[memberId] = { value: 0, custs: {}, prods: {}, cats: {}, acq: 0, visits: 0 }
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

  // Outlet visits count
  visits.forEach(v => {
    const mid = String(v.member_id)
    const goal = goals[mid]
    const ach = result[mid]
    if (!ach || !goal || goal.visits_status !== 'approved') return
    if (!inRange(v.visit_date)) return
    ach.visits += 1
  })

  // Outlet visits count — Distributor Secondary beat-outlet visits, additive with the above. Every
  // retail_visits row counts (order or no_order outcome) — the achievement is "the rep visited this
  // outlet," not "the visit resulted in an order."
  retailVisits.forEach(v => {
    const mid = String(v.member_id)
    const goal = goals[mid]
    const ach = result[mid]
    if (!ach || !goal || goal.visits_status !== 'approved') return
    if (!inRange(v.visit_date)) return
    ach.visits += 1
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

  if (enableValue && goal.value_status) statuses.push(goal.value_status)
  if (enableVisits && goal.visits_status) statuses.push(goal.visits_status)
  if (enableAcq && goal.acq_status) statuses.push(goal.acq_status)

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
