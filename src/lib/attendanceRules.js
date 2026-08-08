// Late Present Rule / Half Day Rule — pure helpers, no DB access.
//
// A rule (attendance_rules row) is a pure SETTING — role, rule type, grace-period minutes, who
// approves exceptions — with no user list of its own. Which specific users it applies to is a
// separate mapping (attendance_rule_users), only editable once the rule setting itself is
// Admin-approved. `db.js`'s `fetchAttendanceRules()` embeds that mapping as `rule.mapped`
// (`[{ user_id, user: {...} }]`) via a join, so a rule applies to a user when the user's role_id
// matches the rule's role_id AND the user's id appears in `rule.mapped`. Only rules with
// status='approved' (Admin has signed off on the setting) are ever passed in here — see
// useData.jsx's approvedAttendanceRules.
//
// Half Day supersedes Late Present when a single arrival crosses both thresholds (confirmed via
// AskUserQuestion) — both are driven by the same underlying arrival-delay-in-minutes signal
// computed once in PunchInGate.jsx, just compared against a different (larger) threshold.

export const RULE_TYPE_LABEL = {
  late_present: 'Late Present',
  half_day: 'Half Day',
}

export const APPROVER_ROLE_LABEL = {
  manager: 'Manager',
  hr: 'HR',
}

function rulesApplyingTo(user, approvedRules, ruleType) {
  if (!user) return []
  return (approvedRules || []).filter(r =>
    r.rule_type === ruleType &&
    r.role_id === user.role_id &&
    Array.isArray(r.mapped) &&
    r.mapped.some(m => String(m.user_id) === String(user.id))
  )
}

// Returns { ruleType: 'late_present'|'half_day', ruleId } or null if no rule fires for this punch.
export function resolveRuleClassification(user, approvedRules, minutesLate) {
  if (!user || !minutesLate || minutesLate <= 0) return null

  const halfDayRules = rulesApplyingTo(user, approvedRules, 'half_day')
    .filter(r => minutesLate >= r.threshold_minutes)
  if (halfDayRules.length > 0) {
    // Largest threshold wins if more than one half-day rule matches this user — the most
    // restrictive/severe classification the user actually crossed.
    const chosen = halfDayRules.reduce((a, b) => (b.threshold_minutes > a.threshold_minutes ? b : a))
    return { ruleType: 'half_day', ruleId: chosen.id }
  }

  const lateRules = rulesApplyingTo(user, approvedRules, 'late_present')
    .filter(r => minutesLate >= r.threshold_minutes)
  if (lateRules.length > 0) {
    const chosen = lateRules.reduce((a, b) => (b.threshold_minutes > a.threshold_minutes ? b : a))
    return { ruleType: 'late_present', ruleId: chosen.id }
  }

  return null
}

// Given a rule's approver1_role, what approver2_role should be stored (auto-derived, not user-picked).
export function deriveApprover2Role(approver1Role) {
  return approver1Role === 'manager' ? 'hr' : null
}

// 'not_applicable' | 'pending' | 'stage1_approved' | 'approved'
export function isUnapprovedInstance(punch) {
  return !!punch.rule_status && punch.rule_waiver_status !== 'approved'
}

export function isFullyApprovedPunch(p) {
  return p.punch_approval_status === 'approved' && p.activity_approval_status === 'approved'
}

// Single source of truth for Present/Pending/Absent/Rate + the new Late/Half-Day counts and AttCal
// flags — shared by the HR roster and each employee's own self-view calendar, which previously
// hand-copied this same formula independently (see CLAUDE.md).
export function computeAttendanceStats(punches, today, daysInMonth, ruleSettings) {
  const present = punches.filter(isFullyApprovedPunch).length
  const pendingApproval = punches.length - present
  const absent = Math.max(0, today - punches.length)
  const rate = today > 0 ? Math.round((present / today) * 100) : 0

  const unapprovedLate = punches.filter(p => p.rule_status === 'late_present' && isUnapprovedInstance(p)).length
  const unapprovedHalfDay = punches.filter(p => p.rule_status === 'half_day' && isUnapprovedInstance(p)).length
  const extraFromLate = ruleSettings?.unapproved_late_to_absent ? Math.floor(unapprovedLate / ruleSettings.unapproved_late_to_absent) : 0
  const extraFromHalfDay = ruleSettings?.unapproved_half_day_to_absent ? Math.floor(unapprovedHalfDay / ruleSettings.unapproved_half_day_to_absent) : 0
  const effectiveAbsent = absent + extraFromLate + extraFromHalfDay

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1
    if (dayNum > today) return 'W'
    const p = punches.find(x => new Date(x.date).getDate() === dayNum)
    if (!p) return 'A'
    return isFullyApprovedPunch(p) ? 'P' : 'X'
  })
  const flags = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1
    if (dayNum > today) return null
    const p = punches.find(x => new Date(x.date).getDate() === dayNum)
    if (!p || !isUnapprovedInstance(p)) return null
    return p.rule_status === 'half_day' ? 'half_day' : 'late'
  })

  return { present, pendingApproval, absent, effectiveAbsent, rate, days, flags, unapprovedLate, unapprovedHalfDay }
}

// Who is allowed to act on this punch's current waiver stage. Admin is always eligible; Manager
// only for their own team's stage-1 items on Manager-first rules; HR for stage-1 on HR-first rules
// and for stage-2 always (approver2_role is only ever 'hr' when it exists).
export function eligibleForWaiverStage(punch, ruleUser, viewerRoleId, viewerUserId) {
  if (viewerRoleId === 'r1') return true
  if (punch.rule_waiver_status === 'pending') {
    if (punch.rule?.approver1_role === 'hr') return viewerRoleId === 'r4'
    if (punch.rule?.approver1_role === 'manager') return viewerRoleId === 'r2' && String(ruleUser?.manager_id) === String(viewerUserId)
  }
  if (punch.rule_waiver_status === 'stage1_approved') return viewerRoleId === 'r4'
  return false
}
