import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Btn } from './ui.jsx'
import { haversineMeters } from '../lib/geo.js'
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

export default function PunchInGate({ children }) {
  const { currentUser, logout } = useAuth()
  const [checked, setChecked] = useState(false)
  const [punched, setPunched] = useState(false)
  const [punching, setPunching] = useState(false)
  const [locError, setLocError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [pendingConfirm, setPendingConfirm] = useState(null) // { lat, lng, distanceM, allowedM } awaiting explicit confirm
  const [result, setResult] = useState(null) // duty status shown once, right after a fresh punch

  useEffect(() => {
    if (!currentUser?.id) return
    db.fetchTodayPunch(currentUser.id).then(({ data, error }) => {
      if (error) setSubmitError('Could not check today\'s attendance status: ' + error.message)
      setPunched(!!data)
      setChecked(true)
    })
  }, [currentUser?.id])

  const submitPunch = async (lat, lng, distanceM, locationFlag, flagReason) => {
    setPunching(true)
    setSubmitError(null)
    const duty = dutyStatusFor(currentUser.duty_start_time)
    const { error } = await db.punchIn(currentUser.id, {
      lat, lng, distanceM, locationFlag, flagReason,
      dutyStatus: duty?.status, minutesLate: duty?.minutesLate,
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

  const evaluate = (lat, lng) => {
    const allowedM = currentUser.allowed_deviation_m ?? DEFAULT_DEVIATION_LIMIT_M

    if (lat == null || lng == null) {
      submitPunch(null, null, null, true, 'No location captured')
      return
    }
    if (currentUser.hq_latitude == null || currentUser.hq_longitude == null) {
      submitPunch(lat, lng, null, true, 'HQ location not set for this employee')
      return
    }

    const distanceM = Math.round(haversineMeters(lat, lng, currentUser.hq_latitude, currentUser.hq_longitude))
    if (distanceM > allowedM) {
      setPendingConfirm({ lat, lng, distanceM, allowedM })
      return
    }
    submitPunch(lat, lng, distanceM, false, null)
  }

  const doPunch = (withLocation) => {
    setPunching(true)
    setSubmitError(null)
    setLocError(null)

    if (!withLocation || !navigator.geolocation) {
      setPunching(false)
      evaluate(null, null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => { setPunching(false); evaluate(pos.coords.latitude, pos.coords.longitude) },
      () => { setLocError('Could not get your current location'); setPunching(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const confirmOverLimitPunch = () => {
    if (!pendingConfirm) return
    const { lat, lng, distanceM, allowedM } = pendingConfirm
    submitPunch(lat, lng, distanceM, true, `${distanceM}m from HQ (limit ${allowedM}m)`)
  }

  if (!checked) return null
  if (punched && !result) return children

  const cardStyle = { background: '#fff', borderRadius: 16, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center' }
  const wrapStyle = { minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }

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

  if (pendingConfirm) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>Outside Approved Range</div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 20 }}>
            You are away from your headquarters by <strong>{pendingConfirm.distanceM}m</strong> — more than your
            approved limit of <strong>{pendingConfirm.allowedM}m</strong>. This will be flagged for HR review.
          </div>
          <Btn v="pri" full disabled={punching} onClick={confirmOverLimitPunch}>
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
