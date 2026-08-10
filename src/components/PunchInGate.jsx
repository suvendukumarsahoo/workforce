import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useData } from '../hooks/useData.jsx'
import { Btn } from './ui.jsx'
import { haversineMeters } from '../lib/geo.js'
import { resolveRuleClassification, resolvePunchGateRule } from '../lib/attendanceRules.js'
import { localDateStr } from '../lib/period.js'
import { computeDueStatus } from '../lib/stockTakeSchedule.js'
import StockTakeEntry from '../pages/team/StockTakeEntry.jsx'
import * as db from '../lib/db.js'

const DEFAULT_DEVIATION_LIMIT_M = 20

function dutyStatusFor(dutyStartTime) {
  if (!dutyStartTime) return null
  const [h, m] = dutyStartTime.split(':').map(Number)
  const now = new Date()
  const dutyAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0)
  const minutesLate = Math.round((now - dutyAt) / 60000)
  return minutesLate > 0 ? { status: 'late', minutesLate } : { status: 'on_time', minutesLate: 0 }
}

// Inverse of dutyStatusFor — how many minutes before duty_start_time the current moment is, or 0
// if duty time has already arrived/passed (or isn't set at all).
function minutesBeforeDuty(dutyStartTime) {
  if (!dutyStartTime) return 0
  const [h, m] = dutyStartTime.split(':').map(Number)
  const now = new Date()
  const dutyAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0)
  const diff = Math.round((dutyAt - now) / 60000)
  return diff > 0 ? diff : 0
}

export default function PunchInGate({ children }) {
  const { currentUser, role, logout } = useAuth()
  const { approvedAttendanceRules, distributors } = useData()
  const [checked, setChecked] = useState(false)
  const [punched, setPunched] = useState(false)
  const [punching, setPunching] = useState(false)
  const [locError, setLocError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  // { kind: 'early', minutesEarly, threshold, withLocation } | { kind: 'deviation', lat, lng, distanceM, allowedM, priorFlags }
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [blocked, setBlocked] = useState(null) // { reason: 'early'|'deviation', ...details } — hard "Don't Allow"
  const [result, setResult] = useState(null) // duty status shown once, right after a fresh punch

  // Sales Team (r5) only — Distributor Physical Stock Take gate. `overdueDistributors` is a queue:
  // the block screen embeds StockTakeEntry for the first one, onDone pops it and moves to the next,
  // and once empty the normal punch flow proceeds. Only matters on the not-yet-punched-today path
  // (see the render logic below) — this never retroactively locks someone out after they've already
  // punched in.
  const [stockTakeChecked, setStockTakeChecked] = useState(false)
  const [overdueDistributors, setOverdueDistributors] = useState([])
  const [warnDistributors, setWarnDistributors] = useState([])

  useEffect(() => {
    if (!currentUser?.id) return
    db.fetchTodayPunch(currentUser.id).then(({ data, error }) => {
      if (error) setSubmitError('Could not check today\'s attendance status: ' + error.message)
      setPunched(!!data)
      setChecked(true)
    })
  }, [currentUser?.id])

  useEffect(() => {
    if (role?.id !== 'r5' || !currentUser?.member_id) { setStockTakeChecked(true); return }
    const mid = currentUser.member_id
    const myDistributors = (distributors || []).filter(d => d.type === 'Distributor' && (d.assignments || []).some(a => a.member_id === mid))
    const distributorIds = myDistributors.map(d => d.id)
    if (!distributorIds.length) { setStockTakeChecked(true); return }

    (async () => {
      const today = localDateStr(new Date())
      // Bootstrap first — "frequency is calculated immediately from next punch in of team": an
      // approved rule with no anchor yet gets one right now, before due-status is computed off it.
      await db.bootstrapStockTakeAnchors(distributorIds, today)
      const [{ data: rules }, { data: takes }] = await Promise.all([
        db.fetchStockTakeRules({ distributorIds }),
        db.fetchStockTakesForDistributors({ distributorIds }),
      ])
      const latestTakeDate = {}
      ;(takes || []).forEach(t => { latestTakeDate[t.distributor_id] = t.take_date }) // ascending order — last write wins = latest
      const overdue = [], warn = []
      myDistributors.forEach(d => {
        const rule = (rules || []).find(r => r.distributor_id === d.id)
        const status = computeDueStatus(rule, latestTakeDate[d.id] || null, today)
        if (status.state === 'overdue') overdue.push(d)
        else if (status.state === 'warn') warn.push(d)
      })
      setOverdueDistributors(overdue)
      setWarnDistributors(warn)
      setStockTakeChecked(true)
    })()
  }, [role?.id, currentUser?.member_id, distributors])

  const submitPunch = async (lat, lng, distanceM, locationFlag, flagReason) => {
    setPunching(true)
    setSubmitError(null)
    const duty = dutyStatusFor(currentUser.duty_start_time)
    // Late Present / Half Day rule classification — only fires for users covered by an
    // Admin-approved rule; everyone else keeps exactly today's plain Late/On-Time behavior above.
    const rule = resolveRuleClassification(currentUser, approvedAttendanceRules, duty?.minutesLate)
    const { error } = await db.punchIn(currentUser.id, {
      lat, lng, distanceM, locationFlag, flagReason,
      dutyStatus: duty?.status, minutesLate: duty?.minutesLate,
      ruleType: rule?.ruleType, ruleId: rule?.ruleId,
    })
    setPunching(false)
    if (error) {
      setSubmitError('Could not save your punch-in — ' + error.message + '. Please try again.')
      setPendingConfirm(null)
      return
    }
    setPendingConfirm(null)
    setPunched(true)
    setResult(duty)
  }

  // Stage 2 of the gate — location/deviation. `priorFlags` carries any flag reason already
  // accumulated from stage 1 (early-punch), so a punch that trips BOTH checks ends up with one
  // combined flag_reason rather than losing the earlier one.
  const evaluate = (lat, lng, priorFlags = []) => {
    if (lat == null || lng == null) {
      submitPunch(null, null, null, true, [...priorFlags, 'No location captured'].join('; '))
      return
    }
    if (currentUser.hq_latitude == null || currentUser.hq_longitude == null) {
      submitPunch(lat, lng, null, true, [...priorFlags, 'HQ location not set for this employee'].join('; '))
      return
    }

    const distanceM = Math.round(haversineMeters(lat, lng, currentUser.hq_latitude, currentUser.hq_longitude))
    // A user covered by an approved Punch Deviation rule follows its threshold + Action instead of
    // their own allowed_deviation_m — anyone not covered keeps exactly today's behavior (soft-warn
    // via their own per-user limit).
    const devRule = resolvePunchGateRule(currentUser, approvedAttendanceRules, 'punch_deviation')
    const allowedM = devRule?.threshold_meters ?? (currentUser.allowed_deviation_m ?? DEFAULT_DEVIATION_LIMIT_M)
    const action = devRule?.action ?? 'warn'

    if (distanceM > allowedM) {
      if (action === 'deny') {
        setBlocked({ reason: 'deviation', distanceM, allowedM })
        return
      }
      if (action === 'warn') {
        setPendingConfirm({ kind: 'deviation', lat, lng, distanceM, allowedM, priorFlags })
        return
      }
      // action === 'allow' — proceed silently, no flag added for the deviation itself.
    }
    submitPunch(lat, lng, distanceM, priorFlags.length > 0, priorFlags.join('; ') || null)
  }

  const proceedToLocation = (withLocation, priorFlags) => {
    if (!withLocation || !navigator.geolocation) {
      setPunching(false)
      evaluate(null, null, priorFlags)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => { setPunching(false); evaluate(pos.coords.latitude, pos.coords.longitude, priorFlags) },
      () => { setLocError('Could not get your current location'); setPunching(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Stage 1 of the gate — early punch-in. Doesn't need geolocation at all, so it runs first and
  // fails fast: no point prompting for location permission if the employee shouldn't be punching
  // in yet anyway.
  const doPunch = (withLocation) => {
    setPunching(true)
    setSubmitError(null)
    setLocError(null)

    const minutesEarly = minutesBeforeDuty(currentUser.duty_start_time)
    if (minutesEarly > 0) {
      const earlyRule = resolvePunchGateRule(currentUser, approvedAttendanceRules, 'early_punch')
      if (earlyRule && minutesEarly > earlyRule.threshold_minutes) {
        if (earlyRule.action === 'deny') {
          setPunching(false)
          setBlocked({ reason: 'early', minutesEarly, threshold: earlyRule.threshold_minutes })
          return
        }
        if (earlyRule.action === 'warn') {
          setPunching(false)
          setPendingConfirm({ kind: 'early', minutesEarly, threshold: earlyRule.threshold_minutes, withLocation })
          return
        }
        // action === 'allow' — continue silently, no flag.
      }
    }

    proceedToLocation(withLocation, [])
  }

  const confirmPending = () => {
    if (!pendingConfirm) return
    if (pendingConfirm.kind === 'early') {
      const flagMsg = `Punched in ${pendingConfirm.minutesEarly}m early (limit ${pendingConfirm.threshold}m)`
      const withLocation = pendingConfirm.withLocation
      setPendingConfirm(null)
      setPunching(true)
      proceedToLocation(withLocation, [flagMsg])
      return
    }
    // kind === 'deviation'
    const { lat, lng, distanceM, allowedM, priorFlags } = pendingConfirm
    const flagMsg = `${distanceM}m from HQ (limit ${allowedM}m)`
    submitPunch(lat, lng, distanceM, true, [...priorFlags, flagMsg].join('; '))
  }

  if (!checked) return null
  if (punched && !result) return children
  if (!stockTakeChecked) return null

  const cardStyle = { background: '#fff', borderRadius: 16, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center' }
  const wrapStyle = { minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }
  const wideCardStyle = { background: '#fff', borderRadius: 16, padding: 20, maxWidth: 640, width: '100%', maxHeight: '92vh', overflowY: 'auto' }

  if (overdueDistributors.length > 0) {
    const current = overdueDistributors[0]
    return (
      <div style={wrapStyle}>
        <div style={wideCardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>Physical Stock Take Required</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              {overdueDistributors.length > 1
                ? `${overdueDistributors.length} distributors are overdue — complete each to punch in.`
                : 'This distributor\'s stock take is overdue — complete it to punch in.'}
            </div>
          </div>
          <StockTakeEntry
            distributor={current}
            memberId={currentUser.member_id}
            onDone={() => setOverdueDistributors(prev => prev.slice(1))}
          />
        </div>
      </div>
    )
  }

  if (result) {
    const isLate = result.status === 'late'
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>{isLate ? '⏰' : '✅'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: isLate ? '#ef4444' : '#10b981' }}>
            {isLate ? `Late Duty — ${result.minutesLate}m late` : 'Duty On Time'}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>Punched in at {new Date().toLocaleTimeString('en-IN')}</div>
          <Btn v="pri" full onClick={() => setResult(null)}>Continue</Btn>
        </div>
      </div>
    )
  }

  if (blocked) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🚫</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>Punch-In Not Allowed</div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 20 }}>
            {blocked.reason === 'deviation' ? (
              <>You are away from your headquarters by <strong>{blocked.distanceM}m</strong> — more than the
              approved limit of <strong>{blocked.allowedM}m</strong> for your role.</>
            ) : (
              <>You're <strong>{blocked.minutesEarly}m</strong> early — punch-in isn't allowed more than{' '}
              <strong>{blocked.threshold}m</strong> before your reporting time.</>
            )}
          </div>
          <Btn v="pri" full onClick={() => setBlocked(null)}>Try Again</Btn>
          <Btn sm onClick={logout} style={{ marginTop: 12, background: 'transparent', color: '#9ca3af', border: 'none' }}>
            Logout
          </Btn>
        </div>
      </div>
    )
  }

  if (pendingConfirm) {
    const isEarly = pendingConfirm.kind === 'early'
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>
            {isEarly ? 'Early Punch-In' : 'Outside Approved Range'}
          </div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 20 }}>
            {isEarly ? (
              <>You're punching in <strong>{pendingConfirm.minutesEarly}m</strong> early — more than the approved{' '}
              <strong>{pendingConfirm.threshold}m</strong> before reporting time. This will be flagged for HR review.</>
            ) : (
              <>You are away from your headquarters by <strong>{pendingConfirm.distanceM}m</strong> — more than your
              approved limit of <strong>{pendingConfirm.allowedM}m</strong>. This will be flagged for HR review.</>
            )}
          </div>
          <Btn v="pri" full disabled={punching} onClick={confirmPending}>
            {punching ? 'Punching in...' : 'Confirm & Punch In'}
          </Btn>
          <Btn full disabled={punching} onClick={() => setPendingConfirm(null)} style={{ marginTop: 8 }}>
            Cancel
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📍</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Punch In to Continue</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{currentUser?.name}</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 20 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>

        {warnDistributors.length > 0 && (
          <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '8px 10px', marginBottom: 16, textAlign: 'left' }}>
            ⚠ Stock take due soon: {warnDistributors.map(d => d.name).join(', ')}
          </div>
        )}

        <Btn v="pri" full disabled={punching} onClick={() => doPunch(true)}>
          {punching ? 'Punching in...' : 'Punch In'}
        </Btn>

        {locError && (
          <>
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{locError}</div>
            <Btn full disabled={punching} onClick={() => doPunch(false)} style={{ marginTop: 8 }}>
              Punch In Without Location
            </Btn>
          </>
        )}

        {submitError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 10 }}>{submitError}</div>}

        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 16 }}>
          Your location is captured to confirm attendance at your assigned headquarters.
        </div>

        <Btn sm onClick={logout} style={{ marginTop: 18, background: 'transparent', color: '#9ca3af', border: 'none' }}>
          Logout
        </Btn>
      </div>
    </div>
  )
}
