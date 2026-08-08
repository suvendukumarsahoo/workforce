import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const AXIS_STYLE = { fontSize: 11, fill: '#9ca3af' }

// Present/Absent/Late per calendar day, this month up to today — light-themed to match this app's
// Attendance page (unlike the dark SalesSnapshot/GoalsStatus pages), same colors the HR Dashboard's
// stat tiles use so the chart and tiles read as one consistent language.
export default function AttendanceTrendChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>No attendance data yet this month</div>
  }
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="day" tick={AXIS_STYLE} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS_STYLE} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Present" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="Absent" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="Late" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
