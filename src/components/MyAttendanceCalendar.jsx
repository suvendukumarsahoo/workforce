import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Card, CH, AttCal } from './ui.jsx'
import * as db from '../lib/db.js'

export default function MyAttendanceCalendar({ compact }) {
  const { currentUser } = useAuth()
  const [punches, setPunches] = useState([])
  const [loaded, setLoaded] = useState(false)

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const today = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()

  useEffect(() => {
    if (!currentUser?.id) return
    db.fetchMyAttendance(currentUser.id, month, year).then(({ data }) => {
      setPunches(data || [])
      setLoaded(true)
    })
  }, [currentUser?.id, month, year])

  // Present now requires BOTH HR approval stages — punch-in review, then activity review.
  const isFullyApproved = p => p.punch_approval_status === 'approved' && p.activity_approval_status === 'approved'
  const present = punches.filter(isFullyApproved).length
  const pendingApproval = punches.length - present
  const absent = Math.max(0, today - punches.length)
  const rate = today > 0 ? Math.round((present / today) * 100) : 0
  const flagged = punches.filter(p => p.location_flag).length

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1
    if (dayNum > today) return 'W'
    const p = punches.find(x => new Date(x.date).getDate() === dayNum)
    if (!p) return 'A'
    return isFullyApproved(p) ? 'P' : 'X'
  })

  return (
    <Card>
      <CH title="My Attendance" sub={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
      <div style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: compact ? 10 : 12 }}>
          {[['Present', present, '#10b981'], ['Pending', pendingApproval, '#7c3aed'], ['Absent', absent, '#ef4444'], ['Rate', rate + '%', rate >= 90 ? '#10b981' : rate >= 75 ? '#f59e0b' : '#ef4444']].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#6b7280' }}>{l}</div>
              <div style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {loaded && <AttCal days={days} />}
        {flagged > 0 && (
          <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginTop: 10 }}>
            {flagged} punch-in{flagged > 1 ? 's' : ''} this month flagged for location review by HR.
          </div>
        )}
      </div>
    </Card>
  )
}
