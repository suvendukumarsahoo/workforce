import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { Card, CH, Btn, Sheet, Inp } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const statusLabel = (s) => ({
  waiting_driver_acceptance: 'Awaiting Your Acceptance',
  driver_accepted: 'Accepted — Proceed to Warehouse',
  vehicle_parked: 'Vehicle Parked for Loading',
  loading_in_progress: 'Loading in Progress',
  loading_complete: 'Loading Complete',
  in_transit: 'In Transit',
  completed: 'Delivery Completed',
}[s] || s)

export default function AssignedLoads() {
  const { currentUser } = useAuth()
  const [allocations, setAllocations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [accepting, setAccepting] = useState(null)

  const [inTransit, setInTransit] = useState(false)
  const [transitMinutes, setTransitMinutes] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)
  const [reportHours, setReportHours] = useState('')
  const [reportMinutes, setReportMinutes] = useState('')
  const [delayComment, setDelayComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingParkId, setConfirmingParkId] = useState(null)

  const loadData = async () => {
    const { data } = await db.fetchDriverAllocations(currentUser?.member_id)
    setAllocations(data || [])
    setLoaded(true)
  }
  if (!loaded) loadData()

  const openAccept = (a) => {
    setAccepting(a)
    setInTransit(false); setTransitMinutes(null); setLocateError(null)
    setReportHours(''); setReportMinutes(''); setDelayComment('')
  }

  const calculateTransitTime = () => {
    if (!accepting?.warehouse?.latitude || !accepting?.warehouse?.longitude) {
      setLocateError('Warehouse location not available'); return
    }
    if (!navigator.geolocation) {
      setLocateError('Geolocation not supported on this device'); return
    }
    setLocating(true); setLocateError(null)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords
        const wh = accepting.warehouse
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${longitude},${latitude};${wh.longitude},${wh.latitude}?overview=false`)
        const data = await res.json()
        if (data.code !== 'Ok' || !data.routes?.length) {
          setLocateError('Could not calculate journey time'); setLocating(false); return
        }
        setTransitMinutes(Math.round(data.routes[0].duration / 60))
        setLocating(false)
      } catch (e) {
        setLocateError('Error calculating journey time'); setLocating(false)
      }
    }, () => {
      setLocateError('Could not get your current location'); setLocating(false)
    })
  }

  const totalReportingMinutes = () => {
    if (inTransit) return transitMinutes || 0
    return (Number(reportHours) || 0) * 60 + (Number(reportMinutes) || 0)
  }

  const needsDelayComment = () => totalReportingMinutes() > 30

  const submitAccept = async () => {
    if (inTransit && transitMinutes === null) { return }
    if (!inTransit && reportHours === '' && reportMinutes === '') { return }
    if (needsDelayComment() && !delayComment.trim()) { return }
    setBusy(true)
    const { error } = await db.driverAcceptLoad(accepting.id, {
      reporting_hours: inTransit ? 0 : (Number(reportHours) || 0),
      reporting_minutes: inTransit ? 0 : (Number(reportMinutes) || 0),
      transit_time_minutes: inTransit ? (transitMinutes || 0) : null,
      delay_comment: needsDelayComment() ? delayComment.trim() : null,
    })
    setBusy(false)
    if (error) { return }
    await loadData()
    setAccepting(null)
  }
const confirmParked = async (allocationId) => {
    setConfirmingParkId(allocationId)
    const { error } = await db.driverConfirmParked(allocationId)
    setConfirmingParkId(null)
    if (!error) await loadData()
  }
  return (
    <div>
      <Card>
        <CH title="Assigned Loads" sub={`${allocations.length} allocation(s)`} />
        {allocations.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No loads assigned</div>}
        {allocations.map(a => (
          <div key={a.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div onClick={() => a.status === 'waiting_driver_acceptance' && openAccept(a)}
              style={{ cursor: a.status === 'waiting_driver_acceptance' ? 'pointer' : 'default' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.id} — {a.vehicle?.vehicle_number}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>From {a.warehouse?.name}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: a.status === 'waiting_driver_acceptance' ? '#2563eb' : '#10b981' }}>
                {statusLabel(a.status)}{a.status === 'waiting_driver_acceptance' ? ' — Tap to Accept' : ''}
              </div>
            </div>
            {a.status === 'driver_accepted' && (
              <Btn sm v="pri" style={{ marginTop: 8 }} onClick={() => confirmParked(a.id)}>Confirm Vehicle Parked for Loading</Btn>
            )}
          </div>
        ))}
      </Card>

      {accepting && (
        <Sheet title={`Accept ${accepting.id}`} sub={`Vehicle: ${accepting.vehicle?.vehicle_number} · Warehouse: ${accepting.warehouse?.name}`} onClose={() => setAccepting(null)}>

          <Card style={{ background: '#f9fafb' }}>
            <div style={{ padding: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={inTransit} onChange={e => { setInTransit(e.target.checked); setTransitMinutes(null); setLocateError(null) }} />
                I am currently in transit (not at base)
              </label>

              {inTransit && (
                <div style={{ marginTop: 10 }}>
                  {transitMinutes === null ? (
                    <Btn sm v="pri" disabled={locating} onClick={calculateTransitTime}>
                      {locating ? 'Locating...' : 'Calculate Journey Time to Warehouse'}
                    </Btn>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>
                      Journey time to warehouse: {Math.floor(transitMinutes / 60)}h {transitMinutes % 60}m
                    </div>
                  )}
                  {locateError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{locateError}</div>}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CH title="Reporting Time" sub={inTransit ? "Disabled — using journey time to warehouse instead" : "Time required to report at warehouse"} />
            <div style={{ padding: 12, display: 'flex', gap: 10, opacity: inTransit ? 0.5 : 1 }}>
              <div style={{ flex: 1 }}>
                <Inp label="Hours" type="number" value={reportHours} onChange={v => !inTransit && setReportHours(v)} placeholder="0" style={{ pointerEvents: inTransit ? 'none' : 'auto' }} />
              </div>
              <div style={{ flex: 1 }}>
                <Inp label="Minutes" type="number" value={reportMinutes} onChange={v => !inTransit && setReportMinutes(v)} placeholder="0" style={{ pointerEvents: inTransit ? 'none' : 'auto' }} />
              </div>
            </div>
          </Card>

          {(inTransit ? transitMinutes !== null : reportHours !== '') && (
            <Card style={{ background: needsDelayComment() ? '#fef2f2' : '#f0fdf4' }}>
              <div style={{ padding: 12, fontSize: 13, fontWeight: 600, color: needsDelayComment() ? '#ef4444' : '#166534' }}>
                Reporting Time: {Math.floor(totalReportingMinutes() / 60)}h {totalReportingMinutes() % 60}m
                {inTransit ? ' (journey time to warehouse)' : ''}
              </div>
            </Card>
          )}

          {needsDelayComment() && (
            <Card>
              <div style={{ padding: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Reason for delay (required — total time exceeds 30 minutes)
                </label>
                <textarea value={delayComment} onChange={e => setDelayComment(e.target.value)} rows={3}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            </Card>
          )}

          <Btn v="pri" full disabled={busy || (needsDelayComment() && !delayComment.trim())} onClick={submitAccept}>
            {busy ? 'Submitting...' : 'Accept & Confirm Reporting Time'}
          </Btn>
        </Sheet>
      )}
    </div>
  )
}