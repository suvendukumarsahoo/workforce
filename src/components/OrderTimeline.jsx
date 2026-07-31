const timeAgo = (isoDate) => {
  if (!isoDate) return ''
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function OrderTimeline({ order }) {
  const stages = [
    { label: 'Order Created', ts: order.order_date },
    { label: 'Manager Approved', ts: order.manager_approved_at },
    { label: 'Admin Approved', ts: order.admin_confirmed_at },
    { label: 'Submitted for Picking', ts: order.admin_confirmed_at },
    { label: 'Picking Updated', ts: order.picking_updated_at },
    { label: 'Load Created', ts: order.load_created_at },
    { label: 'Journey Started', ts: order.allocation?.journey_started_at },
    { label: 'Arrived at Distributor', ts: order.arrived_at },
  ].filter(s => s.ts)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 0' }}>
      {stages.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#d1fae5', color: '#065f46' }}>
            {s.label} · {timeAgo(s.ts)}
          </div>
          {i < stages.length - 1 && <span style={{ color: '#d1d5db' }}>→</span>}
        </div>
      ))}
    </div>
  )
}