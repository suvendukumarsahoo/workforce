import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Tile, AttCal, Sheet } from '../../components/ui.jsx'
import MyAttendanceCalendar from '../../components/MyAttendanceCalendar.jsx'
import AttendanceDayDetailSheet from '../../components/AttendanceDayDetailSheet.jsx'
import AttendanceTrendChart from '../../components/charts/AttendanceTrendChart.jsx'
import { ContributionDonut } from '../../components/charts/GoalBarChart.jsx'
import { fmtTs } from '../../lib/journeyTimeline.js'
import { ISSUE_CATEGORIES, hasManpowerIssue } from '../../lib/productionIssues.js'
import { computeAttendanceStats } from '../../lib/attendanceRules.js'
import * as db from '../../lib/db.js'

const MANPOWER_REASONS = ISSUE_CATEGORIES.find(c => c.key === 'Manpower').reasons

const pad = n => String(n).padStart(2, '0')

export default function Attendance({ onNavigate }) {
  const { role } = useAuth()
  if (role?.id === 'r4' || role?.id === 'r1') return <AttendanceHR onNavigate={onNavigate} />
  return <MyAttendanceCalendar />
}

// Per-punch status, shared by the tiles/trend-chart/recent-attendance-table below — same
// Present/Pending/Absent semantics computeAttendanceStats already establishes for the monthly
// roster (fully-approved = Present, punched-but-not-fully-approved = Pending, no punch = Absent).
function statusOf(punch) {
  if (!punch) return 'absent'
  if (punch.punch_approval_status === 'approved' && punch.activity_approval_status === 'approved') return 'present'
  return 'pending'
}
const STATUS_COLOR = { present: '#10b981', pending: '#7c3aed', absent: '#ef4444' }
const STATUS_LABEL = { present: 'Present', pending: 'Pending', absent: 'Absent' }

// HR/Admin's Attendance page — an at-a-glance dashboard (tiles, trend, role breakdown, recent
// activity, roster) rather than a workspace for approving things. Approval actions live entirely
// on the standalone Attendance Approval page (src/pages/shared/AttendanceApprovals.jsx) now; the
// Roster's day-drill-down below is deliberately view-only (readOnly on AttendanceDayDetailSheet).
function AttendanceHR({ onNavigate }) {
  const { users, products, categories, roles } = useData()
  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'
  const manpowerFlagged = (products || []).filter(hasManpowerIssue)
  const [punchQueue, setPunchQueue] = useState([])
  const [activityQueue, setActivityQueue] = useState([])
  const [roster, setRoster] = useState([])
  const [ruleSettings, setRuleSettings] = useState(null)
  const [dayDetail, setDayDetail] = useState(null)
  const [rosterOpen, setRosterOpen] = useState(null) // { user, punches } — the employee whose calendar Sheet is open
  const [loadError, setLoadError] = useState(null)

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const today = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayDateStr = `${year}-${pad(month)}-${pad(today)}`

  const load = async () => {
    const [
      { data: pq, error: pqErr }, { data: aq, error: aqErr }, { data: r, error: rErr },
      { data: rs, error: rsErr },
    ] = await Promise.all([
      db.fetchPendingPunchApprovals(),
      db.fetchPendingActivityApprovals(),
      db.fetchAllAttendanceForMonth(month, year),
      db.fetchAttendanceRuleSettings(),
    ])
    setPunchQueue(pq || [])
    setActivityQueue(aq || [])
    setRoster(r || [])
    setRuleSettings(rs || null)
    setLoadError(pqErr?.message || aqErr?.message || rErr?.message || rsErr?.message || null)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // String() guards against Supabase returning bigint columns as strings while `users.id` (if a
  // plain int4) comes back as a number — a strict === would silently never match.
  const punchesFor = userId => roster.filter(p => String(p.user_id) === String(userId))

  const openDay = (user, dayNum, punches) => {
    const date = `${year}-${pad(month)}-${pad(dayNum)}`
    const punch = punches.find(p => p.date === date)
    setDayDetail({ user, date, punch })
  }

  // ── Today's tiles ──────────────────────────────────────────────────────────
  const todaysPunches = roster.filter(p => p.date === todayDateStr)
  const presentToday = todaysPunches.filter(p => statusOf(p) === 'present').length
  const absentToday = (users || []).length - todaysPunches.length
  const lateToday = todaysPunches.filter(p => p.duty_status === 'late').length
  const pendingApprovals = punchQueue.length + activityQueue.length

  // ── Attendance Overview trend — Present/Absent/Late per day, this month up to today ─────────
  const trendData = []
  for (let d = 1; d <= today; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`
    const dayPunches = roster.filter(p => p.date === dateStr)
    trendData.push({
      day: d,
      Present: dayPunches.filter(p => statusOf(p) === 'present').length,
      Absent: (users || []).length - dayPunches.length,
      Late: dayPunches.filter(p => p.duty_status === 'late').length,
    })
  }

  // ── Employees by Role donut ───────────────────────────────────────────────
  const roleRows = (roles || []).map(r => ({ name: r.name, value: (users || []).filter(u => u.role_id === r.id).length }))

  // ── Recent Attendance ─────────────────────────────────────────────────────
  const recent = [...roster].sort((a, b) => new Date(b.punch_in_at) - new Date(a.punch_in_at)).slice(0, 8)

  return (
    <div>
      {loadError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#991b1b' }}>
          Could not load attendance data — {loadError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Tile icon="👥" label="Total Employees" value={(users || []).length} />
        <Tile icon="✅" label="Present Today" value={presentToday} color={STATUS_COLOR.present} />
        <Tile icon="❌" label="Absent Today" value={absentToday} color={STATUS_COLOR.absent} />
        <Tile icon="⏰" label="Late Today" value={lateToday} color="#f59e0b" />
        <Tile icon="🕓" label="Pending Approvals" value={pendingApprovals} color={STATUS_COLOR.pending} onClick={() => onNavigate?.('attendanceApprovals')} />
      </div>

      <Card>
        <CH title="Attendance Overview" sub={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
        <div style={{ padding: '8px 12px' }}>
          <AttendanceTrendChart data={trendData} />
        </div>
      </Card>

      <Card>
        <CH title="Employees by Role" />
        <div style={{ padding: '8px 12px' }}>
          <ContributionDonut rows={roleRows} formatValue={n => `${n} employee${n === 1 ? '' : 's'}`} emptyLabel="No employees yet" />
        </div>
      </Card>

      <Card>
        <CH title="Recent Attendance" sub={`Last ${recent.length} punch-in(s)`} />
        {recent.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No punches recorded yet</div>}
        {recent.map(p => {
          const st = statusOf(p)
          return (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user?.name || '—'}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{p.date} · {fmtTs(p.punch_in_at)}{p.duty_status === 'late' ? ' · Late' : ''}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: `${STATUS_COLOR[st]}22`, color: STATUS_COLOR[st], flexShrink: 0 }}>
                {STATUS_LABEL[st]}
              </span>
            </div>
          )
        })}
      </Card>

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
        <CH title="Attendance Roster" sub={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
        {(users || []).map(u => {
          const punches = punchesFor(u.id)
          const stats = computeAttendanceStats(punches, today, daysInMonth, ruleSettings)
          return (
            <div key={u.id} onClick={() => setRosterOpen({ user: u, punches })} style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Av av={u.avatar || '?'} color={u.color || '#6b7280'} sz={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12, flexShrink: 0 }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{stats.present}P</span>
                  <span style={{ color: '#7c3aed', fontWeight: 600 }}>{stats.pendingApproval}X</span>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>{stats.effectiveAbsent}A</span>
                  <span style={{ color: stats.rate >= 90 ? '#10b981' : stats.rate >= 75 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{stats.rate}%</span>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>›</div>
              </div>
              {(stats.unapprovedLate > 0 || stats.unapprovedHalfDay > 0) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11, paddingLeft: 40 }}>
                  {stats.unapprovedLate > 0 && <span style={{ color: '#f97316', fontWeight: 600 }}>🟠 Late: {stats.unapprovedLate}</span>}
                  {stats.unapprovedHalfDay > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>🟡 Half Day: {stats.unapprovedHalfDay}</span>}
                </div>
              )}
            </div>
          )
        })}
      </Card>

      {rosterOpen && (
        <RosterCalendarSheet
          user={rosterOpen.user}
          punches={rosterOpen.punches}
          today={today}
          daysInMonth={daysInMonth}
          ruleSettings={ruleSettings}
          monthLabel={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          onClose={() => setRosterOpen(null)}
          onDayClick={dayNum => openDay(rosterOpen.user, dayNum, rosterOpen.punches)}
        />
      )}

      {dayDetail && (
        <AttendanceDayDetailSheet
          detail={dayDetail}
          onClose={() => setDayDetail(null)}
          zIndex={320}
          readOnly
        />
      )}
    </div>
  )
}

// Opened from tapping an employee row on the roster — the summary row itself no longer renders a
// calendar inline (roster shows employee-wise summary only, calendar on tap). zIndex stays at
// Sheet's default (300); the day-detail Sheet opens on top of this one at 320.
function RosterCalendarSheet({ user, punches, today, daysInMonth, ruleSettings, monthLabel, onClose, onDayClick }) {
  const stats = computeAttendanceStats(punches, today, daysInMonth, ruleSettings)
  return (
    <Sheet title={user.name} sub={monthLabel} onClose={onClose}>
      <div style={{ display: 'flex', gap: 14, fontSize: 13, marginBottom: 14 }}>
        <span style={{ color: '#10b981', fontWeight: 700 }}>{stats.present}P</span>
        <span style={{ color: '#7c3aed', fontWeight: 700 }}>{stats.pendingApproval}X</span>
        <span style={{ color: '#ef4444', fontWeight: 700 }}>{stats.effectiveAbsent}A</span>
        <span style={{ color: stats.rate >= 90 ? '#10b981' : stats.rate >= 75 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{stats.rate}%</span>
      </div>
      {(stats.unapprovedLate > 0 || stats.unapprovedHalfDay > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, fontSize: 12 }}>
          {stats.unapprovedLate > 0 && <span style={{ color: '#f97316', fontWeight: 600 }}>🟠 Late: {stats.unapprovedLate}</span>}
          {stats.unapprovedHalfDay > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>🟡 Half Day: {stats.unapprovedHalfDay}</span>}
        </div>
      )}
      <AttCal days={stats.days} flags={stats.flags} onDayClick={onDayClick} />
    </Sheet>
  )
}
