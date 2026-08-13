/**
 * lib/stockReport.js
 * Pure aggregation for the Distributor Stock & Sales Report. No DB calls — mirrors
 * achievementEngine.js's shape (fed pre-loaded arrays, returns computed rows).
 *
 * Each distributor's physical stock takes (sorted oldest-first) still chop its timeline into
 * stock-take-to-stock-take periods, and Closing is still that period's real physical count (ground
 * truth, never calculated) — the physical-count schedule/punch-gate machinery elsewhere in the app is
 * completely unchanged by any of this. What changed: Sales is no longer a derived plug — it's real
 * delivered quantity from Distributor Secondary's Order Delivery tracking (qty minus any returned
 * qty for a partial delivery). Opening for the very first period comes from an approved one-time
 * Opening Stock entry if the distributor has one, else 0 (unchanged fallback). With Sales now real,
 * a Calculated Closing (Opening + Receipts − Sales) can be computed independently of the physical
 * count and compared against it — `variance` is that comparison, the itemwise reconciliation this
 * report always intended to build ("a match design", originally deferred).
 */

import { localDateStr } from './period.js'

export const round1 = n => (n === null || n === undefined ? null : Math.round((Number(n) || 0) * 10) / 10)

// stockTakes: fetchStockTakesForDistributors() rows (take_date-ascending, each with `items`).
// invoices: fetchReceiptsForStockReport() rows (approved invoices, each with `lines` + embedded
//   `order.delivered_at`). secondaryOrders: fetchDeliveredSecondaryOrdersForStockReport() rows (each
//   with `items` + embedded `delivery.marked_at`/`delivery.delivery_items`). openingStocks:
//   fetchOpeningStocks() rows (each with `items`; only `status === 'approved'` ones are used).
// distributorIds: distributors in scope. productIds: optional explicit product filter — when
// omitted, every product that appears in any of that distributor's takes is included.
export function computeStockTakePeriods({
  stockTakes = [], invoices = [], secondaryOrders = [], openingStocks = [],
  distributorIds = [], productIds = null,
}) {
  const periods = [] // flat list, one row per (distributor, product, period) — Detail tab source
  const latestByKey = {} // `${distributorId}|${productId}` -> most recent period — Summary tab source

  const takesByDistributor = {}
  stockTakes.forEach(t => {
    if (!takesByDistributor[t.distributor_id]) takesByDistributor[t.distributor_id] = []
    takesByDistributor[t.distributor_id].push(t)
  })

  // Receipts: an order-linked invoice only counts once the driver has actually confirmed delivery;
  // a legacy/manual invoice (no order_id — pre-dates the digital order pipeline) has nothing to
  // confirm, so it counts as soon as it's approved (already guaranteed by the fetch itself).
  const receiptsByDistributor = {}
  invoices.forEach(inv => {
    if (inv.order_id && !inv.order?.delivered_at) return
    const date = inv.order?.delivered_at ? localDateStr(new Date(inv.order.delivered_at)) : localDateStr(new Date(inv.date))
    ;(inv.lines || []).forEach(l => {
      if (!receiptsByDistributor[inv.distributor_id]) receiptsByDistributor[inv.distributor_id] = []
      receiptsByDistributor[inv.distributor_id].push({ productId: l.product_id, qty: Number(l.qty) || 0, date })
    })
  })

  // Sales: delivered qty (ordered qty minus any returned qty from a partial delivery), dated to
  // when the delivery outcome was actually marked — not the original order date, matching Receipts'
  // own "dated to the confirming event, not the paperwork" convention.
  const salesByDistributor = {}
  secondaryOrders.forEach(o => {
    if (!o.delivery?.marked_at) return
    const date = localDateStr(new Date(o.delivery.marked_at))
    const returnedByItem = {}
    ;(o.delivery.delivery_items || []).forEach(di => { returnedByItem[di.order_item_id] = Number(di.returned_qty) || 0 })
    ;(o.items || []).forEach(it => {
      const delivered = Math.max(0, (Number(it.qty) || 0) - (returnedByItem[it.id] || 0))
      if (!salesByDistributor[o.distributor_id]) salesByDistributor[o.distributor_id] = []
      salesByDistributor[o.distributor_id].push({ productId: it.product_id, qty: delivered, date })
    })
  })

  const approvedOpeningByKey = {} // `${distributorId}|${productId}` -> one-time baseline qty
  openingStocks.forEach(os => {
    if (os.status !== 'approved') return
    ;(os.items || []).forEach(it => { approvedOpeningByKey[`${os.distributor_id}|${it.product_id}`] = Number(it.qty) || 0 })
  })

  // Sum a product's qty events within (fromExclusive, toInclusive] local-calendar-date bounds.
  // fromExclusive === null means "no lower bound" (this distributor/product's very first period).
  const sumFor = (bucket, distributorId, productId, fromExclusive, toInclusive) =>
    (bucket[distributorId] || [])
      .filter(d => d.productId === productId && d.date <= toInclusive && (fromExclusive === null || d.date > fromExclusive))
      .reduce((s, d) => s + d.qty, 0)

  distributorIds.forEach(distributorId => {
    const takes = takesByDistributor[distributorId] || []
    if (takes.length === 0) return

    const scopeProducts = productIds || Array.from(new Set(takes.flatMap(t => (t.items || []).map(it => it.product_id))))

    scopeProducts.forEach(productId => {
      let lastKnownClosing = null // carries the last real physical count forward across a take that skipped this product
      let productMeta = null

      takes.forEach((take, i) => {
        const item = (take.items || []).find(it => it.product_id === productId)
        if (item?.product && !productMeta) productMeta = item.product

        const from = i === 0 ? null : takes[i - 1].take_date
        const to = take.take_date
        const opening = i === 0 ? (approvedOpeningByKey[`${distributorId}|${productId}`] ?? 0) : lastKnownClosing
        const receipts = sumFor(receiptsByDistributor, distributorId, productId, from, to)
        const sales = sumFor(salesByDistributor, distributorId, productId, from, to)
        const closing = item ? Number(item.physical_qty) || 0 : null // physical count, ground truth — never calculated
        const calculatedClosing = opening === null ? null : opening + receipts - sales
        const variance = (closing === null || calculatedClosing === null) ? null : round1(closing - calculatedClosing)

        const period = {
          distributorId, productId, productName: productMeta?.name || productId, unit: productMeta?.unit,
          from, to, opening, receipts, sales, closing, calculatedClosing, variance,
        }
        periods.push(period)
        if (closing !== null) lastKnownClosing = closing
        latestByKey[`${distributorId}|${productId}`] = period
      })
    })
  })

  return { periods, latest: Object.values(latestByKey) }
}
