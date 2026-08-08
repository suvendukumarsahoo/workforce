export const fmtTs = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

export const fmtDur = ms => {
  if (ms == null || ms < 0) return '—'
  const mins = Math.round(ms / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  if (hrs < 24) return rem ? `${hrs}h ${rem}m` : `${hrs}h`
  const days = Math.floor(hrs / 24)
  const remH = hrs % 24
  return remH ? `${days}d ${remH}h` : `${days}d`
}

export const CATEGORY_COLOR = {
  accept: '#3b82f6',
  park: '#6366f1',
  load_start: '#0ea5e9',
  load_complete: '#0891b2',
  journey_start: '#8b5cf6',
  arrived: '#f59e0b',
  unloading: '#3b82f6',
  delivered: '#10b981',
  return_base: '#f97316',
  submitted: '#6b7280',
  approved: '#10b981',
  // Generic activity-log categories (5 Aug 2026 — Attendance Stage 2's non-driver vein diagram,
  // see activityTimeline.js) — additive only, none of the driver keys above changed.
  punch_in: '#0ea5e9',
  create: '#3b82f6',
  update: '#6366f1',
  approve: '#10b981',
  reject: '#ef4444',
  submit: '#f59e0b',
}

// Orders in delivery (stop) order — route_plan.stops carries the optimized sequence;
// falls back to raw fetch order if a route was never computed.
export function stopSequence(allocation, orders) {
  const stopIds = allocation.route_plan?.stops?.map(s => s.order_id) || []
  return stopIds.length
    ? stopIds.map(id => orders.find(o => o.id === id)).filter(Boolean)
    : (orders || [])
}

export function buildJourneyEvents(allocation, orders) {
  const events = []
  const push = (label, ts, category, tag) => { if (ts) events.push({ label, ts, category, tag }) }

  push('Load Accepted', allocation.driver_accepted_at, 'accept')
  push('Vehicle Parked for Loading', allocation.vehicle_parked_at, 'park')
  push('Loading Started', allocation.loading_started_at, 'load_start')
  push('Loading Complete', allocation.loading_completed_at, 'load_complete')
  push('Start Journey', allocation.journey_started_at, 'journey_start')

  stopSequence(allocation, orders).forEach((o, idx) => {
    const stopNo = idx + 1
    const name = o.distributor?.name || `Order #${o.id}`
    push('Arrived', o.arrived_at, 'arrived', `Stop ${stopNo} · ${name}`)
    push('Unloading Started', o.unloading_started_at, 'unloading', `Stop ${stopNo} · ${name}`)
    push('Delivery Complete', o.delivered_at, 'delivered', `Stop ${stopNo} · ${name}`)
  })

  push('Return to Base', allocation.returning_to_base_at, 'return_base')
  push('Journey Complete Submitted', allocation.journey_complete_submitted_at, 'submitted')
  push('Journey Complete Approved', allocation.journey_complete_approved_at, 'approved')

  events.sort((a, b) => new Date(a.ts) - new Date(b.ts))
  return events
}

// Consolidated header stats used by both the on-screen timeline card and the PDF export.
export function journeySummary(allocation, orders) {
  const stops = stopSequence(allocation, orders)
  const stopTowns = stops.map(o => o.distributor?.town || o.distributor?.area || o.distributor?.name || `Order #${o.id}`)

  const start = allocation.journey_started_at || null
  const end = allocation.journey_complete_submitted_at || allocation.returning_to_base_at || null
  const totalElapsedMs = start && end ? new Date(end) - new Date(start) : null

  const estimatedMin = allocation.route_plan?.total_duration_min ?? null
  const actualMin = totalElapsedMs != null ? Math.round(totalElapsedMs / 60000) : null
  const diffMin = estimatedMin != null && actualMin != null ? actualMin - estimatedMin : null

  return { stopTowns, start, end, totalElapsedMs, estimatedMin, actualMin, diffMin }
}
