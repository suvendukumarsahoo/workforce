import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet } from '../../components/ui.jsx'
import { FREQUENCY_LABELS } from '../../lib/stockTakeSchedule.js'
import * as db from '../../lib/db.js'

// HR (r4) + Admin (r1) approve a Manager's proposed Stock Take Schedule change. Broad fetch +
// client-side display (no role/ownership filter needed — HR approves org-wide, unlike the Manager
// waiver queues elsewhere in the app), same shape as AttendanceRules.jsx's approval queues.
export default function StockTakeRuleApprovals() {
  const { currentUser } = useAuth()
  const { users, showToast } = useData()
  const [pending, setPending] = useState(null)
  const [selected, setSelected] = useState(null)
  const [reason, setReason] = useState('')

  const load = async () => {
    const { data } = await db.fetchPendingStockTakeRuleChanges()
    setPending(data || [])
  }
  useEffect(() => { load() }, [])

  // pending_submitted_by has no queryable FK embeddable alongside distributor — resolve client-side
  // against the already-loaded users list, same convention as secondary_orders.member_id.
  const submitterName = uid => (users || []).find(u => String(u.id) === String(uid))?.name || uid

  const approve = async row => {
    const { error } = await db.approveStockTakeRuleChange(row.id, currentUser?.id)
    if (error) { showToast('Error approving'); return }
    showToast('Schedule approved')
    setSelected(null)
    load()
  }
  const reject = async row => {
    const { error } = await db.rejectStockTakeRuleChange(row.id, currentUser?.id, reason)
    if (error) { showToast('Error rejecting'); return }
    showToast('Change rejected')
    setSelected(null); setReason('')
    load()
  }

  return (
    <div>
      <Card>
        <CH title="Stock Take Schedule Approvals" sub={`${(pending || []).length} pending change(s)`} />
        {pending !== null && pending.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No pending changes</div>}
        {(pending || []).map(r => (
          <div key={r.id} onClick={() => setSelected(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.distributor?.name || r.distributor_id}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Proposed by {submitterName(r.pending_submitted_by)}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
              {FREQUENCY_LABELS[r.pending_frequency]} · {r.pending_deviation_limit_days}d
            </div>
          </div>
        ))}
      </Card>

      {selected && (
        <Sheet title={selected.distributor?.name || selected.distributor_id} sub="Proposed stock take schedule" onClose={() => setSelected(null)}>
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Frequency: <strong>{FREQUENCY_LABELS[selected.pending_frequency]}</strong></div>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Deviation Limit: <strong>{selected.pending_deviation_limit_days} day(s)</strong></div>
            {selected.status === 'approved' && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                Currently active: {FREQUENCY_LABELS[selected.frequency]} · {selected.deviation_limit_days}-day deviation limit
              </div>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Reason (required if rejecting)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn v="pri" full onClick={() => approve(selected)}>Approve</Btn>
            <Btn full onClick={() => { if (!reason) { showToast('Add a reason before rejecting'); return }; reject(selected) }}>Reject</Btn>
          </div>
        </Sheet>
      )}
    </div>
  )
}
