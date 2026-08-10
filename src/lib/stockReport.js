/**
 * lib/stockReport.js
 * Pure aggregation for the Distributor Stock & Sales Report. No DB calls — mirrors
 * achievementEngine.js's shape (fed pre-loaded arrays, returns computed rows).
 *
 * Each distributor's physical stock takes (sorted oldest-first) chop its timeline into
 * stock-take-to-stock-take periods. Opening/Closing are never calculated — Closing is that
 * period's real physical count (ground truth); Opening is simply the PREVIOUS period's Closing
 * (or 0 before the very first take — there's no manual baseline in this design). Receipts is the
 * only auto-derived inflow (from delivered distributor_orders in between). Sales is a *derived*
 * plug figure, Opening + Receipts − Closing — reconciling it against the real Distributor
 * Secondary sales data itemwise is deferred ("a match design," not built here).
 */

import { localDateStr } from './period.js'

export const round1 = n => (n === null || n === undefined ? null : Math.round((Number(n) || 0) * 10) / 10)

// stockTakes: fetchStockTakesForDistributors() rows (take_date-ascending, each with `items`).
// deliveredOrders: fetchDeliveredOrdersForStockReport() rows (each with `items`, delivered_at set).
// distributorIds: distributors in scope. productIds: optional explicit product filter — when
// omitted, every product that appears in any of that distributor's takes is included.
export function computeStockTakePeriods({ stockTakes = [], deliveredOrders = [], distributorIds = [], productIds = null }) {
  const periods = [] // flat list, one row per (distributor, product, period) — Detail tab source
  const latestByKey = {} // `${distributorId}|${productId}` -> most recent period — Summary tab source

  const takesByDistributor = {}
  stockTakes.forEach(t => {
    if (!takesByDistributor[t.distributor_id]) takesByDistributor[t.distributor_id] = []
    takesByDistributor[t.distributor_id].push(t)
  })

  const deliveriesByDistributor = {}
  deliveredOrders.forEach(o => {
    if (!deliveriesByDistributor[o.distributor_id]) deliveriesByDistributor[o.distributor_id] = []
    ;(o.items || []).filter(it => !it.cancelled).forEach(it => {
      deliveriesByDistributor[o.distributor_id].push({
        productId: it.product_id, qty: Number(it.final_qty) || 0, date: localDateStr(o.delivered_at),
      })
    })
  })

  // Sum delivered qty for a product within (fromExclusive, toInclusive] local-calendar-date bounds.
  // fromExclusive === null means "no lower bound" (period 0, before the distributor's first take).
  const receiptsFor = (distributorId, productId, fromExclusive, toInclusive) =>
    (deliveriesByDistributor[distributorId] || [])
      .filter(d => d.productId === productId && d.date <= toInclusive && (fromExclusive === null || d.date > fromExclusive))
      .reduce((s, d) => s + d.qty, 0)

  distributorIds.forEach(distributorId => {
    const takes = takesByDistributor[distributorId] || []
    if (takes.length === 0) return

    const scopeProducts = productIds || Array.from(new Set(takes.flatMap(t => (t.items || []).map(it => it.product_id))))

    scopeProducts.forEach(productId => {
      let lastKnownClosing = null // carries the last real count forward across a take that skipped this product
      let productMeta = null

      takes.forEach((take, i) => {
        const item = (take.items || []).find(it => it.product_id === productId)
        if (item?.product && !productMeta) productMeta = item.product

        const from = i === 0 ? null : takes[i - 1].take_date
        const to = take.take_date
        const opening = i === 0 ? 0 : lastKnownClosing // null here means "unknown" (never counted before)
        const receipts = receiptsFor(distributorId, productId, from, to)
        const closing = item ? Number(item.physical_qty) || 0 : null // absent = not recounted this take, not zero
        const sales = closing === null || opening === null ? null : opening + receipts - closing

        const period = { distributorId, productId, productName: productMeta?.name || productId, unit: productMeta?.unit, from, to, opening, receipts, sales, closing }
        periods.push(period)
        if (closing !== null) lastKnownClosing = closing
        latestByKey[`${distributorId}|${productId}`] = period
      })
    })
  })

  return { periods, latest: Object.values(latestByKey) }
}
