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

export default function OrderStatusFlow({ order, payment, isAdmin, onAdvance, advancing }) {
  const stages = [{ label: 'Order Submitted', ts: order.order_date, done: true }]

  if (order.status === 'order_submitted') {
    stages.push({ label: 'Manager Approval Pending', current: true })
  } else {
    stages.push({ label: 'Approved', ts: order.manager_approved_at, done: true })
  }

  if (order.status === 'manager_approved_admin_pending') {
    stages.push({ label: 'Admin Approval Pending', current: true })
  } else if (order.status === 'confirmed' || order.status === 'submitted_for_picking') {
    if (payment) stages.push({ label: 'Admin Payment Received', ts: payment.verified_at, done: true })
    stages.push({
      label: 'Order Under Process',
      ts: order.admin_confirmed_at,
      done: order.status === 'submitted_for_picking',
      current: order.status === 'confirmed',
      clickable: isAdmin && order.status === 'confirmed',
    })
  }

  if (order.status === 'submitted_for_picking') {
    stages.push({ label: 'Submitted for Picking', ts: order.submitted_for_picking_at, done: true })
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '10px 0' }}>
      {stages.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            onClick={s.clickable ? onAdvance : undefined}
            style={{
              padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: s.done ? '#d1fae5' : s.current ? '#fef3c7' : '#f3f4f6',
              color: s.done ? '#065f46' : s.current ? '#92400e' : '#6b7280',
              cursor: s.clickable ? 'pointer' : 'default',
              border: s.clickable ? '1px dashed #92400e' : 'none',
            }}
          >
            {s.label}{s.ts ? ` · ${timeAgo(s.ts)}` : ''}
            {s.clickable && (advancing ? ' (updating...)' : ' (tap to advance)')}
          </div>
          {i < stages.length - 1 && <span style={{ color: '#d1d5db' }}>→</span>}
        </div>
      ))}
    </div>
  )
}