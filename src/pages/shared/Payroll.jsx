import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Av } from '../../components/ui.jsx'

const F    = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const netS = s => (s.basic || 0) + (s.hra || 0) + (s.ta || 0) + (s.da || 0) - (s.pf || 0) - (s.tds || 0)

export default function Payroll() {
  const { salaries, members } = useData()
  const total = (salaries || []).reduce((s, sl) => s + netS(sl), 0)

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Total payroll — {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{F(total)}</div>
      </div>
      {(salaries || []).map(sl => {
        const m = (members || []).find(x => x.id === sl.member_id)
        if (!m) return null
        return (
          <Card key={sl.id}>
            <CH
              title={m.name}
              sub={m.role}
              right={<span style={{ fontWeight: 700, color: '#10b981', fontSize: 15 }}>{F(netS(sl))}</span>}
            />
            <div style={{ padding: '0 14px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 10 }}>
                {[['Basic', sl.basic, false], ['HRA', sl.hra, false], ['TA', sl.ta, false], ['DA', sl.da, false], ['PF', sl.pf, true], ['TDS', sl.tds, true]].map(([k, v, ded]) => (
                  <div key={k} style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ded ? '#ef4444' : '#374151' }}>{ded ? '–' : ''}{F(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
