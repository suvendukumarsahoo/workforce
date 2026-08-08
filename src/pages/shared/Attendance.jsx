import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, Btn, Sheet, Inp, AttCal } from '../../components/ui.jsx'
import MyAttendanceCalendar from '../../components/MyAttendanceCalendar.jsx'
import { buildJourneyEvents, fmtTs } from '../../lib/journeyTimeline.js'
import { buildActivityEvents } from '../../lib/activityTimeline.js'
import VeinTimeline from '../../components/VeinTimeline.jsx'
import { ISSUE_CATEGORIES, hasManpowerIssue } from '../../lib/productionIssues.js'
import { RULE_TYPE_LABEL, APPROVER_ROLE_LABEL, computeAttendanceStats, eligibleForWaiverStage } from '../../lib/attendanceRules.js'
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

export default function Attendance() {
  const { role } = useAuth()
  if (role?.id === 'r4' || role?.id === 'r1') return <AttendanceHR />
  if (role?.id === 'r2') return <AttendanceManagerView />
  return <MyAttendanceCalendar />
}

function AttendanceHR() {
  const { currentUser, role } = useAuth()
  const { users, products, categories } = useData()
  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'
  const manpowerFlagged = (products || []).filter(hasManpowerIssue)
  const [punchQueue, setPunchQueue] = useState([])
  const [activityQueue, setActivityQueue] = useState([])
  const [roster, setRoster] = useState([])
  const [rules, setRules] = useState([])
  const [waiverQueue, setWaiverQueue] = useState([])
  const [ruleSettings, setRuleSettings] = useState(null)
  const [settingsDraft, setSettingsDraft] = useState({})
  const [savingSettings, setSavingSettings] = useState(false)
  const [showCreateRule, setShowCreateRule] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [dayDetail, setDayDetail] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const today = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()

  const load = async () => {
    const [
      { data: pq, error: pqErr }, { data: aq, error: aqErr }, { data: r, error: rErr },
      { data: ar, error: arErr }, { data: wq, error: wqErr }, { data: rs, error: rsErr },
    ] = await Promise.all([
      db.fetchPendingPunchApprovals(),
      db.fetchPendingActivityApprovals(),
      db.fetchAllAttendanceForMonth(month, year),
      db.fetchAttendanceRules(),
      db.fetchPendingWaiverApprovals(),
      db.fetchAttendanceRuleSettings(),
    ])
    setPunchQueue(pq || [])
    setActivityQueue(aq || [])
    setRoster(r || [])
    setRules(ar || [])
    setWaiverQueue(wq || [])
    setRuleSettings(rs || null)
    setSettingsDraft(rs || {})
    setLoadError(pqErr?.message || aqErr?.message || rErr?.message || arErr?.message || wqErr?.message || rsErr?.message || null)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const approveRule = async (id) => {
    setBusyId(id)
    const { error } = await db.approveAttendanceRule(id, currentUser?.id)
    setBusyId(null)
    if (error) { setLoadError('Rule approval failed — ' + error.message); return }
    await db.logActivity(currentUser?.id, 'approve', 'attendance_rule', 'Approved attendance rule', id)
    await load()
  }

  const approveWaiver = async (id) => {
    setBusyId(id)
    const punch = waiverQueue.find(p => p.id === id)
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

  const saveSettings = async () => {
    setSavingSettings(true)
    const num = v => (v === '' || v == null ? null : Number(v))
    const payload = {
      max_waivers_manager: num(settingsDraft.max_waivers_manager),
      max_waivers_hr: num(settingsDraft.max_waivers_hr),
      unapproved_late_to_absent: num(settingsDraft.unapproved_late_to_absent),
      unapproved_half_day_to_absent: num(settingsDraft.unapproved_half_day_to_absent),
    }
    const { data, error } = await db.upsertAttendanceRuleSettings(payload, currentUser?.id)
    setSavingSettings(false)
    if (error) { setLoadError('Settings save failed — ' + error.message); return }
    setRuleSettings(data)
    setSettingsDraft(data)
    await db.logActivity(currentUser?.id, 'update', 'attendance_rule', 'Updated attendance rule settings', null)
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
        <CH title="Attendance Rules" sub={`${rules.length} rule(s) — Late Present / Half Day`} right={<Btn sm v="pri" onClick={() => setShowCreateRule(true)}>+ Create Rule</Btn>} />
        {rules.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No rules created yet</div>}
        {rules.map(r => (
          <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{RULE_TYPE_LABEL[r.rule_type]} — {r.role?.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {(r.user_ids || []).length} user(s) · grace {r.threshold_minutes}m · Approver 1: {APPROVER_ROLE_LABEL[r.approver1_role]}
                  {r.approver2_role ? ` → Approver 2: ${APPROVER_ROLE_LABEL[r.approver2_role]}` : ' (final)'}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, flexShrink: 0, background: r.status === 'approved' ? '#d1fae5' : '#fef3c7', color: r.status === 'approved' ? '#065f46' : '#92400e' }}>
                {r.status === 'approved' ? 'Approved' : 'Pending Admin Approval'}
              </span>
            </div>
            {r.status === 'pending' && role?.id === 'r1' && (
              <Btn sm v="pri" style={{ marginTop: 8 }} disabled={busyId === r.id} onClick={() => approveRule(r.id)}>
                {busyId === r.id ? 'Approving...' : 'Approve Rule'}
              </Btn>
            )}
          </div>
        ))}
      </Card>

      {role?.id === 'r1' && (
        <Card>
          <CH title="Attendance Rule Settings" sub="Waiver caps + escalation thresholds" />
          <div style={{ padding: 14 }}>
            <Inp label="Max waivers/month per employee — Manager" value={settingsDraft.max_waivers_manager ?? ''} onChange={v => setSettingsDraft(s => ({ ...s, max_waivers_manager: v }))} type="number" helper="Leave blank for unlimited" />
            <Inp label="Max waivers/month per employee — HR" value={settingsDraft.max_waivers_hr ?? ''} onChange={v => setSettingsDraft(s => ({ ...s, max_waivers_hr: v }))} type="number" helper="Leave blank for unlimited" />
            <Inp label="Unapproved Late Present count = 1 Absent" value={settingsDraft.unapproved_late_to_absent ?? ''} onChange={v => setSettingsDraft(s => ({ ...s, unapproved_late_to_absent: v }))} type="number" helper="Leave blank to disable" />
            <Inp label="Unapproved Half Day count = 1 Absent" value={settingsDraft.unapproved_half_day_to_absent ?? ''} onChange={v => setSettingsDraft(s => ({ ...s, unapproved_half_day_to_absent: v }))} type="number" helper="Leave blank to disable" />
            <Btn v="pri" disabled={savingSettings} onClick={saveSettings}>{savingSettings ? 'Saving...' : 'Save Settings'}</Btn>
          </div>
        </Card>
      )}

      <Card>
        <CH title="Pending Waiver Approvals" sub={`${waiverQueue.length} instance(s)`} />
        {waiverQueue.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Nothing pending</div>}
        {waiverQueue.map(p => {
          const eligible = eligibleForWaiverStage(p, p.user, role?.id, currentUser?.id)
          return (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => openQueueItem(p)}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {p.user?.name || '—'}{' '}
                  <span style={{ fontWeight: 400, color: p.rule_status === 'half_day' ? '#dc2626' : '#f97316' }}>· {RULE_TYPE_LABEL[p.rule_status]}</span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {p.date} · {p.rule_waiver_status === 'stage1_approved' ? 'Awaiting Stage 2 (HR)' : `Awaiting ${APPROVER_ROLE_LABEL[p.rule?.approver1_role] || 'review'}`}
                </div>
              </div>
              {eligible ? (
                <Btn sm v="pri" disabled={busyId === p.id} onClick={(e) => { e.stopPropagation(); approveWaiver(p.id) }} style={{ flexShrink: 0 }}>
                  {busyId === p.id ? '...' : p.rule_waiver_status === 'stage1_approved' ? 'Approve (Stage 2)' : 'Waive'}
                </Btn>
              ) : (
                <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>Not yours</span>
              )}
            </div>
          )
        })}
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
          const stats = computeAttendanceStats(punches, today, daysInMonth, ruleSettings)
          return (
            <div key={u.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Av av={u.avatar || '?'} color={u.color || '#6b7280'} sz={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{stats.present}P</span>
                  <span style={{ color: '#7c3aed', fontWeight: 600 }}>{stats.pendingApproval}X</span>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>{stats.effectiveAbsent}A</span>
                  <span style={{ color: stats.rate >= 90 ? '#10b981' : stats.rate >= 75 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{stats.rate}%</span>
                </div>
              </div>
              {(stats.unapprovedLate > 0 || stats.unapprovedHalfDay > 0) && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11 }}>
                  {stats.unapprovedLate > 0 && <span style={{ color: '#f97316', fontWeight: 600 }}>🟠 Late: {stats.unapprovedLate}</span>}
                  {stats.unapprovedHalfDay > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>🟡 Half Day: {stats.unapprovedHalfDay}</span>}
                </div>
              )}
              <AttCal days={stats.days} flags={stats.flags} onDayClick={dayNum => openDay(u, dayNum, punches)} />
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
          onApproveWaiver={approveWaiver}
          viewerRoleId={role?.id}
          viewerUserId={currentUser?.id}
          busyId={busyId}
        />
      )}

      {showCreateRule && (
        <CreateRuleSheet
          onClose={() => setShowCreateRule(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}

function AttendanceManagerView() {
  const { currentUser } = useAuth()
  const [waiverQueue, setWaiverQueue] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const load = async () => {
    const { data, error } = await db.fetchPendingWaiverApprovals()
    if (error) { setActionError(error.message); return }
    setWaiverQueue((data || []).filter(p =>
      p.rule_waiver_status === 'pending' &&
      p.rule?.approver1_role === 'manager' &&
      String(p.user?.manager_id) === String(currentUser?.id)
    ))
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const approve = async (p) => {
    setBusyId(p.id)
    setActionError(null)
    const { error } = await db.approveWaiverStage1(p.id, currentUser?.id, 'manager')
    setBusyId(null)
    if (error) { setActionError(error.message); return }
    await load()
  }

  return (
    <div>
      <Card>
        <CH title="Team Waiver Approvals" sub={`${waiverQueue.length} pending — Late Present / Half Day`} />
        {actionError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', margin: '0 14px 10px', fontSize: 11, color: '#991b1b' }}>
            {actionError}
          </div>
        )}
        {waiverQueue.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Nothing pending for your team</div>}
        {waiverQueue.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {p.user?.name || '—'}{' '}
                <span style={{ fontWeight: 400, color: p.rule_status === 'half_day' ? '#dc2626' : '#f97316' }}>· {RULE_TYPE_LABEL[p.rule_status]}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {p.date} · over by {p.minutes_late - (p.rule?.threshold_minutes ?? 0)}m
              </div>
            </div>
            <Btn sm v="pri" disabled={busyId === p.id} onClick={() => approve(p)} style={{ flexShrink: 0 }}>
              {busyId === p.id ? '...' : 'Waive'}
            </Btn>
          </div>
        ))}
      </Card>
      <MyAttendanceCalendar />
    </div>
  )
}

function CreateRuleSheet({ onClose, onCreated }) {
  const { currentUser } = useAuth()
  const { roles, users, showToast } = useData()
  const [ruleType, setRuleType] = useState('late_present')
  const [roleId, setRoleId] = useState('')
  const [userIds, setUserIds] = useState([])
  const [threshold, setThreshold] = useState('')
  const [approver1, setApprover1] = useState('manager')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const roleUsers = (users || []).filter(u => u.role_id === roleId)
  const available = roleUsers.filter(u => !userIds.includes(u.id))

  const chipStyle = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#1d4ed8', borderRadius: 20, padding: '3px 10px', fontSize: 12 }
  const selectStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', background: '#fff' }

  const save = async () => {
    setErr(null)
    if (!roleId) { setErr('Select a role'); return }
    if (userIds.length === 0) { setErr('Select at least one user'); return }
    if (!threshold || Number(threshold) <= 0) { setErr('Enter a grace period in minutes'); return }
    setSaving(true)
    const { data, error } = await db.createAttendanceRule({
      rule_type: ruleType, role_id: roleId, user_ids: userIds,
      threshold_minutes: Number(threshold), approver1_role: approver1,
      created_by: currentUser?.id,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    await db.logActivity(currentUser?.id, 'create', 'attendance_rule', `Created ${RULE_TYPE_LABEL[ruleType]} rule for ${userIds.length} user(s)`, data?.id)
    showToast('Rule created — awaiting Admin approval')
    await onCreated()
    onClose()
  }

  return (
    <Sheet title="Create Attendance Rule" sub="HR authors it; Admin must approve before it takes effect" onClose={onClose}>
      <Inp label="Rule Type" value={ruleType} onChange={setRuleType} options={[{ value: 'late_present', label: 'Late Present' }, { value: 'half_day', label: 'Half Day' }]} />
      <Inp label="Role" value={roleId} onChange={v => { setRoleId(v); setUserIds([]) }} options={[{ value: '', label: 'Select role...' }, ...(roles || []).map(r => ({ value: r.id, label: r.name }))]} />

      {roleId && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Select Users</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {userIds.map(id => {
              const u = roleUsers.find(x => x.id === id)
              return (
                <span key={id} style={chipStyle}>
                  {u?.name || id}
                  <button onClick={() => setUserIds(prev => prev.filter(x => x !== id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 14 }}>×</button>
                </span>
              )
            })}
          </div>
          {available.length > 0 && (
            <select onChange={e => {
              // Capture the value into a local const BEFORE resetting the input — the functional
              // state updater below runs lazily (React invokes it when processing the update, not
              // synchronously here), so if it closed over `e.target.value` directly it would read
              // whatever `e.target.value = ''` below had already reset it to by then, always
              // pushing Number('') = 0 instead of the real selected id. Real bug, caught live.
              const v = e.target.value
              if (v) setUserIds(prev => [...prev, Number(v)])
              e.target.value = ''
            }} style={selectStyle}>
              <option value="">+ Add user...</option>
              {available.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
      )}

      <Inp label="Maximum time allowed beyond reporting time (minutes)" value={threshold} onChange={setThreshold} type="number" />

      <Inp
        label="Approver 1"
        value={approver1}
        onChange={setApprover1}
        options={[{ value: 'manager', label: 'Manager' }, { value: 'hr', label: 'HR' }]}
        helper={approver1 === 'manager' ? 'Approver 2 will automatically be HR (2nd sign-off required)' : 'HR approval alone is final — no Approver 2'}
      />

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: '#991b1b' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn v="pri" full disabled={saving} onClick={save}>{saving ? 'Creating...' : 'Create Rule'}</Btn>
        <Btn full onClick={onClose}>Cancel</Btn>
      </div>
    </Sheet>
  )
}

function DayDetailSheet({ detail, onClose, onApproveStage1, onApproveStage2, onApproveWaiver, viewerRoleId, viewerUserId, busyId }) {
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

  const waiverEligible = punch && punch.rule_status ? eligibleForWaiverStage(punch, user, viewerRoleId, viewerUserId) : false

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

          {punch.rule_status && (
            <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: punch.rule_status === 'half_day' ? '#b91c1c' : '#92400e', marginBottom: 4 }}>
                {punch.rule_status === 'half_day' ? '🟡 Half Day' : '🟠 Late Present'}
                {punch.rule?.threshold_minutes != null ? ` — over by ${punch.minutes_late - punch.rule.threshold_minutes}m` : ''}
              </div>
              {punch.rule_waiver_status === 'approved' ? (
                <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>✓ Waived</div>
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
