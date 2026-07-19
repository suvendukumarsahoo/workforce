/**
 * lib/achievementEngine.js
 * Pure function — no database calls.
 * Computes member achievements from invoices against approved goals only.
 * Input/output shapes are backend-agnostic.
 */

/**
 * computeAchievements
 * @param {Array}  invoices  - array of invoice objects with lines
 * @param {Object} goals     - { [memberId]: goalObject }
 * @param {Array}  products  - product master array
 * @returns {Object}         - { [memberId]: { value, customers, products, categories } }
 */
export function computeAchievements(invoices = [], goals = {}, products = [], distributors = []) {
  const result = {}

  // Initialise empty achievement for every member that has a goal
  Object.keys(goals).forEach(memberId => {
    result[memberId] = { value: 0, custs: {}, prods: {}, cats: {}, acq: 0 }
  })

  invoices.forEach(invoice => {
    const mid  = String(invoice.member_id || invoice.memberId)
    const goal = goals[mid]

    if (!goal || goal.status !== 'approved') return

    const ach = result[mid]
    if (!ach) return

    let invoiceTotal = 0
    const lines = invoice.lines || invoice.invoice_lines || []

    lines.forEach(line => {
      const productId = line.product_id || line.pid
      const qty       = Number(line.qty)  || 0
      const rate      = Number(line.rate) || 0
      const lineValue = qty * rate

      invoiceTotal += lineValue

      // Product qty
      ach.prods[productId] = (ach.prods[productId] || 0) + qty

      // Category qty — look up category from product master
      const product = products.find(p => p.id === productId)
      if (product) {
        const catId = product.category_id || product.catId
        ach.cats[catId] = (ach.cats[catId] || 0) + qty
      }
    })

    // Value
    ach.value += invoiceTotal

    // Customer value
    const custId = invoice.customer_id || invoice.custId
    ach.custs[custId] = (ach.custs[custId] || 0) + invoiceTotal
  })

  // Distributor Appointment count — only counts leads that completed the full appointment pipeline
distributors.forEach(d => {
  if (d.lead_stage !== 'final_approved') return
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

  const hasApproved = statuses.some(s => s === 'approved')
  const hasPending  = statuses.some(s => s === 'pending')
  const hasRejected = statuses.some(s => s === 'rejected')
  const allApproved = statuses.every(s => s === 'approved')
  const allRejected = statuses.every(s => s === 'rejected')

  if (allApproved) return 'approved'
  if (allRejected) return 'rejected'
  if (hasApproved && hasRejected) return 'partial'
  if (hasPending) return 'pending'
  return 'draft'
}

/**
 * pct — safe percentage
 */
export const pct = (achieved, target) =>
  target > 0 ? Math.round((achieved / target) * 100) : 0
