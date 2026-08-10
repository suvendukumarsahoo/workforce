import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell } from 'recharts'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Tile, AttCal, Sheet } from '../../components/ui.jsx'
import MyAttendanceCalendar from '../../components/MyAttendanceCalendar.jsx'
import AttendanceDayDetailSheet from '../../components/AttendanceDayDetailSheet.jsx'
import AttendanceTrendChart from '../../components/charts/AttendanceTrendChart.jsx'
import { fmtTs } from '../../lib/journeyTimeline.js'
import { ISSUE_CATEGORIES, hasManpowerIssue } from '../../lib/productionIssues.js'
import { computeAttendanceStats } from '../../lib/attendanceRules.js'
import * as db from '../../lib/db.js'

const MANPOWER_REASONS = ISSUE_CATEGORIES.find(c => c.key === 'Manpower').reasons

const pad = n => String(n).padStart(2, '0')

const timeAgo = isoDate => {
  if (!isoDate) return ''
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Moments ago'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const lateDuration = minutesLate => {
  const m = Number(minutesLate) || 0
  const h = Math.floor(m / 60)
  const rem = m % 60
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`
}

// Hero stat tile — a colored progress ring (plain SVG, not recharts — six of these sit in one row
// so a lighter-weight mark than a full RadialBarChart matters here) with the percent centered,
// label+value to the right. Reference-screenshot layout: ring left, text right (unlike
// MeterGauge/GoalBarChart.jsx's stacked ring-above-label layout, which doesn't fit this row shape).
function RingStat({ label, value, percent, color }) {
  const r = 21, c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px' }}>
      <div style={{ position: 'relative', width: 50, height: 50, flexShrink: 0 }}>
        <svg width={50} height={50} viewBox="0 0 50 50">
          <circle cx={25} cy={25} r={r} fill="none" stroke="#f3f4f6" strokeWidth={5} />
          <circle cx={25} cy={25} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c} transform="rotate(-90 25 25)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color }}>
          {Math.round(clamped)}%
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{value}</div>
      </div>
    </div>
  )
}

// Compact center-labeled donut for the Role-Wise Attendance row — no per-chart legend (the section
// shares one legend below the whole row instead, per the reference), sized small enough that every
// role fits on one row rather than needing the reference's carousel/pagination.
function RoleDonut({ roleName, rows, size = 78 }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <PieChart width={size} height={size}>
          <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={size * 0.3} outerRadius={size * 0.48} startAngle={90} endAngle={-270} stroke="none">
            {rows.map(r => <Cell key={r.name} fill={r.color} />)}
          </Pie>
        </PieChart>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#374151', lineHeight: 1.2 }}>{roleName}</span>
        </div>
      </div>
    </div>
  )
}

const LEGEND_ITEMS = [['On Time', '#10b981'], ['Late', '#f59e0b'], ['Absent', '#ef4444']]

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
  // "Present" here means "punched in today," matching the reference's ring-tile arithmetic
  // (On Time + Late always sums back to Present) — approval status is a separate axis, still
  // covered by the Pending Approvals tile and the Roster below, not folded into these 4.
  const totalEmployees = (users || []).length
  const todaysPunches = roster.filter(p => p.date === todayDateStr)
  const punchedToday = todaysPunches.length
  const absentToday = totalEmployees - punchedToday
  const lateToday = todaysPunches.filter(p => p.duty_status === 'late').length
  const onTimeToday = punchedToday - lateToday
  const pendingApprovals = punchQueue.length + activityQueue.length

  const pct = (n, d) => (d > 0 ? (n / d) * 100 : 0)
  const presentPct = pct(punchedToday, totalEmployees)
  const absentPct = pct(absentToday, totalEmployees)
  const onTimePct = pct(onTimeToday, punchedToday)
  const latePct = pct(lateToday, punchedToday)

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

  // ── Role-Wise Attendance (today) ──────────────────────────────────────────
  // WorkForce has no Department field on employees — Role (Admin/Manager/Accounts/HR/Sales Team/
  // Warehouse Manager/Driver) is the closest existing grouping, so it stands in for the reference
  // dashboard's per-department donuts. On Time/Late/Absent, same 3-way split as the tiles above —
  // approval status is a separate axis, already covered by the Pending Approvals tile and Roster.
  const roleWiseRows = (roles || [])
    .map(r => {
      const roleUsers = (users || []).filter(u => u.role_id === r.id)
      if (roleUsers.length === 0) return null
      const roleUserIds = new Set(roleUsers.map(u => u.id))
      const rolePunchesToday = todaysPunches.filter(p => roleUserIds.has(p.user_id))
      const late = rolePunchesToday.filter(p => p.duty_status === 'late').length
      const onTime = rolePunchesToday.length - late
      const absent = roleUsers.length - rolePunchesToday.length
      return {
        roleName: r.name,
        rows: [
          { name: 'On Time', value: onTime, color: STATUS_COLOR.present },
          { name: 'Late', value: late, color: '#f59e0b' },
          { name: 'Absent', value: absent, color: STATUS_COLOR.absent },
        ],
      }
    })
    .filter(Boolean)

  // ── Attendance Feed — latest punches, chronological ───────────────────────
  const recent = [...roster].sort((a, b) => new Date(b.punch_in_at) - new Date(a.punch_in_at)).slice(0, 8)

  const roleNameFor = roleId => (roles || []).find(r => r.id === roleId)?.name || roleId
  const managerNameFor = managerId => managerId ? (users || []).find(u => String(u.id) === String(managerId))?.name : null

  // ── Late Today / Absent Today ──────────────────────────────────────────────
  // Reference's second card is "On Leave," which has no real equivalent here (CLAUDE.md: no leave/
  // holiday calendar anywhere in the app) — "Absent Today" fills that slot with real data instead.
  const lateDaysThisMonthFor = userId => roster.filter(p => String(p.user_id) === String(userId) && p.duty_status === 'late').length
  const absentDaysThisMonthFor = userId => {
    const punchedDates = new Set(punchesFor(userId).map(p => p.date))
    let count = 0
    for (let d = 1; d <= today; d++) { if (!punchedDates.has(`${year}-${pad(month)}-${pad(d)}`)) count++ }
    return count
  }

  const lateTodayList = todaysPunches
    .filter(p => p.duty_status === 'late')
    .map(p => ({ ...p, lateThisMonth: lateDaysThisMonthFor(p.user_id) }))
  const todaysPunchedUserIds = new Set(todaysPunches.map(p => p.user_id))
  const absentTodayList = (users || [])
    .filter(u => !todaysPunchedUserIds.has(u.id))
    .map(u => ({ user: u, absentThisMonth: absentDaysThisMonthFor(u.id) }))

  return (
    <div>
      {loadError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#991b1b' }}>
          Could not load attendance data — {loadError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 10 }}>
        <RingStat label="Present" value={punchedToday} percent={presentPct} color="#2563eb" />
        <RingStat label="Absent" value={absentToday} percent={absentPct} color={STATUS_COLOR.absent} />
        <RingStat label="On Time" value={onTimeToday} percent={onTimePct} color={STATUS_COLOR.present} />
        <RingStat label="Late" value={lateToday} percent={latePct} color="#f59e0b" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Tile icon="👥" label="Total Employees" value={totalEmployees} />
        <Tile icon="🕓" label="Pending Approvals" value={pendingApprovals} color={STATUS_COLOR.pending} onClick={() => onNavigate?.('attendanceApprovals')} />
      </div>

      <Card>
        <CH title="Role-Wise Attendance" sub="Today — stands in for Department, which WorkForce doesn't track" />
        <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
          {roleWiseRows.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13, gridColumn: '1/-1' }}>No employees yet</div>}
          {roleWiseRows.map(rw => <RoleDonut key={rw.roleName} roleName={rw.roleName} rows={rw.rows} />)}
        </div>
        {roleWiseRows.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '4px 12px 14px', flexWrap: 'wrap' }}>
            {LEGEND_ITEMS.map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: color, display: 'inline-block' }} />{label}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <Card>
          <CH title="Late Today" sub={`${lateTodayList.length} employee(s)`} />
          {lateTodayList.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {lateTodayList.map(p => {
            const managerName = managerNameFor(p.user?.manager_id)
            return (
              <div key={p.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Av av={p.user?.avatar || '?'} color={p.user?.color || '#6b7280'} sz={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user?.name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                      {roleNameFor(p.user?.role_id)}{managerName ? ` · Line Manager: ${managerName}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingLeft: 40, fontSize: 11 }}>
                  <span style={{ color: '#6b7280' }}>🕐 {fmtTs(p.punch_in_at)}</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>⏱ {lateDuration(p.minutes_late)}</span>
                  <span style={{ color: '#9ca3af' }}>📅 This Month · {p.lateThisMonth}d</span>
                </div>
              </div>
            )
          })}
        </Card>

        <Card>
          <CH title="Absent Today" sub={`${absentTodayList.length} employee(s)`} />
          {absentTodayList.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>None</div>}
          {absentTodayList.map(({ user: u, absentThisMonth }) => {
            const managerName = managerNameFor(u.manager_id)
            return (
              <div key={u.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Av av={u.avatar || '?'} color={u.color || '#6b7280'} sz={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                      {roleNameFor(u.role_id)}{managerName ? ` · Line Manager: ${managerName}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>📅 This Month · {absentThisMonth}d</div>
                </div>
              </div>
            )
          })}
        </Card>
      </div>

      <Card>
        <CH title="Attendance Feed" sub={`Last ${recent.length} punch-in(s)`} />
        {recent.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No punches recorded yet</div>}
        {recent.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <Av av={p.user?.avatar || '?'} color={p.user?.color || '#6b7280'} sz={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user?.name || '—'}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                🕐 {fmtTs(p.punch_in_at)}{p.duty_status === 'late' ? ' · Late' : ''}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{timeAgo(p.punch_in_at)}</div>
          </div>
        ))}
      </Card>

      <Card>
        <CH title="Attendance Overview" sub={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
        <div style={{ padding: '8px 12px' }}>
          <AttendanceTrendChart data={trendData} />
        </div>
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
