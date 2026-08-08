/**
 * lib/goalAggregation.js
 * Pure functions — no DB calls. Aggregates goal-vs-achievement across a set of members (all Sales
 * Team, one Manager's team, or a single member) for the dashboard's Org/Manager/Member drill-down.
 *
 * A "slice" is one period's worth of data: { goalsMap, paramsMap, achievementsMap, weight }.
 * - Today/Monthly views pass a single slice with weight=1 (the whole thing is one calendar month).
 * - Custom-period views spanning multiple months pass one slice per overlapping month, weighted by
 *   what fraction of the picked range falls in that month (see period.js's resolvePeriodsInRange).
 * Achievement values are summed as-is across slices (each slice already reflects an exact,
 * non-overlapping date sub-range, so achievement is additive with no weighting). Goal target values
 * are summed as (goal * weight) — this is how a goal gets prorated when a custom range only
 * partially covers a month.
 */

const emptyTotal = () => ({ goal: 0, achieved: 0 })

export function aggregateForMembers(memberIds, slices, products = [], categories = [], customers = []) {
  const value = emptyTotal()
  const visits = emptyTotal()
  const acq = emptyTotal()
  const newOutlets = emptyTotal()
  const productiveOutlets = emptyTotal()
  const secondaryOrders = emptyTotal()
  const secondaryValue = emptyTotal()
  const prodTotals = {}
  const catTotals = {}
  const custTotals = {}

  const bump = (map, id) => { if (!map[id]) map[id] = emptyTotal(); return map[id] }

  memberIds.forEach(mid => {
    const key = String(mid)
    slices.forEach(({ goalsMap, paramsMap, achievementsMap, weight }) => {
      const goal = (goalsMap || {})[key]
      const param = (paramsMap || {})[key] || {}
      const ach = (achievementsMap || {})[key] || { value: 0, visits: 0, acq: 0, prods: {}, cats: {}, custs: {}, new_outlets: 0, productive_outlets: 0, secondary_orders: 0, secondary_value: 0 }
      if (!goal) return

      if (param.enable_value && goal.value_status === 'approved') {
        value.goal += (Number(goal.value_goal) || 0) * weight
        value.achieved += ach.value || 0
      }
      if (param.enable_visits && goal.visits_status === 'approved') {
        visits.goal += (Number(goal.visits_goal) || 0) * weight
        visits.achieved += ach.visits || 0
      }
      if (param.enable_acq) {
        // Target stays gated on approval (same as every other field); achieved does NOT — it's the
        // same real "Distributor Created" event tracked unconditionally elsewhere in the app, so it
        // must always show the true count (see achievementEngine.js's matching comment).
        if (goal.acq_status === 'approved') acq.goal += (Number(goal.acq_goal) || 0) * weight
        acq.achieved += ach.acq || 0
      }
      if (param.enable_new_outlets && goal.new_outlets_status === 'approved') {
        newOutlets.goal += (Number(goal.new_outlets_goal) || 0) * weight
        newOutlets.achieved += ach.new_outlets || 0
      }
      if (param.enable_productive_outlets && goal.productive_outlets_status === 'approved') {
        productiveOutlets.goal += (Number(goal.productive_outlets_goal) || 0) * weight
        productiveOutlets.achieved += ach.productive_outlets || 0
      }
      if (param.enable_secondary_orders && goal.secondary_orders_status === 'approved') {
        secondaryOrders.goal += (Number(goal.secondary_orders_goal) || 0) * weight
        secondaryOrders.achieved += ach.secondary_orders || 0
      }
      if (param.enable_secondary_value && goal.secondary_value_status === 'approved') {
        secondaryValue.goal += (Number(goal.secondary_value_goal) || 0) * weight
        secondaryValue.achieved += ach.secondary_value || 0
      }
      if (param.enable_products) {
        (param.sel_prods || []).forEach(pid => {
          const fg = (goal.products || {})[pid]
          if (fg?.status !== 'approved') return
          const t = bump(prodTotals, pid)
          t.goal += (Number(fg.goal) || 0) * weight
          t.achieved += (ach.prods || {})[pid] || 0
        })
      }
      if (param.enable_categories) {
        (param.sel_cats || []).forEach(cid => {
          const fg = (goal.categories || {})[cid]
          if (fg?.status !== 'approved') return
          const t = bump(catTotals, cid)
          t.goal += (Number(fg.goal) || 0) * weight
          t.achieved += (ach.cats || {})[cid] || 0
        })
      }
      if (param.enable_customers) {
        (param.sel_custs || []).forEach(cid => {
          const fg = (goal.customers || {})[cid]
          if (fg?.status !== 'approved') return
          const t = bump(custTotals, cid)
          t.goal += (Number(fg.goal) || 0) * weight
          t.achieved += (ach.custs || {})[cid] || 0
        })
      }
      // "Other Distributors" — auto-derived remainder (Sales Value goal minus named distributor
      // targets, or the full Sales Value goal if distributor-wise tracking isn't even enabled for
      // this member), inherits value_status rather than its own approval (see
      // achievementEngine.js). Independent of enable_customers — every remaining distributor
      // whose goal was never individually set still rolls up here.
      const other = goal.customers?.__other__
      if (other && goal.value_status === 'approved') {
        const t = bump(custTotals, '__other__')
        t.goal += (Number(other.goal) || 0) * weight
        t.achieved += (ach.custs || {}).__other__ || 0
      }
    })
  })

  const toRows = (totals, master, unitFn) => Object.entries(totals)
    .map(([id, t]) => {
      if (id === '__other__') return { id, name: 'Other Distributors', unit: undefined, goal: t.goal, achieved: t.achieved }
      const item = (master || []).find(x => x.id === id)
      return { id, name: item?.name || id, unit: unitFn ? unitFn(item) : undefined, goal: t.goal, achieved: t.achieved }
    })
    .sort((a, b) => b.goal - a.goal)

  return {
    value, visits, acq,
    new_outlets: newOutlets, productive_outlets: productiveOutlets,
    secondary_orders: secondaryOrders, secondary_value: secondaryValue,
    products: toRows(prodTotals, products, p => p?.unit),
    categories: toRows(catTotals, categories, c => c?.unit),
    customers: toRows(custTotals, customers),
  }
}
