import { useState, useEffect } from 'react'
import { Sheet, Btn } from './ui.jsx'
import { buildJourneyEvents, fmtTs } from '../lib/journeyTimeline.js'
import { buildActivityEvents } from '../lib/activityTimeline.js'
import VeinTimeline from './VeinTimeline.jsx'
import { APPROVER_ROLE_LABEL, eligibleForWaiverStage } from '../lib/attendanceRules.js'
import * as db from '../lib/db.js'

const ALLOCATION_DATE_FIELDS = [
  'driver_accepted_at', 'vehicle_parked_at', 'loading_started_at', 'loading_completed_at',
  'journey_started_at', 'returning_to_base_at', 'journey_complete_submitted_at', 'journey_complete_approved_at',
]

// Local calendar date, NOT toISOString()'s UTC date — keeps this in sync with how `date` columns
// are written in db.js (see todayStr() there) so late-night/early-morning events land on the same
// day here as they do in the roster/self-view calendars.
const dateOf = iso => {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Shared day-detail Sheet — opened from either the HR Dashboard's Attendance Roster (view-only,
// `readOnly`) or the standalone Attendance Approval page's Stage 1/Stage 2 queues (fully
// actionable). Extracted out of Attendance.jsx so both pages reuse the exact same punch summary /
// rule-waiver badge / Stage 1+2 status / activity vein-timeline rendering instead of forking it.
export default function AttendanceDayDetailSheet({
  detail, onClose, onApproveStage1, onApproveStage2, onApproveWaiver,
  viewerRoleId, viewerUserId, busyId, zIndex, readOnly = false,
}) {
  const { user, date, punch } = detail
  const isDriver = user.role_id === 'r7'
  const [driverEvents, setDriverEvents] = useState(null)
  const [activityEvents, setActivityEvents] = useState(null)
  const [actionError, setActionError] = useState(null)

  const runApprove = async (fn, id) => {
    setActionError(null)
    const { error } = await fn(id)
    if (error) setActionError(error.message)
  }

  useEffect(() => {
    if (!isDriver) return

    const fetchAllocations = user.member_id ? db.fetchDriverAllocations(user.member_id) : Promise.resolve({ data: [] })

    fetchAllocations
      .then(({ data: allocations }) => {
        const sameDayAllocations = (allocations || []).filter(a => {
          if (ALLOCATION_DATE_FIELDS.some(f => dateOf(a[f]) === date)) return true
          // Multi-day journeys: catch dates that fall inside the start→submitted/return window
          // even when no single top-level timestamp lands exactly on this date.
          if (a.journey_started_at) {
            const startDate = dateOf(a.journey_started_at)
            const endDate = dateOf(a.journey_complete_submitted_at || a.returning_to_base_at) || dateOf(new Date().toISOString())
            return date >= startDate && date <= endDate
          }
          return false
        })
        return Promise.all(sameDayAllocations.map(async a => {
          const { data: orders } = await db.fetchAllocationOrders(a.id)
          return buildJourneyEvents(a, orders || [])
        }))
      })
      .then(withOrders => {
        const events = withOrders.flat().filter(ev => dateOf(ev.ts) === date).sort((a, b) => new Date(a.ts) - new Date(b.ts))
        setDriverEvents(events)
      })
  }, [isDriver, user.member_id, date])

  useEffect(() => {
    if (isDriver) return
    db.fetchActivityLog(user.id, date).then(({ data }) => {
      setActivityEvents(buildActivityEvents(punch, data || []))
    })
  }, [isDriver, user.id, date, punch])

  const waiverEligible = !readOnly && punch && punch.rule_status ? eligibleForWaiverStage(punch, user, viewerRoleId, viewerUserId) : false

  return (
    <Sheet title={user.name} sub={date} onClose={onClose} zIndex={zIndex}>
      {punch ? (
        <>
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Punched in {fmtTs(punch.punch_in_at)}</div>
            <div>Distance from HQ: {punch.distance_from_hq_m != null ? `${punch.distance_from_hq_m}m` : '—'}</div>
            {punch.duty_status && (
              <div style={{ color: punch.duty_status === 'late' ? '#ef4444' : '#10b981', fontWeight: 600, marginTop: 2 }}>
                {punch.duty_status === 'late' ? `Late by ${punch.minutes_late}m` : 'On Time'}
              </div>
            )}
            {punch.location_flag && (
              <div style={{ marginTop: 6, color: '#92400e' }}>⚠ {punch.flag_reason || 'location deviation'}</div>
            )}
          </div>

          {punch.rule_status && (
            <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: punch.rule_status === 'half_day' ? '#b91c1c' : '#92400e', marginBottom: 4 }}>
                {punch.rule_status === 'half_day' ? '🟡 Half Day' : '🟠 Late Present'}
                {punch.rule?.threshold_minutes != null ? ` — over by ${punch.minutes_late - punch.rule.threshold_minutes}m` : ''}
              </div>
              {punch.rule_waiver_status === 'approved' ? (
                <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>✓ Waived</div>
              ) : readOnly ? (
                <div style={{ fontSize: 11, color: '#78350f' }}>
                  {punch.rule_waiver_status === 'stage1_approved' ? 'Awaiting Stage 2 (HR)' : `Awaiting ${APPROVER_ROLE_LABEL[punch.rule?.approver1_role] || 'review'}`}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#78350f', marginBottom: 6 }}>
                    {punch.rule_waiver_status === 'stage1_approved' ? 'Awaiting Stage 2 (HR)' : `Awaiting ${APPROVER_ROLE_LABEL[punch.rule?.approver1_role] || 'review'}`}
                  </div>
                  {waiverEligible ? (
                    <Btn sm v="pri" disabled={busyId === punch.id} onClick={() => runApprove(onApproveWaiver, punch.id)}>
                      {busyId === punch.id ? 'Approving...' : punch.rule_waiver_status === 'stage1_approved' ? 'Approve (Stage 2)' : 'Waive'}
                    </Btn>
                  ) : (
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Not yours to approve</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Stage 1 */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Stage 1 — Punch-In Approval</div>
            {punch.punch_approval_status === 'approved' ? (
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>✓ Approved</div>
            ) : readOnly ? (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Pending — see Attendance Approval</div>
            ) : (
              <Btn sm v="pri" disabled={busyId === punch.id} onClick={() => runApprove(onApproveStage1, punch.id)}>
                {busyId === punch.id ? 'Approving...' : 'Approve Punch-In'}
              </Btn>
            )}
          </div>

          {actionError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: '#991b1b' }}>
              {actionError}
            </div>
          )}

          {/* Stage 2 */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Stage 2 — Activity Approval</div>
            {punch.activity_approval_status === 'approved' ? (
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>✓ Approved — marked Present</div>
            ) : punch.punch_approval_status !== 'approved' ? (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Complete Stage 1 first</div>
            ) : readOnly ? (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Pending — see Attendance Approval</div>
            ) : (
              <Btn sm v="pri" disabled={busyId === punch.id} onClick={() => runApprove(onApproveStage2, punch.id)}>
                {busyId === punch.id ? 'Approving...' : 'Approve Activity'}
              </Btn>
            )}
          </div>
        </>
      ) : (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
          Absent — no punch-in recorded
        </div>
      )}

      {punch && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Activity — {date}</div>
          {isDriver ? (
            <>
              {driverEvents === null && <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading...</div>}
              {driverEvents?.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>No load/journey activity recorded this day</div>}
              {driverEvents?.map((ev, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{ev.label}{ev.tag ? ` — ${ev.tag}` : ''}</div>
                  <div style={{ color: '#6b7280', marginTop: 1 }}>{fmtTs(ev.ts)}</div>
                </div>
              ))}
            </>
          ) : activityEvents === null ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading...</div>
          ) : (
            <VeinTimeline events={activityEvents} />
          )}
        </>
      )}
    </Sheet>
  )
}
