import { fmtTs, fmtDur, CATEGORY_COLOR, buildJourneyEvents, journeySummary } from '../lib/journeyTimeline.js'

const Stat = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{value ?? '—'}</div>
  </div>
)

export default function JourneyVeinTimeline({ allocation, orders, totalQtyLoaded }) {
  const events = buildJourneyEvents(allocation, orders || [])
  const summary = journeySummary(allocation, orders || [])
  const stopsTotal = (orders || []).length
  const stopsDelivered = (orders || []).filter(o => o.delivered_at).length

  const diffLabel = summary.diffMin == null
    ? '—'
    : summary.diffMin === 0
      ? 'On estimate'
      : summary.diffMin > 0
        ? `+${fmtDur(summary.diffMin * 60000)} over`
        : `-${fmtDur(Math.abs(summary.diffMin) * 60000)} under`

  return (
    <div>
      {/* header */}
      <div style={{ padding: '12px 14px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Driver Journey Timeline</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{events.length} activities logged</div>
        </div>

        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <strong>{allocation.driver?.name || 'Driver —'}</strong>
          <span style={{ color: '#9ca3af' }}> · </span>
          <strong>{allocation.vehicle?.vehicle_number || 'Vehicle —'}</strong>
        </div>

        <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 10, lineHeight: 1.5 }}>
          <strong>Route:</strong>{' '}
          {summary.stopTowns.length
            ? summary.stopTowns.map((t, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: '#d1d5db' }}> → </span>}
                {`Stop ${i + 1}: ${t}`}
              </span>
            ))
            : '—'}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Stat label="Journey Start" value={fmtTs(summary.start)} />
          <Stat label="Journey End" value={fmtTs(summary.end)} />
          <Stat label="Total Elapsed" value={summary.totalElapsedMs != null ? fmtDur(summary.totalElapsedMs) : '—'} />
          <Stat label="Total Qty Loaded" value={totalQtyLoaded ?? '—'} />
          <Stat label="Estimated Journey Time" value={summary.estimatedMin != null ? fmtDur(summary.estimatedMin * 60000) : '—'} />
          <Stat label="Est. vs Actual" value={diffLabel} />
        </div>
      </div>

      {/* vein diagram */}
      <div style={{ padding: '18px 20px 6px 30px' }}>
        {events.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>No activity recorded yet</div>
        )}
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

      {/* footer */}
      <div style={{ padding: '10px 14px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <Stat label="Stops Delivered" value={`${stopsDelivered} / ${stopsTotal}`} />
        <Stat label="Submitted for Approval" value={fmtTs(allocation.journey_complete_submitted_at)} />
      </div>
    </div>
  )
}
