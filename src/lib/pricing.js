// Pricing Master resolution — pure functions only, same "compute from raw fetched history" pattern
// as stockReport.js/achievementEngine.js (no separate synced "current price" table to drift out of
// sync with the approval history).
//
// Cascade, most specific wins: an approved distributor-specific override > an approved override for
// the distributor's assigned tier > products.price (the flat base, which base-scope approvals write
// back to directly — see db.js's approvePriceChangeRequest — so any reader that doesn't go through
// this cascade at all, e.g. Distributor Secondary's cart, still sees a correct, current base price).

// Builds { byDistributor: Map<"productId|distributorId", price>, byTier: Map<"productId|tierId", price> }
// from the full price_change_requests history — only 'approved' rows count, and where several exist
// for the same scope (a price changed more than once), the latest approved_at wins.
export function buildPriceOverrideMaps(requests) {
  const byDistributor = new Map()
  const byTier = new Map()
  const latestAt = new Map() // same key-space as the two maps above, tracks the winning row's approved_at

  for (const r of requests || []) {
    if (r.status !== 'approved' || r.scope_type === 'base') continue
    const isDistributor = r.scope_type === 'distributor'
    if (isDistributor && !r.distributor_id) continue
    if (!isDistributor && !r.tier_id) continue

    const key = isDistributor ? `${r.product_id}|${r.distributor_id}` : `${r.product_id}|${r.tier_id}`
    const at = r.approved_at ? new Date(r.approved_at).getTime() : 0
    const prevAt = latestAt.get(key)
    if (prevAt !== undefined && prevAt >= at) continue // an already-seen row for this scope is newer or equal

    latestAt.set(key, at)
    const target = isDistributor ? byDistributor : byTier
    target.set(key, Number(r.proposed_price))
  }

  return { byDistributor, byTier }
}

// Resolves the effective rate for one product against one distributor. `product`/`distributor` are
// the already-loaded rows from useData() context (distributor may be null/undefined — falls straight
// through to base in that case, e.g. no distributor picked yet in a cart).
export function resolveProductPrice(product, distributor, maps) {
  if (!product) return 0
  const { byDistributor, byTier } = maps || {}

  if (distributor?.id && byDistributor) {
    const dKey = `${product.id}|${distributor.id}`
    if (byDistributor.has(dKey)) return byDistributor.get(dKey)
  }
  if (distributor?.price_tier_id && byTier) {
    const tKey = `${product.id}|${distributor.price_tier_id}`
    if (byTier.has(tKey)) return byTier.get(tKey)
  }
  return Number(product.price) || 0
}

// Every override (distributor + tier) currently active for one product, for the "Current Prices" tab
// — used alongside resolveProductPrice rather than instead of it, since that tab needs to list every
// override, not resolve one specific distributor's rate.
export function activeOverridesForProduct(productId, requests) {
  const { byDistributor, byTier } = buildPriceOverrideMaps(requests)
  const distributorRows = []
  for (const [key, price] of byDistributor) {
    const [pid, distributorId] = key.split('|')
    if (pid === productId) distributorRows.push({ distributorId, price })
  }
  const tierRows = []
  for (const [key, price] of byTier) {
    const [pid, tierId] = key.split('|')
    if (pid === productId) tierRows.push({ tierId, price })
  }
  return { distributorRows, tierRows }
}
