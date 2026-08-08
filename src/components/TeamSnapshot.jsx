import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { MeterGauge, GoalVsAchievedBreakdown, ContributionDonut } from './charts/GoalBarChart.jsx'
import { formatPeriodLabel, rangeForTab } from '../lib/period.js'

/**
 * Light "CRM dashboard" style widget for a single Sales Team member's own Home tab — replaces the
 * earlier dark navy version (which stays as the pattern for Admin's SalesSnapshot only), per a
 * Coupler.io/Power BI reference the user pointed at: white background, solid colorful stat tiles,
 * donut charts, dual-line trend. Panels with no real data equivalent in this app (avg days to
 * close, pipeline/weighted value, deal-loss reasons, forward-looking projections, and multi-owner
 * filter dropdowns that don't apply to a single member's own scoped view) are intentionally omitted
 * rather than approximated.
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
const lineTotal = inv => (inv.lines || inv.invoice_lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)

function topCustomersForRange(invoices, range, customers) {
  const totals = {}
  invoices.forEach(inv => {
    const d = new Date(inv.date)
    if (d < range.from || d > range.to) return
    if (!inv.distributor_id) return
    const name = (customers || []).find(c => c.id === inv.distributor_id)?.name || inv.distributor_id
    totals[inv.distributor_id] = { name, value: (totals[inv.distributor_id]?.value || 0) + lineTotal(inv) }
  })
  return Object.values(totals).sort((a, b) => b.value - a.value).slice(0, 10)
}

// Trailing 12-month window ending this month (distinct from a calendar-year Jan..Dec bucketing) —
// matches the reference's "last 12 months" framing rather than "this calendar year so far."
function last12MonthsTrend(invoices, wonLeads, now) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    return { label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`, revenue: 0, won: 0, y: d.getFullYear(), m: d.getMonth() }
  })
  invoices.forEach(inv => {
    const d = new Date(inv.date)
    const row = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth())
    if (row) row.revenue += lineTotal(inv)
  })
  wonLeads.forEach(lead => {
    if (!lead.stage_updated_at) return
    const d = new Date(lead.stage_updated_at)
    const row = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth())
    if (row) row.won += 1
  })
  return months
}

const cardBase = { background: '#fff', borderRadius: 12, padding: 14, minWidth: 220, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #eef2f7' }
const labelStyle = { fontSize: 11, color: '#6b7280', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }
const BAR_ACHIEVED = '#10b981'
const BAR_REMAINING = '#e5e7eb'

function RankedList({ title, rows, formatValue, valueColor, totalValue, emptyLabel = 'No data for this period' }) {
  const fmt = formatValue || Fk
  const color = valueColor || '#7c3aed'
  return (
    <div style={{ ...cardBase, flex: '1 1 260px' }}>
      <div style={labelStyle}>{title}</div>
      {(rows || []).length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>{emptyLabel}</div>}
      {(rows || []).map((r, i) => {
        const share = totalValue > 0 ? Math.min(100, (r.value / totalValue) * 100) : 0
        return (
          <div key={r.name + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <span style={{ fontSize: 10, color: '#9ca3af', width: 12, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: '#374151', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <div style={{ flex: '1 1 40px', height: 6, background: BAR_REMAINING, borderRadius: 3, overflow: 'hidden', minWidth: 32 }}>
              <div style={{ width: `${share}%`, height: '100%', background: BAR_ACHIEVED, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, whiteSpace: 'nowrap' }}>
              {fmt(r.value)} <span style={{ fontWeight: 400, color: '#9ca3af' }}>({share.toFixed(0)}%)</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function StatTile({ label, value, bg }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140, background: bg, borderRadius: 12, padding: '16px 18px', color: '#fff' }}>
      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
    </div>
  )
}

const IN_PROGRESS_STAGES = ['final_pending', 'registration_pending', 'documents_submitted', 'documentation_verification', 'payment_pending', 'payment_verification']

export default function TeamSnapshot({ mid, invoices, customers, myAgg, periodTab, setPeriodTab, currentPeriod, myVisits, myLeads, onSelectStage, myOutlets, mySecondaryOrders, myRetailVisits }) {
  const [tab, setTab] = useState('month')

  const now = new Date()
  const myInvoices = (invoices || []).filter(i => String(i.member_id) === String(mid))
  const range = rangeForTab(tab, now)
  const rangeInvoices = myInvoices.filter(i => { const d = new Date(i.date); return d >= range.from && d <= range.to })
  const rangeRevenue = rangeInvoices.reduce((s, i) => s + lineTotal(i), 0)
  const topCustomers = topCustomersForRange(myInvoices, range, customers)
  const tabLabel = TABS.find(([k]) => k === tab)[1]
  const allWonLeads = (myLeads || []).filter(d => d.lead_stage === 'final_approved')
  const trend = last12MonthsTrend(myInvoices, allWonLeads, now)

  // Pipeline stats scoped to the active Today/Month/Year tab — a visit "counts" for a period based
  // on its own visit_date, a lead's current stage "counts" based on when that stage was last set
  // (stage_updated_at, stamped by db.updateDistributorLeadStage) — so switching tabs actually moves
  // these numbers instead of always showing an all-time snapshot.
  const rangeVisitedIds = new Set((myVisits || []).filter(v => { const d = new Date(v.visit_date); return d >= range.from && d <= range.to }).map(v => v.distributor_id))
  const visitedLeadCount = rangeVisitedIds.size
  const rangeLeads = (myLeads || []).filter(d => {
    if (!d.stage_updated_at) return false
    const d2 = new Date(d.stage_updated_at)
    return d2 >= range.from && d2 <= range.to
  })
  const stageCounts = { interested: 0, not_interested: 0, final: 0, distributor: 0 }
  rangeLeads.forEach(d => {
    if (d.lead_stage === 'interested') stageCounts.interested++
    else if (d.lead_stage === 'not_interested') stageCounts.not_interested++
    else if (d.lead_stage === 'final_approved') stageCounts.distributor++
    else if (IN_PROGRESS_STAGES.includes(d.lead_stage)) stageCounts.final++
  })
  const openLeads = rangeLeads.filter(d => d.lead_stage === 'interested' || IN_PROGRESS_STAGES.includes(d.lead_stage))

  const winRate = visitedLeadCount > 0 ? Math.round((stageCounts.distributor / visitedLeadCount) * 100) : 0
  const openLeadCount = openLeads.length
  const avgOpenAgeDays = openLeadCount > 0
    ? Math.round((openLeads.reduce((s, d) => s + (now.getTime() - new Date(d.stage_updated_at).getTime()), 0) / openLeadCount) / 86400000)
    : 0

  const pipelineRows = [
    { name: 'Interested', value: stageCounts.interested, color: '#0ea5e9' },
    { name: 'Not Interested', value: stageCounts.not_interested, color: '#ef4444' },
    { name: 'Final (In Progress)', value: stageCounts.final, color: '#f59e0b' },
    { name: 'Distributor Created', value: stageCounts.distributor, color: '#10b981' },
  ]

  // Goal Progress's Distributors meter must show the exact same "Distributor Created" count as the
  // pipeline above — but goals are always calendar-month (unlike the pipeline's Today/Month/Year
  // tab), so this is computed directly from myLeads scoped to the CURRENT calendar month, always,
  // regardless of which tab is active. Using myAgg.acq.achieved here would silently diverge from
  // the pipeline's number whenever the active tab isn't 'month' (e.g. viewing "This Year" would show
  // more distributors there than a fixed-monthly meter below it, on the same screen).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const distributorsThisMonth = allWonLeads.filter(d => {
    if (!d.stage_updated_at) return false
    const d2 = new Date(d.stage_updated_at)
    return d2 >= monthStart && d2 <= monthEnd
  }).length

  const myHasMeters = myAgg.value.goal > 0 || myAgg.visits.goal > 0 || myAgg.acq.goal > 0 ||
    myAgg.new_outlets.goal > 0 || myAgg.productive_outlets.goal > 0 || myAgg.secondary_orders.goal > 0 || myAgg.secondary_value.goal > 0

  // Distributor Secondary raw activity, tab-scoped (Today/Month/Year) — separate from the always-
  // monthly Goal Progress gauges below, same duality every other tab-scoped panel in this app uses.
  const newOutletsCount = (myOutlets || []).filter(o => { const d = new Date(o.created_at); return d >= range.from && d <= range.to }).length
  const myOrderVisits = (myRetailVisits || []).filter(v => v.outcome === 'order' && (() => { const d = new Date(v.visit_date); return d >= range.from && d <= range.to })())
  const productiveOutletsCount = new Set(myOrderVisits.map(v => v.outlet_id)).size
  const totalOrdersCount = myOrderVisits.length
  const secondaryValueSum = (mySecondaryOrders || [])
    .filter(o => { const d = new Date(o.order_date); return d >= range.from && d <= range.to })
    .reduce((s, o) => s + (o.items || []).reduce((s2, it) => s2 + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0), 0)

  return (
    <div style={{ background: '#f8fafc', borderRadius: 16, padding: 16, marginBottom: 20, border: '1px solid #eef2f7' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: tab === key ? '#2563eb' : '#fff', color: tab === key ? '#fff' : '#374151', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: tab === key ? 'none' : '0 1px 2px rgba(0,0,0,0.08)' }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <StatTile label={`Total Sales — ${tabLabel}`} value={Fk(rangeRevenue)} bg="#7c3aed" />
        <StatTile label="Won" value={stageCounts.distributor} bg="#2563eb" />
        <StatTile label="Win Rate" value={`${winRate}%`} bg="#0ea5e9" />
        <StatTile label="Open Leads" value={openLeadCount} bg="#0d9488" />
        <StatTile label="Avg Open Lead Age" value={`${avgOpenAgeDays}d`} bg="#0d9488" />
      </div>

      <div style={labelStyle}>Distributor Secondary — {tabLabel}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <StatTile label="New Outlets" value={newOutletsCount} bg="#0ea5e9" />
        <StatTile label="Productive Outlets" value={productiveOutletsCount} bg="#10b981" />
        <StatTile label="Total No. of Orders" value={totalOrdersCount} bg="#f59e0b" />
        <StatTile label="Value" value={Fk(secondaryValueSum)} bg="#7c3aed" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ ...cardBase, flex: '1 1 320px' }}>
          <div style={labelStyle}>My Pipeline <span style={{ textTransform: 'none', fontWeight: 400 }}>({visitedLeadCount} total visited)</span></div>
          <ContributionDonut rows={pipelineRows} emptyLabel="No visits recorded yet" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, justifyContent: 'center' }}>
            {pipelineRows.map(r => (
              <div key={r.name} onClick={() => onSelectStage(r.name === 'Distributor Created' ? 'distributor' : r.name === 'Final (In Progress)' ? 'final' : r.name === 'Not Interested' ? 'not_interested' : 'interested')} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: '#374151' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color, display: 'inline-block' }} />
                {r.name}: {r.value}
              </div>
            ))}
          </div>
        </div>

        <RankedList title={`My Top Distributors — ${tabLabel}`} rows={topCustomers} formatValue={F} valueColor="#7c3aed" totalValue={rangeRevenue} />

        <div style={{ ...cardBase, flex: '1 1 100%' }}>
          <div style={labelStyle}>Won Deals & Revenue — Last 12 Months</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={Fk} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v, name) => name === 'Revenue' ? F(v) : v} contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="won" name="Won Deals" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...cardBase, flex: '1 1 100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={labelStyle}>Goal Progress <span style={{ textTransform: 'none', fontWeight: 400 }}>({formatPeriodLabel(currentPeriod)})</span></div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['today', 'Today'], ['monthly', 'Monthly']].map(([key, label]) => (
                <button key={key} onClick={() => setPeriodTab(key)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: periodTab === key ? '#2563eb' : '#f3f4f6', color: periodTab === key ? '#fff' : '#374151', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
          </div>
          {!myHasMeters && <div style={{ fontSize: 12, color: '#9ca3af', padding: '16px 0' }}>No approved goals yet for {formatPeriodLabel(currentPeriod)}</div>}
          {myHasMeters && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around' }}>
              {myAgg.value.goal > 0 && <MeterGauge label="Sales Value" value={myAgg.value.achieved} goal={myAgg.value.goal} formatValue={F} />}
              {myAgg.visits.goal > 0 && <MeterGauge label="New Customer Visits" value={myAgg.visits.achieved} goal={myAgg.visits.goal} />}
              {myAgg.acq.goal > 0 && <MeterGauge label="Distributors" value={distributorsThisMonth} goal={myAgg.acq.goal} />}
              {myAgg.new_outlets.goal > 0 && <MeterGauge label="New Outlets" value={myAgg.new_outlets.achieved} goal={myAgg.new_outlets.goal} />}
              {myAgg.productive_outlets.goal > 0 && <MeterGauge label="Productive Outlets" value={myAgg.productive_outlets.achieved} goal={myAgg.productive_outlets.goal} />}
              {myAgg.secondary_orders.goal > 0 && <MeterGauge label="Total No. of Orders" value={myAgg.secondary_orders.achieved} goal={myAgg.secondary_orders.goal} />}
              {myAgg.secondary_value.goal > 0 && <MeterGauge label="Secondary Value" value={myAgg.secondary_value.achieved} goal={myAgg.secondary_value.goal} formatValue={F} />}
            </div>
          )}
        </div>

        {myAgg.products.length > 0 && (
          <div style={{ ...cardBase, flex: '1 1 100%' }}>
            <div style={labelStyle}>Products — {formatPeriodLabel(currentPeriod)}</div>
            <GoalVsAchievedBreakdown rows={myAgg.products} />
          </div>
        )}
        {myAgg.categories.length > 0 && (
          <div style={{ ...cardBase, flex: '1 1 100%' }}>
            <div style={labelStyle}>Categories — {formatPeriodLabel(currentPeriod)}</div>
            <GoalVsAchievedBreakdown rows={myAgg.categories} />
          </div>
        )}
        {myAgg.customers.length > 0 && (
          <div style={{ ...cardBase, flex: '1 1 100%' }}>
            <div style={labelStyle}>Distributors — {formatPeriodLabel(currentPeriod)}</div>
            <GoalVsAchievedBreakdown rows={myAgg.customers} formatValue={F} />
          </div>
        )}
      </div>
    </div>
  )
}
