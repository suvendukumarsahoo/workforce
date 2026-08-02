import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadialBarChart, RadialBar, PieChart, Pie, Cell } from 'recharts'
import { Card, CH } from '../ui.jsx'

// Shared wrapper card for a single parameter's chart — used at every drill level.
export function ChartSection({ title, sub, children }) {
  return (
    <Card>
      <CH title={title} sub={sub} />
      <div style={{ padding: '12px 4px 4px' }}>{children}</div>
    </Card>
  )
}

// Goal vs Achieved — same semantic colors this app already uses for "Approved targets" (blue) and
// "Achieved" (green) tiles elsewhere (Dashboard.jsx). Validated CVD-safe as a pair
// (scripts/validate_palette.js "#2563eb,#10b981" — PASS; contrast WARN mitigated below with
// always-on legend + direct value labels, not color alone).
const GOAL_COLOR = '#2563eb'
const ACHIEVED_COLOR = '#10b981'
const AXIS_STYLE = { fontSize: 11, fill: '#9ca3af' }

// Compact radial progress meter for a single scalar parameter (Value/Visits/Acquisition) — reuses
// this app's existing red/amber/green status-color convention (see ui.jsx's `barColor`) rather than
// inventing a new ramp, so a meter's color always means the same thing it already does everywhere
// else in the app (progress bars, GBadge, etc).
export function MeterGauge({ label, value, goal, formatValue }) {
  const fmt = formatValue || (n => Math.round(n).toLocaleString('en-IN'))
  const percent = goal > 0 ? Math.round((value / goal) * 100) : 0
  const displayPercent = Math.min(100, Math.max(0, percent))
  const color = percent >= 75 ? '#10b981' : percent >= 50 ? '#f59e0b' : '#ef4444'
  const data = [{ value: displayPercent, fill: color }]
  return (
    <div style={{ textAlign: 'center', padding: '4px 0' }}>
      <div style={{ width: 108, height: 108, margin: '0 auto', position: 'relative' }}>
        <RadialBarChart width={108} height={108} cx="50%" cy="50%" innerRadius="72%" outerRadius="100%" barSize={9} data={data} startAngle={90} endAngle={-270}>
          <RadialBar background={{ fill: '#f3f4f6' }} dataKey="value" cornerRadius={5} />
        </RadialBarChart>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 19, fontWeight: 700, color }}>{percent}%</span>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmt(value)} / {fmt(goal)}</div>
    </div>
  )
}

const DONUT_FALLBACK_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1']

// Share-of-total donut — "who contributed how much of this achieved total" (managers within the
// org, or members within a manager's team). Slice colors reuse each person's own established
// identity color (the same `color` field their Av avatar already uses elsewhere in the app) when
// available, falling back to a validated categorical palette (scripts/validate_palette.js — PASS).
export function ContributionDonut({ rows, formatValue, emptyLabel = 'No achievement yet' }) {
  const fmt = formatValue || (n => Math.round(n).toLocaleString('en-IN'))
  const filtered = (rows || []).filter(r => r.value > 0)
  if (filtered.length === 0) {
    return <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>{emptyLabel}</div>
  }
  const height = Math.max(180, Math.min(320, 40 + filtered.length * 22))
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={filtered} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={2}>
            {filtered.map((r, i) => <Cell key={r.name} fill={r.color || DONUT_FALLBACK_COLORS[i % DONUT_FALLBACK_COLORS.length]} stroke="#fff" strokeWidth={2} />)}
          </Pie>
          <Tooltip formatter={fmt} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// Multi-row horizontal bar chart — one row per item (product/category/customer breakdown).
export function GoalVsAchievedBreakdown({ rows, formatValue, emptyLabel = 'No items in scope' }) {
  const fmt = formatValue || (n => Math.round(n).toLocaleString('en-IN'))
  if (!rows || rows.length === 0) {
    return <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>{emptyLabel}</div>
  }
  const data = rows.map(r => ({ name: r.unit ? `${r.name} (${r.unit})` : r.name, Goal: r.goal, Achieved: r.achieved }))
  const height = Math.max(120, rows.length * 44)
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
          <XAxis type="number" tick={AXIS_STYLE} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} tickFormatter={fmt} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={130} />
          <Tooltip formatter={fmt} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Goal" fill={GOAL_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
          <Bar dataKey="Achieved" fill={ACHIEVED_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
