import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Card, CH, AttCal } from './ui.jsx'
import { computeAttendanceStats } from '../lib/attendanceRules.js'
import * as db from '../lib/db.js'

export default function MyAttendanceCalendar({ compact }) {
  const { currentUser } = useAuth()
  const [punches, setPunches] = useState([])
  const [ruleSettings, setRuleSettings] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const today = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()

  useEffect(() => {
    if (!currentUser?.id) return
    Promise.all([
      db.fetchMyAttendance(currentUser.id, month, year),
      db.fetchAttendanceRuleSettings(),
    ]).then(([{ data }, { data: rs }]) => {
      setPunches(data || [])
      setRuleSettings(rs || null)
      setLoaded(true)
    })
  }, [currentUser?.id, month, year])

  const stats = computeAttendanceStats(punches, today, daysInMonth, ruleSettings)
  const flagged = punches.filter(p => p.location_flag).length

  return (
    <Card>
      <CH title="My Attendance" sub={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
      <div style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: compact ? 10 : 12 }}>
          {[['Present', stats.present, '#10b981'], ['Pending', stats.pendingApproval, '#7c3aed'], ['Absent', stats.effectiveAbsent, '#ef4444'], ['Rate', stats.rate + '%', stats.rate >= 90 ? '#10b981' : stats.rate >= 75 ? '#f59e0b' : '#ef4444']].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#6b7280' }}>{l}</div>
              <div style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {(stats.unapprovedLate > 0 || stats.unapprovedHalfDay > 0) && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 11, justifyContent: 'center' }}>
            {stats.unapprovedLate > 0 && <span style={{ color: '#f97316', fontWeight: 600 }}>🟠 Late Present: {stats.unapprovedLate}</span>}
            {stats.unapprovedHalfDay > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>🟡 Half Day: {stats.unapprovedHalfDay}</span>}
          </div>
        )}
        {loaded && <AttCal days={stats.days} flags={stats.flags} />}
        {flagged > 0 && (
          <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginTop: 10 }}>
            {flagged} punch-in{flagged > 1 ? 's' : ''} this month flagged for location review by HR.
          </div>
        )}
      </div>
    </Card>
  )
}
