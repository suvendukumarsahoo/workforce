import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn } from '../../components/ui.jsx'
import AttendanceDayDetailSheet from '../../components/AttendanceDayDetailSheet.jsx'
import { fmtTs } from '../../lib/journeyTimeline.js'
import * as db from '../../lib/db.js'

// Stage 1 (Punch-In) + Stage 2 (Activity) approval queues — moved off the main Attendance page
// (now an HR Dashboard, see Attendance.jsx) onto their own menu so approval work is separated from
// the at-a-glance metrics view. Same db.js functions as before, just relocated call sites — no
// behavior change to the approval logic itself.
export default function AttendanceApprovals() {
  const { currentUser, role } = useAuth()
  const { users } = useData()
  const [punchQueue, setPunchQueue] = useState([])
  const [activityQueue, setActivityQueue] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [dayDetail, setDayDetail] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const load = async () => {
    const [{ data: pq, error: pqErr }, { data: aq, error: aqErr }] = await Promise.all([
      db.fetchPendingPunchApprovals(),
      db.fetchPendingActivityApprovals(),
    ])
    setPunchQueue(pq || [])
    setActivityQueue(aq || [])
    setLoadError(pqErr?.message || aqErr?.message || null)
  }

  useEffect(() => { load() }, [])

  const approveStage1 = async (id) => {
    setBusyId(id)
    const { data, error } = await db.approvePunchStage1(id, currentUser?.id)
    setBusyId(null)
    setDayDetail(d => d && d.punch?.id === id ? { ...d, punch: data || d.punch } : d)
    if (error) { setLoadError('Stage 1 approval failed — ' + error.message); return { error } }
    await load()
    return { error: null }
  }

  const approveStage2 = async (id) => {
    setBusyId(id)
    const { data, error } = await db.approveActivityStage2(id, currentUser?.id)
    setBusyId(null)
    setDayDetail(d => d && d.punch?.id === id ? { ...d, punch: data || d.punch } : d)
    if (error) { setLoadError('Stage 2 approval failed — ' + error.message); return { error } }
    await load()
    return { error: null }
  }

  const approveWaiver = async (id) => {
    setBusyId(id)
    const punch = dayDetail?.punch
    const fn = punch?.rule_waiver_status === 'stage1_approved'
      ? () => db.approveWaiverStage2(id, currentUser?.id)
      : () => db.approveWaiverStage1(id, currentUser?.id, punch?.rule?.approver1_role)
    const { data, error } = await fn()
    setBusyId(null)
    setDayDetail(d => d && d.punch?.id === id ? { ...d, punch: data || d.punch } : d)
    if (error) { setLoadError('Waiver approval failed — ' + error.message); return { error } }
    await load()
    return { error: null }
  }

  const openQueueItem = (p) => {
    const user = (users || []).find(u => String(u.id) === String(p.user_id)) || p.user
    setDayDetail({ user, date: p.date, punch: p })
  }

  return (
    <div>
      {loadError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#991b1b' }}>
          Could not load approval data — {loadError}
        </div>
      )}

      <Card>
        <CH title="Stage 1 — Punch-In Approvals" sub={`${punchQueue.length} punch(es)`} />
        {punchQueue.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Nothing waiting on stage 1</div>}
        {punchQueue.map(p => (
          <div key={p.id} onClick={() => openQueueItem(p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user?.name || '—'}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {p.date} · {fmtTs(p.punch_in_at)}{p.location_flag ? ` · ⚠ ${p.flag_reason || 'location deviation'}` : ''}
              </div>
            </div>
            <Btn sm v="pri" disabled={busyId === p.id} onClick={(e) => { e.stopPropagation(); approveStage1(p.id) }} style={{ flexShrink: 0 }}>
              {busyId === p.id ? 'Approving...' : 'Approve'}
            </Btn>
          </div>
        ))}
      </Card>

      <Card>
        <CH title="Stage 2 — Activity Approvals" sub={`${activityQueue.length} day(s)`} />
        {activityQueue.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Nothing waiting on stage 2</div>}
        {activityQueue.map(p => (
          <div key={p.id} onClick={() => openQueueItem(p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user?.name || '—'}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{p.date} · Punch-in already approved — review activity to complete</div>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>›</div>
          </div>
        ))}
      </Card>

      {dayDetail && (
        <AttendanceDayDetailSheet
          detail={dayDetail}
          onClose={() => setDayDetail(null)}
          onApproveStage1={approveStage1}
          onApproveStage2={approveStage2}
          onApproveWaiver={approveWaiver}
          viewerRoleId={role?.id}
          viewerUserId={currentUser?.id}
          busyId={busyId}
        />
      )}
    </div>
  )
}
