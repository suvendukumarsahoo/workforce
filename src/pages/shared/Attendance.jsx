import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av, AttCal } from '../../components/ui.jsx'

export default function Attendance() {
  const { members, attendance } = useData()

  const getAtt = (memberId) => {
    const days = (attendance || []).filter(a => a.member_id === memberId)
    const present = days.filter(d => d.status === 'P').length
    const absent  = days.filter(d => d.status === 'A').length
    const half    = days.filter(d => d.status === 'H').length
    const dayArr  = Array.from({ length: 27 }, (_, i) => {
      const d = days.find(x => new Date(x.date).getDate() === i + 1)
      return d ? d.status : 'W'
    })
    return { present, absent, half, days: dayArr }
  }

  return (
    <Card>
      <CH title="Attendance" sub={new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
      {(members || []).map(m => {
        const att = getAtt(m.id)
        const rate = Math.round(att.present / 26 * 100)
        return (
          <div key={m.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Av av={m.avatar} color={m.color} sz={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{m.role}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{att.present}P</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>{att.absent}A</span>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>{att.half}H</span>
                <span style={{ color: rate >= 90 ? '#10b981' : rate >= 75 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{rate}%</span>
              </div>
            </div>
            <AttCal days={att.days} />
          </div>
        )
      })}
    </Card>
  )
}
