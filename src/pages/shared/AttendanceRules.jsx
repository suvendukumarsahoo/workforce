import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, Inp } from '../../components/ui.jsx'
import { RULE_TYPE_LABEL, APPROVER_ROLE_LABEL, eligibleForWaiverStage } from '../../lib/attendanceRules.js'
import * as db from '../../lib/db.js'

export default function AttendanceRules() {
  const { role } = useAuth()
  if (role?.id === 'r1' || role?.id === 'r4') return <RuleManagement />
  if (role?.id === 'r2') return <ManagerWaiverQueue />
  return null
}

function RuleManagement() {
  const { currentUser, role } = useAuth()
  const { users } = useData()
  const isAdmin = role?.id === 'r1'
  const isHR = role?.id === 'r4'
  const [tab, setTab] = useState('late_present')
  const [rules, setRules] = useState([])
  const [waiverQueue, setWaiverQueue] = useState([])
  const [settingsDraft, setSettingsDraft] = useState({})
  const [savingSettings, setSavingSettings] = useState(false)
  const [showCreateRule, setShowCreateRule] = useState(false)
  const [reviewRule, setReviewRule] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const load = async () => {
    const [{ data: ar, error: arErr }, { data: wq, error: wqErr }, { data: rs, error: rsErr }] = await Promise.all([
      db.fetchAttendanceRules(),
      db.fetchPendingWaiverApprovals(),
      db.fetchAttendanceRuleSettings(),
    ])
    setRules(ar || [])
    setWaiverQueue(wq || [])
    setSettingsDraft(rs || {})
    setLoadError(arErr?.message || wqErr?.message || rsErr?.message || null)
  }

  useEffect(() => { load() }, [])

  const approveRule = async (id) => {
    setBusyId(id)
    const { error } = await db.approveAttendanceRule(id, currentUser?.id)
    setBusyId(null)
    if (error) { setLoadError('Rule approval failed — ' + error.message); return }
    await db.logActivity(currentUser?.id, 'approve', 'attendance_rule', 'Approved attendance rule', id)
    setReviewRule(null)
    await load()
  }

  const approveWaiver = async (id) => {
    setBusyId(id)
    const punch = waiverQueue.find(p => p.id === id)
    const fn = punch?.rule_waiver_status === 'stage1_approved'
      ? () => db.approveWaiverStage2(id, currentUser?.id)
      : () => db.approveWaiverStage1(id, currentUser?.id, punch?.rule?.approver1_role)
    const { error } = await fn()
    setBusyId(null)
    if (error) { setLoadError('Waiver approval failed — ' + error.message); return }
    await load()
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
    setSettingsDraft(data)
    await db.logActivity(currentUser?.id, 'update', 'attendance_rule', 'Updated attendance rule settings', null)
  }

  const addUser = async (ruleId, userId) => {
    const { error } = await db.addRuleUser(ruleId, userId, currentUser?.id)
    if (error) { setLoadError('Could not map user — ' + error.message); return }
    await load()
  }
  const removeUser = async (ruleId, userId) => {
    const { error } = await db.removeRuleUser(ruleId, userId)
    if (error) { setLoadError('Could not remove user — ' + error.message); return }
    await load()
  }

  const tabRules = rules.filter(r => r.rule_type === tab)

  return (
    <div>
      {loadError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#991b1b' }}>
          Could not load attendance rules — {loadError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['late_present', 'half_day'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: tab === t ? '#2563eb' : '#f3f4f6',
              color: tab === t ? '#fff' : '#374151',
            }}
          >
            {RULE_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <Card>
        <CH title={`${RULE_TYPE_LABEL[tab]} Rules`} sub={`${tabRules.length} setting(s) — tap a rule to review`} right={isHR ? <Btn sm v="pri" onClick={() => setShowCreateRule(true)}>+ Create Rule</Btn> : null} />
        {tabRules.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No {RULE_TYPE_LABEL[tab].toLowerCase()} rules created yet</div>}
        {tabRules.map(r => (
          <div key={r.id} onClick={() => setReviewRule(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.role?.name}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                grace {r.threshold_minutes}m · Approver 1: {APPROVER_ROLE_LABEL[r.approver1_role]}
                {r.approver2_role ? ` → Approver 2: ${APPROVER_ROLE_LABEL[r.approver2_role]}` : ' (final)'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: r.status === 'approved' ? '#d1fae5' : '#fef3c7', color: r.status === 'approved' ? '#065f46' : '#92400e' }}>
                {r.status === 'approved' ? 'Approved' : 'Pending Admin Approval'}
              </span>
              <span style={{ fontSize: 14, color: '#9ca3af' }}>›</span>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <CH title="User Mapping" sub="Who this rule applies to — editable any time, no approval needed" />
        {tabRules.filter(r => r.status === 'approved').length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>
            Approve a {RULE_TYPE_LABEL[tab]} rule first to map users
          </div>
        )}
        {tabRules.filter(r => r.status === 'approved').map(r => (
          <MappingRow key={r.id} rule={r} users={users} isHR={isHR} onAdd={addUser} onRemove={removeUser} />
        ))}
      </Card>

      <Card>
        <CH title="Pending Waiver Approvals" sub={`${waiverQueue.length} instance(s) — Late Present / Half Day`} />
        {waiverQueue.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Nothing pending</div>}
        {waiverQueue.map(p => {
          const eligible = eligibleForWaiverStage(p, p.user, role?.id, currentUser?.id)
          return (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {p.user?.name || '—'}{' '}
                  <span style={{ fontWeight: 400, color: p.rule_status === 'half_day' ? '#dc2626' : '#f97316' }}>· {RULE_TYPE_LABEL[p.rule_status]}</span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {p.date} · {p.rule_waiver_status === 'stage1_approved' ? 'Awaiting Stage 2 (HR)' : `Awaiting ${APPROVER_ROLE_LABEL[p.rule?.approver1_role] || 'review'}`}
                </div>
              </div>
              {eligible ? (
                <Btn sm v="pri" disabled={busyId === p.id} onClick={() => approveWaiver(p.id)} style={{ flexShrink: 0 }}>
                  {busyId === p.id ? '...' : p.rule_waiver_status === 'stage1_approved' ? 'Approve (Stage 2)' : 'Waive'}
                </Btn>
              ) : (
                <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>Not yours</span>
              )}
            </div>
          )
        })}
      </Card>

      {isAdmin && (
        <Card>
          <CH title="Attendance Rule Settings" sub="Waiver caps + escalation thresholds — applies to both rule types" />
          <div style={{ padding: 14 }}>
            <Inp label="Max waivers/month per employee — Manager" value={settingsDraft.max_waivers_manager ?? ''} onChange={v => setSettingsDraft(s => ({ ...s, max_waivers_manager: v }))} type="number" helper="Leave blank for unlimited" />
            <Inp label="Max waivers/month per employee — HR" value={settingsDraft.max_waivers_hr ?? ''} onChange={v => setSettingsDraft(s => ({ ...s, max_waivers_hr: v }))} type="number" helper="Leave blank for unlimited" />
            <Inp label="Unapproved Late Present count = 1 Absent" value={settingsDraft.unapproved_late_to_absent ?? ''} onChange={v => setSettingsDraft(s => ({ ...s, unapproved_late_to_absent: v }))} type="number" helper="Leave blank to disable" />
            <Inp label="Unapproved Half Day count = 1 Absent" value={settingsDraft.unapproved_half_day_to_absent ?? ''} onChange={v => setSettingsDraft(s => ({ ...s, unapproved_half_day_to_absent: v }))} type="number" helper="Leave blank to disable" />
            <Btn v="pri" disabled={savingSettings} onClick={saveSettings}>{savingSettings ? 'Saving...' : 'Save Settings'}</Btn>
          </div>
        </Card>
      )}

      {showCreateRule && (
        <CreateRuleSheet ruleType={tab} onClose={() => setShowCreateRule(false)} onCreated={load} />
      )}

      {reviewRule && (
        <RuleDetailSheet
          rule={reviewRule}
          users={users}
          isAdmin={isAdmin}
          busyId={busyId}
          onApprove={approveRule}
          onClose={() => setReviewRule(null)}
        />
      )}
    </div>
  )
}

// Opened by tapping a rule row — full detail (including who created it and when, not shown on the
// list row) so Admin has something to actually examine before approving, rather than approving
// straight off the one-line summary.
function RuleDetailSheet({ rule, users, isAdmin, busyId, onApprove, onClose }) {
  const nameOf = id => (users || []).find(u => String(u.id) === String(id))?.name || (id ? `User #${id}` : '—')
  const fmt = ts => ts ? new Date(ts).toLocaleString('en-IN') : '—'

  return (
    <Sheet title={`${RULE_TYPE_LABEL[rule.rule_type]} Rule`} sub={rule.role?.name} onClose={onClose}>
      <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
        <DetailRow label="Rule Type" value={RULE_TYPE_LABEL[rule.rule_type]} />
        <DetailRow label="Role" value={rule.role?.name} />
        <DetailRow label="Grace Period" value={`${rule.threshold_minutes} minutes beyond reporting time`} />
        <DetailRow label="Approver 1" value={APPROVER_ROLE_LABEL[rule.approver1_role]} />
        <DetailRow label="Approver 2" value={rule.approver2_role ? APPROVER_ROLE_LABEL[rule.approver2_role] : 'None — Approver 1 is final'} />
        <DetailRow label="Created By" value={nameOf(rule.created_by)} />
        <DetailRow label="Created At" value={fmt(rule.created_at)} />
        <DetailRow label="Status" value={rule.status === 'approved' ? 'Approved' : 'Pending Admin Approval'} />
        {rule.status === 'approved' && (
          <>
            <DetailRow label="Approved By" value={nameOf(rule.approved_by)} />
            <DetailRow label="Approved At" value={fmt(rule.approved_at)} />
          </>
        )}
      </div>

      {rule.status === 'pending' && isAdmin && (
        <Btn v="pri" full disabled={busyId === rule.id} onClick={() => onApprove(rule.id)}>
          {busyId === rule.id ? 'Approving...' : 'Approve Rule'}
        </Btn>
      )}
      {rule.status === 'pending' && !isAdmin && (
        <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>Waiting for Admin approval</div>
      )}
    </Sheet>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// One sub-section per approved rule of the active type — rolewise/userwise mapping. HR can
// add/remove; Admin sees the identical list read-only (no approval needed for mapping changes,
// but Admin's screen should still show who's currently covered).
function MappingRow({ rule, users, isHR, onAdd, onRemove }) {
  const roleUsers = (users || []).filter(u => u.role_id === rule.role_id)
  const mappedIds = (rule.mapped || []).map(m => m.user_id)
  const available = roleUsers.filter(u => !mappedIds.includes(u.id))
  const chipStyle = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#1d4ed8', borderRadius: 20, padding: '3px 10px', fontSize: 12 }
  const selectStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', background: '#fff' }

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{rule.role?.name} — grace {rule.threshold_minutes}m</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: isHR ? 6 : 0 }}>
        {(rule.mapped || []).length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>No users mapped yet</span>}
        {(rule.mapped || []).map(m => (
          <span key={m.user_id} style={chipStyle}>
            {m.user?.name || m.user_id}
            {isHR && <button onClick={() => onRemove(rule.id, m.user_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 14 }}>×</button>}
          </span>
        ))}
      </div>
      {isHR && available.length > 0 && (
        <select onChange={e => {
          // Same capture-before-reset fix as the create-rule user picker had — see attendance-rules
          // session history in CLAUDE.md for the exact closure bug this avoids.
          const v = e.target.value
          if (v) onAdd(rule.id, Number(v))
          e.target.value = ''
        }} style={selectStyle}>
          <option value="">+ Add user...</option>
          {available.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
    </div>
  )
}

// A rule is now a pure setting — no user picker here at all. `ruleType` comes from the active tab,
// fixed for the duration of this sheet.
function CreateRuleSheet({ ruleType, onClose, onCreated }) {
  const { currentUser } = useAuth()
  const { roles, showToast } = useData()
  const [roleId, setRoleId] = useState('')
  const [threshold, setThreshold] = useState('')
  const [approver1, setApprover1] = useState('manager')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const save = async () => {
    setErr(null)
    if (!roleId) { setErr('Select a role'); return }
    if (!threshold || Number(threshold) <= 0) { setErr('Enter a grace period in minutes'); return }
    setSaving(true)
    const { data, error } = await db.createAttendanceRule({
      rule_type: ruleType, role_id: roleId,
      threshold_minutes: Number(threshold), approver1_role: approver1,
      created_by: currentUser?.id,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    await db.logActivity(currentUser?.id, 'create', 'attendance_rule', `Created ${RULE_TYPE_LABEL[ruleType]} rule`, data?.id)
    showToast('Rule created — awaiting Admin approval')
    await onCreated()
    onClose()
  }

  return (
    <Sheet title={`Create ${RULE_TYPE_LABEL[ruleType]} Rule`} sub="A setting only — map specific users once it's approved" onClose={onClose}>
      <Inp label="Role" value={roleId} onChange={setRoleId} options={[{ value: '', label: 'Select role...' }, ...(roles || []).map(r => ({ value: r.id, label: r.name }))]} />
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

// Moved verbatim from Attendance.jsx's old AttendanceManagerView — Manager's self-view calendar
// stays on the Attendance page (Attendance() falls through to MyAttendanceCalendar for every
// non-HR/Admin role, Manager included), this page is purely the approval queue.
function ManagerWaiverQueue() {
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
    </div>
  )
}
