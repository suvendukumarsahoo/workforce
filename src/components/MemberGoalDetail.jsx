import { Sheet } from './ui.jsx'
import { aggregateForMembers } from '../lib/goalAggregation.js'
import { ChartSection, MeterGauge, GoalVsAchievedBreakdown } from './charts/GoalBarChart.jsx'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

/**
 * Full-screen member-level goal-vs-achievement drill-down. Shared by Dashboard.jsx's
 * Org→Manager→Member hierarchy and by Targets.jsx, so there's one implementation instead of the
 * three that used to exist (Dashboard's old MemberDetailSheet, Targets.jsx's own DrillSheet, and
 * TeamApp.jsx's self-view — TeamApp's stays separate since it also renders goal-entry, not just
 * a read-only drill-down).
 *
 * `slices`: array of { goalsMap, paramsMap, achievementsMap, weight } — see goalAggregation.js.
 */
export default function MemberGoalDetail({ member, slices, products, categories, customers, onClose, zIndex }) {
  const agg = aggregateForMembers([member.id], slices, products, categories, customers)
  const hasAny = agg.value.goal > 0 || agg.visits.goal > 0 || agg.acq.goal > 0 ||
    agg.products.length > 0 || agg.categories.length > 0 || agg.customers.length > 0
  const hasMeters = agg.value.goal > 0 || agg.visits.goal > 0 || agg.acq.goal > 0

  return (
    <Sheet title={member.name} sub={member.role || 'Sales Team'} onClose={onClose} zIndex={zIndex}>
      {!hasAny && (
        <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>
          No approved goals for this period yet
        </div>
      )}
      {hasMeters && (
        <ChartSection title="This Period">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around', gap: 8 }}>
            {agg.value.goal > 0 && <MeterGauge label="Sales Value" value={agg.value.achieved} goal={agg.value.goal} formatValue={F} />}
            {agg.visits.goal > 0 && <MeterGauge label="Outlet Visits" value={agg.visits.achieved} goal={agg.visits.goal} />}
            {agg.acq.goal > 0 && <MeterGauge label="Distributors" value={agg.acq.achieved} goal={agg.acq.goal} />}
          </div>
        </ChartSection>
      )}
      {agg.products.length > 0 && (
        <ChartSection title="Products">
          <GoalVsAchievedBreakdown rows={agg.products} />
        </ChartSection>
      )}
      {agg.categories.length > 0 && (
        <ChartSection title="Categories">
          <GoalVsAchievedBreakdown rows={agg.categories} />
        </ChartSection>
      )}
      {agg.customers.length > 0 && (
        <ChartSection title="Customers">
          <GoalVsAchievedBreakdown rows={agg.customers} formatValue={F} />
        </ChartSection>
      )}
    </Sheet>
  )
}
