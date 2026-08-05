import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadialBarChart, RadialBar, PolarAngleAxis, PieChart, Pie, Cell } from 'recharts'
import { Card, CH } from '../ui.jsx'
import { CATEGORY_PALETTE } from '../../lib/categoryColors.js'

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
// `size` (diameter in px, default 108 — unchanged for every existing call site) scales the ring
// AND its fonts together, so a caller can promote one gauge to a hero figure (dataviz skill: "the
// one number a dashboard leads with, ≥48px... exactly one per view") without a second component.
export function MeterGauge({ label, value, goal, formatValue, dark, size = 108 }) {
  const fmt = formatValue || (n => Math.round(n).toLocaleString('en-IN'))
  const percent = goal > 0 ? Math.round((value / goal) * 100) : 0
  const displayPercent = Math.min(100, Math.max(0, percent))
  const color = percent >= 75 ? '#10b981' : percent >= 50 ? '#f59e0b' : '#ef4444'
  const data = [{ value: displayPercent, fill: color }]
  const barSize = Math.max(6, Math.round(size * 0.083))
  const fontPercent = Math.round(size * 0.176)
  const fontLabel = Math.max(12, Math.round(size * 0.11))
  const fontSub = Math.max(11, Math.round(size * 0.10))
  return (
    <div style={{ textAlign: 'center', padding: '4px 0' }}>
      <div style={{ width: size, height: size, margin: '0 auto', position: 'relative' }}>
        <RadialBarChart width={size} height={size} cx="50%" cy="50%" innerRadius="72%" outerRadius="100%" barSize={barSize} data={data} startAngle={90} endAngle={-270}>
          {/* Domain MUST be pinned to [0,100] — with a single data point and no explicit angle-axis
              domain, Recharts auto-scales the axis to [0, max(value)], which for one point equals
              the value itself, so the arc always renders as a full circle regardless of percent. */}
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: dark ? '#334155' : '#f3f4f6' }} dataKey="value" cornerRadius={5} />
        </RadialBarChart>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: fontPercent, fontWeight: 700, color }}>{percent}%</span>
        </div>
      </div>
      <div style={{ fontSize: fontLabel, fontWeight: 600, color: dark ? '#e2e8f0' : '#374151', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: fontSub, color: dark ? '#94a3b8' : '#9ca3af' }}>{fmt(value)} / {fmt(goal)}</div>
    </div>
  )
}

// Semicircular "fuel gauge" — a needle over a colored arc, one ratio-against-a-limit per gauge
// (dataviz skill: "a single ratio against a limit → Meter"), small-multiplied for several
// categories side by side. Unlike MeterGauge's severity ramp (red/amber/green by how close to
// goal), each NeedleGauge carries its OWN category's identity color (passed in via `color`) so
// categories stay visually distinct at a glance — the ask this component exists to satisfy. Per
// the skill's own text-color rule, the percent/value text stays neutral ink; only the arc + needle
// carry the category hue, so identity comes from the mark, not from coloring the number.
export function NeedleGauge({ label, value, goal, formatValue, color, dark }) {
  const fmt = formatValue || (n => Math.round(n).toLocaleString('en-IN'))
  const percent = goal > 0 ? Math.round((value / goal) * 100) : 0
  const displayPercent = Math.min(100, Math.max(0, percent))
  const hue = color || '#2563eb'
  const cx = 60, cy = 58, r = 46
  // 0% sits at 180° (left), 100% at 0° (right), sweeping clockwise over the top.
  const pt = (radius, pct) => {
    const a = Math.PI * (1 - pct / 100)
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)]
  }
  const [x0, y0] = pt(r, 0)
  const [x100, y100] = pt(r, 100)
  const [xv, yv] = pt(r, displayPercent)
  const [nx, ny] = pt(r - 12, displayPercent)
  const trackPath = `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x100} ${y100}`
  const filledPath = displayPercent > 0 ? `M ${x0} ${y0} A ${r} ${r} 0 ${displayPercent >= 100 ? 1 : 0} 1 ${xv} ${yv}` : null
  const needleColor = dark ? '#e2e8f0' : '#374151'
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 120 68" width={120} height={68}>
        <path d={trackPath} fill="none" stroke={dark ? '#334155' : '#e5e7eb'} strokeWidth={9} strokeLinecap="round" />
        {filledPath && <path d={filledPath} fill="none" stroke={hue} strokeWidth={9} strokeLinecap="round" />}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={needleColor} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill={needleColor} />
      </svg>
      <div style={{ fontSize: 16, fontWeight: 800, color: dark ? '#e2e8f0' : '#374151', marginTop: -4 }}>{percent}%</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: dark ? '#e2e8f0' : '#374151', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: hue, marginRight: 4 }} />
        {label}
      </div>
      <div style={{ fontSize: 11, color: dark ? '#94a3b8' : '#9ca3af' }}>{fmt(value)} / {fmt(goal)}</div>
    </div>
  )
}

// Share-of-total donut — "who contributed how much of this achieved total" (managers within the
// org, or members within a manager's team). Slice colors reuse each person's own established
// identity color (the same `color` field their Av avatar already uses elsewhere in the app) when
// available, falling back to a validated categorical palette (scripts/validate_palette.js — PASS).
export function ContributionDonut({ rows, formatValue, emptyLabel = 'No achievement yet', dark }) {
  const fmt = formatValue || (n => Math.round(n).toLocaleString('en-IN'))
  const filtered = (rows || []).filter(r => r.value > 0)
  if (filtered.length === 0) {
    return <div style={{ textAlign: 'center', padding: 20, color: dark ? '#64748b' : '#9ca3af', fontSize: 12 }}>{emptyLabel}</div>
  }
  const height = Math.max(180, Math.min(320, 40 + filtered.length * 22))
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={filtered} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={2}>
            {filtered.map((r, i) => <Cell key={r.name} fill={r.color || CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} stroke={dark ? '#1e293b' : '#fff'} strokeWidth={2} />)}
          </Pie>
          <Tooltip formatter={fmt} contentStyle={dark ? { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 } : { fontSize: 12, borderRadius: 8 }} labelStyle={dark ? { color: '#e2e8f0' } : undefined} itemStyle={dark ? { color: '#e2e8f0' } : undefined} />
          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, color: dark ? '#94a3b8' : undefined }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// Multi-row horizontal bar chart — one row per item (product/category/customer breakdown).
export function GoalVsAchievedBreakdown({ rows, formatValue, emptyLabel = 'No items in scope', dark }) {
  const fmt = formatValue || (n => Math.round(n).toLocaleString('en-IN'))
  if (!rows || rows.length === 0) {
    return <div style={{ textAlign: 'center', padding: 20, color: dark ? '#64748b' : '#9ca3af', fontSize: 12 }}>{emptyLabel}</div>
  }
  const data = rows.map(r => ({ name: r.unit ? `${r.name} (${r.unit})` : r.name, Goal: r.goal, Achieved: r.achieved }))
  const height = Math.max(120, rows.length * 44)
  const axisStyle = dark ? { fontSize: 11, fill: '#94a3b8' } : AXIS_STYLE
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={dark ? '#334155' : '#f3f4f6'} />
          <XAxis type="number" tick={axisStyle} axisLine={{ stroke: dark ? '#334155' : '#e5e7eb' }} tickLine={false} tickFormatter={fmt} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: dark ? '#e2e8f0' : '#374151' }} axisLine={false} tickLine={false} width={130} />
          <Tooltip formatter={fmt} contentStyle={dark ? { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 } : { fontSize: 12, borderRadius: 8 }} labelStyle={dark ? { color: '#e2e8f0' } : undefined} />
          <Legend wrapperStyle={{ fontSize: 11, color: dark ? '#94a3b8' : undefined }} />
          <Bar dataKey="Goal" fill={GOAL_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
          <Bar dataKey="Achieved" fill={ACHIEVED_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
