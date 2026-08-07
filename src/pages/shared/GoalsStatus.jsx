import { useState } from 'react'
import { useData } from '../../hooks/useData.jsx'
import { useAuth } from '../../hooks/useAuth.jsx'
import { Av } from '../../components/ui.jsx'
import { aggregateForMembers } from '../../lib/goalAggregation.js'
import { MeterGauge, ContributionDonut, NeedleGauge } from '../../components/charts/GoalBarChart.jsx'
import { colorForEntity } from '../../lib/categoryColors.js'
import { formatPeriodLabel, monthRangeForPeriod } from '../../lib/period.js'
import MemberGoalDetail from '../../components/MemberGoalDetail.jsx'

/**
 * Goals Status — replaces the old flat "Targets" list. Built from a Plecto Sales-Manager-Dashboard
 * reference (dark cards: gauge, rep leaderboard w/ avatars+medals, a donut, an employee table, a
 * team bar chart) mapped onto this app's actual Monthly Goals data. Three reference tiles had no
 * WorkForce equivalent (Inbound/Outbound Revenue %, Revenue from Upgrade, Forecasted New Revenue —
 * no lead-source/upgrade/forecasting concept exists anywhere) and were dropped rather than faked,
 * same call as when TeamSnapshot.jsx was built from its own reference image. Substituted instead:
 * Distributors Created + Outlet Visits stat pair, a Visits-by-Rep donut (in place of "Upcoming
 * Demos"), and a Category breakdown — small multiples of NeedleGauge (a semicircular
 * needle-over-arc "fuel gauge," see GoalBarChart.jsx), one per category, each in its own fixed
 * identity color via categoryColors.js's colorForEntity (in place of "Deals by Team" — a
 * per-manager team bar chart would duplicate SalesSnapshot's own Manager Leaderboard). Went
 * through two earlier forms first: a GoalVsAchievedBreakdown bar list, then a same-color
 * MeterGauge small-multiple — both replaced per explicit user feedback wanting a needle-pointer
 * gauge with a distinct color per category, closer to the Plecto reference's own gauge style.
 *
 * Always "this month," no tab control — goals are inherently monthly in this app (Set Parameters/
 * Goal Approvals/achievement tracking all operate per calendar month), same reasoning SalesSnapshot's
 * Manager Leaderboard already uses to stay month-scoped regardless of its own Today/Month/Year tabs.
 *
 * Manager (role r2) sees only their own team (members.manager_id === their users.id) — new scoping,
 * didn't exist anywhere before this. Admin (or anyone else with this menu enabled) sees the full org,
 * matching how Dashboard.jsx/SalesSnapshot already work unscoped today.
 *
 * Menu id stays 'targets' (CLAUDE.md's menu convention — id stable, label free to rename) so no
 * Settings re-check is needed for roles that already had "Targets" enabled.
 */

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const Fk = n => {
  const v = Number(n) || 0
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L'
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'K'
  return '₹' + Math.round(v)
}

const panelBase = { background: '#1e293b', borderRadius: 12, padding: 14, minWidth: 220 }
const labelStyle = { fontSize: 11, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }
const thStyle = { padding: '8px 10px', fontSize: 10, color: '#64748b', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }
const tdStyle = { padding: '9px 10px', fontSize: 12, color: '#e2e8f0', verticalAlign: 'middle' }

const MEDALS = ['🥇', '🥈', '🥉']

export default function GoalsStatus() {
  const { members, goals, params, achievements, products, categories, distributors: customers, retailVisits, currentPeriod } = useData()
  const { currentUser, role } = useAuth()
  const [drill, setDrill] = useState(null)

  const isManager = role?.id === 'r2'
  const scopeMembers = isManager
    ? (members || []).filter(m => String(m.manager_id || '') === String(currentUser?.id || ''))
    : (members || [])
  const scopeLabel = isManager ? 'My Team' : 'Organization'

  const slices = [{ goalsMap: goals, paramsMap: params, achievementsMap: achievements, weight: 1 }]

  const scopeAgg = aggregateForMembers(scopeMembers.map(m => m.id), slices, products, categories, customers)

  // "Retail Visits" — this month's count of retail_visits rows (Distributor Secondary: a rep
  // walking a beat's outlets), NOT the goal-gated/combined `ach.visits` figure (which also folds in
  // distributor_visits/New Customer Visit and only counts once the member's Visits goal field is
  // manager-approved). Counted directly off the raw table so the number always matches "how many
  // outlets were actually visited," same call as the 4 Aug 2026 fix that made the Distributors
  // meter match "Distributor Created" everywhere by reading the raw pipeline event instead of a
  // differently-scoped/gated aggregate.
  const visitRange = monthRangeForPeriod(currentPeriod)
  const retailVisitCountFor = memberIds => (retailVisits || []).filter(v =>
    memberIds.has(String(v.member_id)) && v.visit_date >= visitRange.from && v.visit_date <= visitRange.to
  ).length
  const scopeMemberIdSet = new Set(scopeMembers.map(m => String(m.id)))
  const scopeRetailVisits = retailVisitCountFor(scopeMemberIdSet)

  const perMember = scopeMembers.map(m => ({
    member: m,
    agg: aggregateForMembers([m.id], slices, products, categories, customers),
    retailVisits: retailVisitCountFor(new Set([String(m.id)])),
  }))
  const ranked = [...perMember].sort((a, b) => b.agg.value.achieved - a.agg.value.achieved)
  const top3 = ranked.filter(r => r.agg.value.achieved > 0).slice(0, 3)
  const donutRows = perMember
    .filter(r => r.retailVisits > 0)
    .map(r => ({ name: r.member.name, value: r.retailVisits, color: r.member.color }))

  return (
    <div>
      {drill && (
        <MemberGoalDetail member={drill} slices={slices} products={products} categories={categories} customers={customers} onClose={() => setDrill(null)} />
      )}

      <div style={{ background: '#0f172a', borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Goals Status</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{scopeLabel} · {formatPeriodLabel(currentPeriod)}</div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {/* Hero panel — the single most important number on this page. Emphasis now carries via
              size alone (biggest flex-basis of any panel here) — the earlier gradient/glow
              treatment read as "improper" against the rest of the page's uniform flat panels, so
              it's back on the same panelBase every other panel uses. */}
          <div style={{ ...panelBase, flex: '2 1 320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MeterGauge label="Sales Value" value={scopeAgg.value.achieved} goal={scopeAgg.value.goal} formatValue={F} dark />
          </div>

          <div style={{ ...panelBase, flex: '1.4 1 240px' }}>
            <div style={labelStyle}>Top Performers</div>
            {top3.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No achievement yet</div>}
            {top3.map((r, i) => (
              <div key={r.member.id} onClick={() => setDrill(r.member)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                <span style={{ fontSize: 16, width: 20, flexShrink: 0 }}>{MEDALS[i]}</span>
                <Av av={r.member.avatar} color={r.member.color} sz={26} />
                <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.member.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', flexShrink: 0 }}>{Fk(r.agg.value.achieved)}</span>
              </div>
            ))}
          </div>

          <div style={{ ...panelBase, flex: '1 1 180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MeterGauge label="Distributors Created" value={scopeAgg.acq.achieved} goal={scopeAgg.acq.goal} dark />
          </div>

          <div style={{ ...panelBase, flex: '1 1 180px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={labelStyle}>Retail Visits <span style={{ textTransform: 'none', fontWeight: 400 }}>by rep</span></div>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#60a5fa' }}>{scopeRetailVisits}</span>
            </div>
            <ContributionDonut rows={donutRows} dark />
          </div>
        </div>
      </div>

      <div style={{ background: '#0f172a', borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ ...panelBase }}>
          <div style={labelStyle}>Category Breakdown — Goal vs Achieved</div>
          {scopeAgg.categories.length === 0
            ? <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>No items in scope</div>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                {scopeAgg.categories.map(c => (
                  <div key={c.id} style={{ width: 116 }}>
                    <NeedleGauge
                      label={c.name}
                      value={c.achieved}
                      goal={c.goal}
                      color={colorForEntity(c.id, categories)}
                      formatValue={n => Math.round(n).toLocaleString('en-IN') + (c.unit ? ' ' + c.unit : '')}
                      dark
                    />
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      <div style={{ background: '#0f172a', borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ ...panelBase }}>
          <div style={labelStyle}>Distributor Secondary — Goal vs Achieved (This Month)</div>
          {scopeAgg.new_outlets.goal === 0 && scopeAgg.productive_outlets.goal === 0 && scopeAgg.secondary_orders.goal === 0 && scopeAgg.secondary_value.goal === 0
            ? <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>No approved Distributor Secondary goals for this month yet</div>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around', gap: 8 }}>
                {scopeAgg.new_outlets.goal > 0 && <MeterGauge label="New Outlets" value={scopeAgg.new_outlets.achieved} goal={scopeAgg.new_outlets.goal} dark />}
                {scopeAgg.productive_outlets.goal > 0 && <MeterGauge label="Productive Outlets" value={scopeAgg.productive_outlets.achieved} goal={scopeAgg.productive_outlets.goal} dark />}
                {scopeAgg.secondary_orders.goal > 0 && <MeterGauge label="Total No. of Orders" value={scopeAgg.secondary_orders.achieved} goal={scopeAgg.secondary_orders.goal} dark />}
                {scopeAgg.secondary_value.goal > 0 && <MeterGauge label="Value" value={scopeAgg.secondary_value.achieved} goal={scopeAgg.secondary_value.goal} formatValue={F} dark />}
              </div>
            )}
        </div>
      </div>

      <div style={{ background: '#0f172a', borderRadius: 16, padding: 16 }}>
        <div style={labelStyle}>{scopeLabel} Roster</div>
        {ranked.length === 0 && <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>No members in scope</div>}
        {ranked.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Member</th>
                  <th style={thStyle}>Sales Value</th>
                  <th style={thStyle}>Retail Visits</th>
                  <th style={thStyle}>Distributors</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(r => (
                  <tr
                    key={r.member.id}
                    onClick={() => setDrill(r.member)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #334155' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Av av={r.member.avatar} color={r.member.color} sz={24} />
                        {r.member.name}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: '#38bdf8' }}>{F(r.agg.value.achieved)}</td>
                    <td style={tdStyle}>{r.retailVisits}</td>
                    <td style={tdStyle}>{r.agg.acq.achieved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
