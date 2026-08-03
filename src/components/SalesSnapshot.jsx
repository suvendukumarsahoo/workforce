import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import * as db from '../lib/db.js'
import { pct } from '../lib/achievementEngine.js'

/**
 * Dedicated Sales snapshot — a dense, dark "executive glance" widget occupying the top of the
 * Admin dashboard, replacing the old tabbed Today/Monthly/Custom + meters/donut/breakdown-bars
 * Sales section entirely (per user's explicit direction, inspired by a Geckoboard sales dashboard
 * reference: revenue trend, big revenue numbers, a leaderboard, a deals-style feed, and pipeline
 * stats — all in one compact panel). Deeper drill-down (per-manager/per-member goal detail,
 * products/categories breakdown) still exists — it's one tap away via the leaderboard rows into
 * the same ManagerLevelSheet/MemberGoalDetail Sheets Dashboard.jsx already had.
 *
 * Today/This Month/This Year tabs (default: This Month) scope the revenue trend, the Revenue
 * number, and the Top 10 Customers/Products panels. The Manager Leaderboard stays month-scoped
 * regardless of tab — goals are inherently monthly (see the Monthly Goals architecture), so there's
 * no meaningful "today" or "this year" goal-vs-achievement to show there. Orders Under
 * Process/Stale/Avg Order Value/Goals Pending are live current-state snapshots, also not
 * tab-scoped.
 */

const TABS = [['today', 'Today'], ['month', 'This Month'], ['year', 'This Year']]
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const Fk = n => {
  const v = Number(n) || 0
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L'
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'K'
  return '₹' + Math.round(v)
}
const timeAgo = iso => {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
const orderValue = o => (o.items || []).filter(it => !it.cancelled)
  .reduce((s, it) => s + (it.rate || 0) * (it.final_qty ?? it.approved_qty ?? it.order_qty ?? 0), 0)
const lineTotal = inv => (inv.lines || inv.invoice_lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)

function rangeForTab(tab, now) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  if (tab === 'today') return { from: new Date(y, m, d), to: new Date(y, m, d, 23, 59, 59) }
  if (tab === 'year') return { from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59) }
  return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59) }
}

// Per-bucket (NOT cumulative) revenue, date vs value — plotting a running total made the line look
// like an artificial straight ramp with sparse invoice data; real per-day/per-month figures give an
// honest line with real ups and downs. Granularity follows the active tab: last 7 days for Today (a
// single day has no sub-daily breakdown in this data), daily for This Month, monthly for This Year.
function buildTrend(tab, invoices, now) {
  if (tab === 'year') {
    const months = Array.from({ length: now.getMonth() + 1 }, (_, i) => ({ label: MONTH_LABELS[i], value: 0, month: i }))
    invoices.forEach(inv => {
      const d = new Date(inv.date)
      if (d.getFullYear() !== now.getFullYear()) return
      const row = months[d.getMonth()]
      if (row) row.value += lineTotal(inv)
    })
    return months
  }
  if (tab === 'today') {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
      return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), value: 0, dateKey: d.toDateString() }
    })
    invoices.forEach(inv => {
      const key = new Date(inv.date).toDateString()
      const row = days.find(x => x.dateKey === key)
      if (row) row.value += lineTotal(inv)
    })
    return days
  }
  const days = Array.from({ length: now.getDate() }, (_, i) => ({ label: String(i + 1), value: 0, day: i + 1 }))
  invoices.forEach(inv => {
    const d = new Date(inv.date)
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return
    const row = days[d.getDate() - 1]
    if (row) row.value += lineTotal(inv)
  })
  return days
}

function topEntities(invoices, range, customers) {
  const custTotals = {}
  const prodTotals = {}
  invoices.forEach(inv => {
    const d = new Date(inv.date)
    if (d < range.from || d > range.to) return
    const lines = inv.lines || inv.invoice_lines || []
    let invTotal = 0
    lines.forEach(l => {
      const val = (Number(l.qty) || 0) * (Number(l.rate) || 0)
      invTotal += val
      const pid = l.product_id || l.product?.id
      if (!pid) return
      const name = l.product?.name || pid
      prodTotals[pid] = { name, value: (prodTotals[pid]?.value || 0) + val }
    })
    if (inv.distributor_id) {
      const name = (customers || []).find(c => c.id === inv.distributor_id)?.name || inv.distributor_id
      custTotals[inv.distributor_id] = { name, value: (custTotals[inv.distributor_id]?.value || 0) + invTotal }
    }
  })
  return {
    topCustomers: Object.values(custTotals).sort((a, b) => b.value - a.value).slice(0, 10),
    topProducts: Object.values(prodTotals).sort((a, b) => b.value - a.value).slice(0, 10),
  }
}

const panelBase = { background: '#1e293b', borderRadius: 12, padding: 14, minWidth: 220 }
const labelStyle = { fontSize: 11, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }

// `totalValue` is the denominator for each row's share bar/percentage — the whole period's revenue
// (not just the sum of the top 10 shown), so "42%" means "42% of all revenue this period," a more
// meaningful number than share-of-the-top-10. Three distinct colors, on purpose: the value font
// keeps this list's identity color (`valueColor` — purple for Customers, blue for Products), while
// the bar uses its own fixed two-tone scheme independent of that — green for the achieved/filled
// slice, a visible slate for the remaining share — so the bar doesn't just look like a duller copy
// of the text color, and "remaining" reads as a real color rather than a blank gap.
const BAR_ACHIEVED = '#34d399'
const BAR_REMAINING = '#475569'

function RankedList({ title, rows, formatValue, valueColor, totalValue }) {
  const fmt = formatValue || Fk
  const color = valueColor || '#38bdf8'
  return (
    <div style={{ ...panelBase, flex: '1 1 220px' }}>
      <div style={labelStyle}>{title}</div>
      {(rows || []).length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No data for this period</div>}
      {(rows || []).map((r, i) => {
        const share = totalValue > 0 ? Math.min(100, (r.value / totalValue) * 100) : 0
        return (
          <div key={r.name + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <span style={{ fontSize: 10, color: '#64748b', width: 12, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <div style={{ flex: '1 1 40px', height: 6, background: BAR_REMAINING, borderRadius: 3, overflow: 'hidden', minWidth: 32 }}>
              <div style={{ width: `${share}%`, height: '100%', background: BAR_ACHIEVED, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, whiteSpace: 'nowrap' }}>
              {fmt(r.value)} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({share.toFixed(0)}%)</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function SalesSnapshot({ totalTarget, totalAch, pendingGoals, leaderboard, invoices, customers, onSelectManager }) {
  const [orders, setOrders] = useState(null)
  const [tab, setTab] = useState('month')

  useEffect(() => {
    let cancelled = false
    db.fetchAllOrdersWithItems().then(({ data }) => { if (!cancelled) setOrders(data || []) })
    return () => { cancelled = true }
  }, [])

  const now = new Date()
  const staleThreshold = new Date(now.getTime() - 3 * 86400000)
  const range = rangeForTab(tab, now)
  const rangeRevenue = (invoices || []).filter(i => { const d = new Date(i.date); return d >= range.from && d <= range.to }).reduce((s, i) => s + lineTotal(i), 0)
  const trend = buildTrend(tab, invoices || [], now)
  const { topCustomers, topProducts } = topEntities(invoices || [], range, customers)

  const underProcess = (orders || []).filter(o => (o.allocation?.status || '') !== 'completed')
  const underProcessValue = underProcess.reduce((s, o) => s + orderValue(o), 0)
  const staleOrders = underProcess.filter(o => new Date(o.order_date) < staleThreshold)
  const avgOrderValue = (orders || []).length ? (orders.reduce((s, o) => s + orderValue(o), 0) / orders.length) : 0
  const recentOrders = [...(orders || [])].sort((a, b) => new Date(b.order_date) - new Date(a.order_date)).slice(0, 5)

  const stats = [
    ['Orders Under Process', orders === null ? '—' : underProcess.length, F(underProcessValue), '#60a5fa'],
    ['Stale Orders (>3d)', orders === null ? '—' : staleOrders.length, staleOrders.length > 0 ? '⚠ needs attention' : 'all moving', '#f87171'],
    ['Target Achievement', `${pct(totalAch, totalTarget)}%`, 'This month', '#34d399'],
    ['Avg Order Value', orders === null ? '—' : F(avgOrderValue), '', '#fbbf24'],
    ['Goals Pending Review', pendingGoals, '', '#a78bfa'],
  ]

  const tabLabel = TABS.find(([k]) => k === tab)[1]

  return (
    <div style={{ background: '#0f172a', borderRadius: 16, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: tab === key ? '#38bdf8' : '#1e293b', color: tab === key ? '#0f172a' : '#94a3b8', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ ...panelBase, flex: '2 1 320px' }}>
          <div style={labelStyle}>Revenue Trend — {tabLabel}</div>
          <div style={{ width: '100%', height: 110 }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={F} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#e2e8f0' }} itemStyle={{ color: '#38bdf8' }} cursor={{ stroke: '#334155' }} />
                <Line type="linear" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={panelBase}>
          <div style={labelStyle}>Revenue — {tabLabel}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#38bdf8' }}>{Fk(rangeRevenue)}</div>
          {tab === 'month' && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{pct(totalAch, totalTarget)}% of target</div>}
        </div>

        <div style={{ ...panelBase, flex: '1.2 1 220px' }}>
          <div style={labelStyle}>Manager Leaderboard <span style={{ textTransform: 'none', fontWeight: 400 }}>(this month)</span></div>
          {(leaderboard || []).length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No managers yet</div>}
          {(leaderboard || []).map((r, i) => (
            <div key={r.id} onClick={() => onSelectManager(r.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {i === 0 && r.value > 0 ? <span style={{ color: '#fbbf24' }}>★</span> : <span style={{ width: 12, flexShrink: 0 }} />}
                <span style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', flexShrink: 0 }}>{Fk(r.value)}</span>
            </div>
          ))}
        </div>

        <div style={{ ...panelBase, flex: '1.6 1 280px' }}>
          <div style={labelStyle}>Recent Orders</div>
          {orders !== null && recentOrders.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No orders yet</div>}
          {recentOrders.map(o => (
            <div key={o.id} style={{ padding: '6px 0', borderBottom: '1px solid #334155' }}>
              <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                {o.member?.name || 'Team'} · {o.distributor?.name || 'Distributor'} — <span style={{ color: '#34d399', fontWeight: 700 }}>{F(orderValue(o))}</span>
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>{timeAgo(o.order_date)}</div>
            </div>
          ))}
        </div>

        <RankedList title={`Top 10 Customers — ${tabLabel}`} rows={topCustomers} formatValue={F} valueColor="#a78bfa" totalValue={rangeRevenue} />
        <RankedList title={`Top 10 Products — ${tabLabel}`} rows={topProducts} formatValue={F} valueColor="#60a5fa" totalValue={rangeRevenue} />

        <div style={{ ...panelBase, flex: '1.4 1 260px', display: 'flex', flexWrap: 'wrap', gap: 10, alignContent: 'flex-start' }}>
          {stats.map(([label, value, sub, color]) => {
            const emphasize = label === 'Orders Under Process'
            return (
              <div key={label} style={{ flex: '1 1 45%', minWidth: 100 }}>
                <div style={{ fontSize: emphasize ? 22 : 18, fontWeight: 800, color: label.startsWith('Stale') && staleOrders.length > 0 ? '#f87171' : color }}>{value}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{label}</div>
                {sub && <div style={{ fontSize: emphasize ? 12 : 9, color: '#64748b' }}>{sub}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
