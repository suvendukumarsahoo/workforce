export function getOrderStageLabel(order) {
  if (order.load_id) return `Load Created — ${order.load_id}`
  if (order.status === 'order_submitted') return 'Awaiting Manager Approval'
  if (order.status === 'manager_approved_admin_pending') return 'Manager Approved — Admin Pending'
  if (order.status === 'submitted_for_picking') {
    if (order.picking_status === 'ready_for_load') return 'Picking Complete — Ready for Load'
    if (order.picking_status === 'picking_done') return 'Picking in Progress — Some Items Waiting'
    return 'Sent to Warehouse — Picking Pending'
  }
  if (order.status === 'confirmed') return 'Confirmed'
  return order.status
}

export function getOrderStageColor(order) {
  if (order.load_id) return '#10b981'
  if (order.status === 'submitted_for_picking' && order.picking_status === 'ready_for_load') return '#10b981'
  if (order.status === 'submitted_for_picking' && order.picking_status === 'picking_done') return '#f59e0b'
  return '#2563eb'
}