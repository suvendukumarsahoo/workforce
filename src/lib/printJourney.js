import { fmtTs, fmtDur, buildJourneyEvents, journeySummary } from './journeyTimeline.js'

export function printJourneyReport({ allocation, orders, totalQtyLoaded, approvedBy, remarks }) {
  const events = buildJourneyEvents(allocation, orders || [])
  const summary = journeySummary(allocation, orders || [])

  const diffLabel = summary.diffMin == null
    ? '—'
    : summary.diffMin === 0
      ? 'On estimate'
      : summary.diffMin > 0
        ? `+${fmtDur(summary.diffMin * 60000)} over estimate`
        : `-${fmtDur(Math.abs(summary.diffMin) * 60000)} under estimate`

  const rows = events.map((ev, i) => {
    const prev = events[i - 1]
    const delta = prev ? new Date(ev.ts) - new Date(prev.ts) : null
    return `
      <tr>
        <td>${ev.label}${ev.tag ? ` <span class="tag">(${ev.tag})</span>` : ''}</td>
        <td>${fmtTs(ev.ts)}</td>
        <td style="text-align:right">${delta != null ? fmtDur(delta) : '—'}</td>
      </tr>
    `
  }).join('')

  const html = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Journey Report ${allocation.id}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 32px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 12px; margin-bottom: 20px; }
        .meta div span { color: #6b7280; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
        th { text-align: left; border-bottom: 2px solid #111827; padding: 6px; font-size: 10px; text-transform: uppercase; }
        th:last-child, td:last-child { text-align: right; }
        td { padding: 6px; border-bottom: 1px solid #e5e7eb; }
        .tag { color: #6b7280; font-weight: 400; }
        .remarks { font-size: 12px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 8px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>WorkForce</h1>
      <div class="sub">Driver Journey Report — Allocation ${allocation.id}</div>
      <div class="meta">
        <div><span>Driver:</span> ${allocation.driver?.name || '—'}</div>
        <div><span>Vehicle:</span> ${allocation.vehicle?.vehicle_number || '—'}</div>
        <div><span>From Warehouse:</span> ${allocation.warehouse?.name || '—'}</div>
        <div><span>Route:</span> ${summary.stopTowns.map((t, i) => `Stop ${i + 1}: ${t}`).join(' → ') || '—'}</div>
        <div><span>Journey Start:</span> ${fmtTs(summary.start) || '—'}</div>
        <div><span>Journey End:</span> ${fmtTs(summary.end) || '—'}</div>
        <div><span>Total Elapsed:</span> ${summary.totalElapsedMs != null ? fmtDur(summary.totalElapsedMs) : '—'}</div>
        <div><span>Total Qty Loaded:</span> ${totalQtyLoaded ?? '—'}</div>
        <div><span>Estimated Journey Time:</span> ${summary.estimatedMin != null ? fmtDur(summary.estimatedMin * 60000) : '—'}</div>
        <div><span>Est. vs Actual:</span> ${diffLabel}</div>
      </div>
      <table>
        <thead><tr><th>Activity</th><th>Timestamp</th><th>Since Previous</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${approvedBy || remarks ? `
        <div class="remarks">
          <strong>Admin Approval</strong><br/>
          ${approvedBy ? `Approved by: ${approvedBy}<br/>` : ''}
          ${remarks ? `Remarks: ${remarks}` : 'Remarks: —'}
        </div>
      ` : ''}
    </body>
    </html>
  `

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 300)
}
