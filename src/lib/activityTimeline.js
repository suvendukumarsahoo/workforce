import { fmtTs, fmtDur } from './journeyTimeline.js'

// Re-exported so callers only need one import for the generic (non-driver) activity vein
// diagram — same formatters journeyTimeline.js already uses, source-agnostic, no changes needed.
export { fmtTs, fmtDur }

/**
 * Builds a vein-diagram-ready events array for a non-driver user's day: Punched In, followed by
 * every logged `activity_log` row for that day, in order. Same output shape as
 * journeyTimeline.js's `buildJourneyEvents` — { label, ts, category, tag } — so both feed the
 * same VeinTimeline renderer.
 *
 * `punch`: an `attendance_punches` row (needs `punch_in_at`).
 * `logRows`: `activity_log` rows for this user+date (needs `label`, `occurred_at`, `entity`).
 */
export function buildActivityEvents(punch, logRows) {
  const events = []
  if (punch?.punch_in_at) events.push({ label: 'Punched In', ts: punch.punch_in_at, category: 'punch_in' })
  ;(logRows || []).forEach(row => {
    events.push({ label: row.label, ts: row.occurred_at, category: row.entity })
  })
  events.sort((a, b) => new Date(a.ts) - new Date(b.ts))
  return events
}
