import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Btn, Sheet, AttCal } from '../../components/ui.jsx'
import MyAttendanceCalendar from '../../components/MyAttendanceCalendar.jsx'
import { buildJourneyEvents, fmtTs } from '../../lib/journeyTimeline.js'
import { ISSUE_CATEGORIES, hasManpowerIssue } from '../../lib/productionIssues.js'
import * as db from '../../lib/db.js'

const MANPOWER_REASONS = ISSUE_CATEGORIES.find(c => c.key === 'Manpower').reasons

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

const isFullyApproved = p => p.punch_approval_status === 'approved' && p.activity_approval_status === 'approved'

export default function Attendance() {
  const { role } = useAuth()
  const isHR = role?.id === 'r4' || role?.id === 'r1'
  return isHR ? <AttendanceHR /> : <MyAttendanceCalendar />
}

function AttendanceHR() {
  const { currentUser } = useAuth()
  const { users, products, categories } = useData()
  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'
  const manpowerFlagged = (products || []).filter(hasManpowerIssue)
  const [punchQueue, setPunchQueue] = useState([])
  const [activityQueue, setActivityQueue] = useState([])
  const [roster, setRoster] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [dayDetail, setDayDetail] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const today = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()

  const load = async () => {
    const [{ data: pq, error: pqErr }, { data: aq, error: aqErr }, { data: r, error: rErr }] = await Promise.all([
      db.fetchPendingPunchApprovals(),
      db.fetchPendingActivityApprovals(),
      db.fetchAllAttendanceForMonth(month, year),
    ])
    setPunchQueue(pq || [])
    setActivityQueue(aq || [])
    setRoster(r || [])
    setLoadError(pqErr?.message || aqErr?.message || rErr?.message || null)
  }

  useEffect(() => {
    Promise.all([
      db.fetchPendingPunchApprovals(),
      db.fetchPendingActivityApprovals(),
      db.fetchAllAttendanceForMonth(month, year),
    ]).then(([pqRes, aqRes, rRes]) => {
      setPunchQueue(pqRes.data || [])
      setActivityQueue(aqRes.data || [])
      setRoster(rRes.data || [])
      setLoadError(pqRes.error?.message || aqRes.error?.message || rRes.error?.message || null)
    })
  }, [])

  const approveStage1 = async (id) => {
    setBusyId(id)
    const { data, error } = await db.approvePunchStage1(id, currentUser?.id)
    setBusyId(null)
    // the day-detail Sheet (if open on this row) holds its own snapshot of `punch` — refresh it
    // in place so Stage 2 shows up immediately instead of only after closing and reopening.
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

  // String() guards against Supabase returning bigint columns as strings while `users.id` (if a
  // plain int4) comes back as a number — a strict === would silently never match.
  const punchesFor = userId => roster.filter(p => String(p.user_id) === String(userId))

  const openDay = (user, dayNum, punches) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    const punch = punches.find(p => p.date === date)
    setDayDetail({ user, date, punch })
  }

  const openQueueItem = (p) => {
    const user = (users || []).find(u => String(u.id) === String(p.user_id)) || p.user
    setDayDetail({ user, date: p.date, punch: p })
  }

  return (
    <div>
      {loadError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#991b1b' }}>
          Could not load attendance data — {loadError}
        </div>
      )}

      <Card>
        <CH title="Manpower Production Issues" sub={`${manpowerFlagged.length} product(s) flagged — from Warehouse Manager's Daily Stock Update`} />
        {manpowerFlagged.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
        {manpowerFlagged.map(p => (
          <div key={p.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name} <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11 }}>· {categoryName(p.category_id)}</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {MANPOWER_REASONS.filter(r => p[r.field]).map(r => (
                <span key={r.field} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>{r.label}</span>
              ))}
            </div>
          </div>
        ))}
      </Card>

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

      <Card>
        <CH title="Attendance Roster" sub={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
        {(users || []).map(u => {
          const punches = punchesFor(u.id)
          const present = punches.filter(isFullyApproved).length
          const pendingApproval = punches.length - present
          const absent = Math.max(0, today - punches.length)
          const rate = today > 0 ? Math.round((present / today) * 100) : 0
          const days = Array.from({ length: daysInMonth }, (_, i) => {
            const dayNum = i + 1
            if (dayNum > today) return 'W'
            const p = punches.find(x => new Date(x.date).getDate() === dayNum)
            if (!p) return 'A'
            return isFullyApproved(p) ? 'P' : 'X'
          })
          return (
            <div key={u.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Av av={u.avatar || '?'} color={u.color || '#6b7280'} sz={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{present}P</span>
                  <span style={{ color: '#7c3aed', fontWeight: 600 }}>{pendingApproval}X</span>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>{absent}A</span>
                  <span style={{ color: rate >= 90 ? '#10b981' : rate >= 75 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{rate}%</span>
                </div>
              </div>
              <AttCal days={days} onDayClick={dayNum => openDay(u, dayNum, punches)} />
            </div>
          )
        })}
      </Card>

      {dayDetail && (
        <DayDetailSheet
          detail={dayDetail}
          onClose={() => setDayDetail(null)}
          onApproveStage1={approveStage1}
          onApproveStage2={approveStage2}
          busyId={busyId}
        />
      )}
    </div>
  )
}

function DayDetailSheet({ detail, onClose, onApproveStage1, onApproveStage2, busyId }) {
  const { user, date, punch } = detail
  const isDriver = user.role_id === 'r7'
  const [driverEvents, setDriverEvents] = useState(null)
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

  return (
    <Sheet title={user.name} sub={date} onClose={onClose}>
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

          {/* Stage 1 */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Stage 1 — Punch-In Approval</div>
            {punch.punch_approval_status === 'approved' ? (
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>✓ Approved</div>
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
          ) : (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              Detailed activity tracking isn't available for this role yet — approve based on other context.
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
