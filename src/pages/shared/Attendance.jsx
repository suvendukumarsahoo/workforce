import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Btn, Sheet, AttCal } from '../../components/ui.jsx'
import MyAttendanceCalendar from '../../components/MyAttendanceCalendar.jsx'
import { buildJourneyEvents, fmtTs } from '../../lib/journeyTimeline.js'
import * as db from '../../lib/db.js'

const ALLOCATION_DATE_FIELDS = [
  'driver_accepted_at', 'vehicle_parked_at', 'loading_started_at', 'loading_completed_at',
  'journey_started_at', 'returning_to_base_at', 'journey_complete_submitted_at', 'journey_complete_approved_at',
]

const dateOf = iso => iso ? new Date(iso).toISOString().split('T')[0] : null

export default function Attendance() {
  const { role } = useAuth()
  const isHR = role?.id === 'r4' || role?.id === 'r1'
  return isHR ? <AttendanceHR /> : <MyAttendanceCalendar />
}

function AttendanceHR() {
  const { currentUser } = useAuth()
  const { users } = useData()
  const [pending, setPending] = useState([])
  const [roster, setRoster] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [dayDetail, setDayDetail] = useState(null)

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const today = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()

  const load = async () => {
    const { data: p } = await db.fetchPendingAttendanceApprovals()
    setPending(p || [])
    const { data: r } = await db.fetchAllAttendanceForMonth(month, year)
    setRoster(r || [])
  }

  useEffect(() => {
    db.fetchPendingAttendanceApprovals().then(({ data }) => setPending(data || []))
    db.fetchAllAttendanceForMonth(month, year).then(({ data }) => setRoster(data || []))
  }, [])

  const approve = async (id) => {
    setBusyId(id)
    await db.approveAttendancePunch(id, currentUser?.id)
    setBusyId(null)
    await load()
  }

  const punchesFor = userId => roster.filter(p => p.user_id === userId)

  const openDay = (user, dayNum, punches) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    const punch = punches.find(p => p.date === date)
    setDayDetail({ user, date, punch })
  }

  return (
    <div>
      <Card>
        <CH title="Pending Location Approvals" sub={`${pending.length} punch(es)`} />
        {pending.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No flagged punches</div>}
        {pending.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user?.name || '—'}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{p.date} · {fmtTs(p.punch_in_at)} · {p.flag_reason || 'Location deviation'}</div>
            </div>
            <Btn sm v="pri" disabled={busyId === p.id} onClick={() => approve(p.id)} style={{ flexShrink: 0 }}>
              {busyId === p.id ? 'Approving...' : 'Approve'}
            </Btn>
          </div>
        ))}
      </Card>

      <Card>
        <CH title="Attendance Roster" sub={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
        {(users || []).map(u => {
          const punches = punchesFor(u.id)
          const present = punches.length
          const absent = Math.max(0, today - present)
          const rate = today > 0 ? Math.round((present / today) * 100) : 0
          const days = Array.from({ length: daysInMonth }, (_, i) => {
            const dayNum = i + 1
            if (dayNum > today) return 'W'
            return punches.some(p => new Date(p.date).getDate() === dayNum) ? 'P' : 'A'
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
          onApprove={async (id) => { await approve(id); setDayDetail(d => d && { ...d, punch: { ...d.punch, approval_status: 'approved' } }) }}
          busyId={busyId}
        />
      )}
    </div>
  )
}

function DayDetailSheet({ detail, onClose, onApprove, busyId }) {
  const { user, date, punch } = detail
  const isDriver = user.role_id === 'r7'
  const [driverEvents, setDriverEvents] = useState(null)

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
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 4 }}>Present — Punched in {fmtTs(punch.punch_in_at)}</div>
          <div>Distance from HQ: {punch.distance_from_hq_m != null ? `${punch.distance_from_hq_m}m` : '—'}</div>
          {punch.location_flag && (
            <div style={{ marginTop: 6, color: punch.approval_status === 'pending' ? '#92400e' : '#065f46' }}>
              {punch.approval_status === 'pending' ? '⚠ Flagged — ' : '✓ Reviewed — '}{punch.flag_reason || 'location deviation'}
            </div>
          )}
          {punch.approval_status === 'pending' && (
            <Btn sm v="pri" disabled={busyId === punch.id} onClick={() => onApprove(punch.id)} style={{ marginTop: 10 }}>
              {busyId === punch.id ? 'Approving...' : 'Approve'}
            </Btn>
          )}
        </div>
      ) : (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
          Absent — no punch-in recorded
        </div>
      )}

      {isDriver && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Driver Activity — {date}</div>
          {driverEvents === null && <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading...</div>}
          {driverEvents?.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>No load/journey activity recorded this day</div>}
          {driverEvents?.map((ev, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>{ev.label}{ev.tag ? ` — ${ev.tag}` : ''}</div>
              <div style={{ color: '#6b7280', marginTop: 1 }}>{fmtTs(ev.ts)}</div>
            </div>
          ))}
        </>
      )}
    </Sheet>
  )
}
