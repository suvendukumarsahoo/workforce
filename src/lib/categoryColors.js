// Fixed categorical palette (validated CVD-safe as an 8-color set — dataviz skill's
// scripts/validate_palette.js, PASS). Single source of truth so any chart that needs a stable
// per-category/per-entity color (ContributionDonut's pie-slice fallback, NeedleGauge's per-category
// arc color, etc.) assigns the SAME color to the SAME entity wherever it appears, rather than each
// chart inventing its own cycling order. Kept out of GoalBarChart.jsx itself so that file can stay
// component-only (a plain constant export there trips react-refresh/only-export-components).
export const CATEGORY_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1']

// Stable color for one entity out of a list — keyed to the entity's own position in `allItems`
// (a master/unsorted list), NOT its position in whatever filtered/sorted subset is being rendered,
// so an entity keeps the same color across renders even as rankings/filters shuffle it around.
export function colorForEntity(id, allItems) {
  const idx = (allItems || []).findIndex(x => x.id === id)
  return CATEGORY_PALETTE[(idx >= 0 ? idx : 0) % CATEGORY_PALETTE.length]
}
