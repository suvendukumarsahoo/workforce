import { fmtTs, fmtDur, CATEGORY_COLOR } from '../lib/journeyTimeline.js'

/**
 * Generic connected-dot vertical timeline — dot + line + label + "+Xh Ym since previous activity",
 * colored by `CATEGORY_COLOR`. Same visual language as JourneyVeinTimeline.jsx's diagram (that
 * component is driver-journey-specific — its own header/route/footer are fused with an internal
 * buildJourneyEvents() call, not just this rendering loop — so this is a fresh, independent
 * component built for the generic (non-driver) activity case rather than a refactor of it, per the
 * "don't touch driver code" scope call. Some visual-pattern duplication between the two is
 * accepted here; unifying them into one shared renderer is a reasonable follow-up, not done now.
 *
 * `events`: [{ label, ts, category, tag? }] — see activityTimeline.js's buildActivityEvents().
 */
export default function VeinTimeline({ events, emptyLabel = 'No activity recorded' }) {
  if (!events || events.length === 0) {
    return <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>{emptyLabel}</div>
  }
  return (
    <div style={{ padding: '4px 20px 6px 30px' }}>
      {events.map((ev, i) => {
        const prev = events[i - 1]
        const delta = prev ? new Date(ev.ts) - new Date(prev.ts) : null
        const color = CATEGORY_COLOR[ev.category] || '#9ca3af'
        const isLast = i === events.length - 1
        return (
          <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 2 : 20 }}>
            {!isLast && (
              <div style={{ position: 'absolute', left: -20, top: 14, bottom: -6, width: 2, background: '#e5e7eb' }} />
            )}
            <div style={{
              position: 'absolute', left: -25, top: 2, width: 12, height: 12, borderRadius: '50%',
              background: color, border: '2px solid #fff', boxShadow: `0 0 0 2px ${color}33`,
            }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2937' }}>{ev.label}</span>
              {ev.tag && (
                <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}18`, borderRadius: 10, padding: '1px 7px' }}>
                  {ev.tag}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{fmtTs(ev.ts)}</div>
            {delta != null && (
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                ⏱ +{fmtDur(delta)} since previous activity
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
