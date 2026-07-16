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
export function computeAchievements(invoices = [], goals = {}, products = []) {
  const result = {}

  // Initialise empty achievement for every member that has a goal
  Object.keys(goals).forEach(memberId => {
    result[memberId] = { value: 0, custs: {}, prods: {}, cats: {} }
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

  return result
}

/**
 * getGoalOverallStatus
 * Derives the overall goal status from individual field statuses.
 * draft    → nothing submitted
 * pending  → submitted, awaiting review
 * partial  → some approved, some rejected
 * approved → all fields approved
 * rejected → all fields rejected
 */
export function getGoalOverallStatus(goal) {
  if (!goal) return 'draft'

  const statuses = []

  // Top-level string statuses
  if (goal.value_status) statuses.push(goal.value_status)
  if (goal.visits_status) statuses.push(goal.visits_status)
  if (goal.acq_status) statuses.push(goal.acq_status)

  // Nested object statuses (customers, products, categories)
  Object.values(goal.customers || {}).forEach(c => {
    if (c && c.status) statuses.push(c.status)
  })
  Object.values(goal.products || {}).forEach(p => {
    if (p && p.status) statuses.push(p.status)
  })
  Object.values(goal.categories || {}).forEach(c => {
    if (c && c.status) statuses.push(c.status)
  })

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
