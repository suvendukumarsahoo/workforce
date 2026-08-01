import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Btn } from './ui.jsx'
import { haversineMeters } from '../lib/geo.js'
import * as db from '../lib/db.js'

const DEVIATION_LIMIT_M = 20

export default function PunchInGate({ children }) {
  const { currentUser, logout } = useAuth()
  const [checked, setChecked] = useState(false)
  const [punched, setPunched] = useState(false)
  const [punching, setPunching] = useState(false)
  const [locError, setLocError] = useState(null)

  useEffect(() => {
    if (!currentUser?.id) return
    db.fetchTodayPunch(currentUser.id).then(({ data }) => {
      setPunched(!!data)
      setChecked(true)
    })
  }, [currentUser?.id])

  const doPunch = (withLocation) => {
    setPunching(true)
    setLocError(null)

    const finish = async (lat, lng) => {
      let distanceM = null
      let locationFlag = false
      let flagReason = null

      if (lat == null || lng == null) {
        locationFlag = true
        flagReason = 'No location captured'
      } else if (currentUser.hq_latitude == null || currentUser.hq_longitude == null) {
        locationFlag = true
        flagReason = 'HQ location not set for this employee'
      } else {
        distanceM = Math.round(haversineMeters(lat, lng, currentUser.hq_latitude, currentUser.hq_longitude))
        if (distanceM > DEVIATION_LIMIT_M) {
          locationFlag = true
          flagReason = `${distanceM}m from HQ (limit ${DEVIATION_LIMIT_M}m)`
        }
      }

      await db.punchIn(currentUser.id, { lat, lng, distanceM, locationFlag, flagReason })
      setPunching(false)
      setPunched(true)
    }

    if (!withLocation || !navigator.geolocation) {
      finish(null, null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => finish(pos.coords.latitude, pos.coords.longitude),
      () => { setLocError('Could not get your current location'); setPunching(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  if (!checked) return null
  if (punched) return children

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center' }}>
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
