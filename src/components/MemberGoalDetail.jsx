import { Sheet } from './ui.jsx'
import { aggregateForMembers } from '../lib/goalAggregation.js'
import { ChartSection, MeterGauge, GoalVsAchievedBreakdown } from './charts/GoalBarChart.jsx'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

/**
 * Full-screen member-level goal-vs-achievement drill-down. Shared by Dashboard.jsx's
 * Org→Manager→Member hierarchy and by GoalsStatus.jsx (formerly Targets.jsx), so there's one
 * implementation instead of the three that used to exist (Dashboard's old MemberDetailSheet,
 * Targets.jsx's own DrillSheet, and TeamApp.jsx's self-view — TeamApp's stays separate since it
 * also renders goal-entry, not just a read-only drill-down).
 *
 * `slices`: array of { goalsMap, paramsMap, achievementsMap, weight } — see goalAggregation.js.
 */
export default function MemberGoalDetail({ member, slices, products, categories, customers, onClose, zIndex }) {
  const agg = aggregateForMembers([member.id], slices, products, categories, customers)
  const hasMeters = agg.value.goal > 0 || agg.visits.goal > 0 || agg.acq.goal > 0 ||
    agg.new_outlets.goal > 0 || agg.productive_outlets.goal > 0 || agg.secondary_orders.goal > 0 || agg.secondary_value.goal > 0
  const hasAny = hasMeters ||
    agg.products.length > 0 || agg.categories.length > 0 || agg.customers.length > 0

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
            {agg.visits.goal > 0 && <MeterGauge label="New Customer Visits" value={agg.visits.achieved} goal={agg.visits.goal} />}
            {agg.acq.goal > 0 && <MeterGauge label="Distributors" value={agg.acq.achieved} goal={agg.acq.goal} />}
            {agg.new_outlets.goal > 0 && <MeterGauge label="New Outlets" value={agg.new_outlets.achieved} goal={agg.new_outlets.goal} />}
            {agg.productive_outlets.goal > 0 && <MeterGauge label="Productive Outlets" value={agg.productive_outlets.achieved} goal={agg.productive_outlets.goal} />}
            {agg.secondary_orders.goal > 0 && <MeterGauge label="Total No. of Orders" value={agg.secondary_orders.achieved} goal={agg.secondary_orders.goal} />}
            {agg.secondary_value.goal > 0 && <MeterGauge label="Secondary Value" value={agg.secondary_value.achieved} goal={agg.secondary_value.goal} formatValue={F} />}
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
        <ChartSection title="Distributors">
          <GoalVsAchievedBreakdown rows={agg.customers} formatValue={F} />
        </ChartSection>
      )}
    </Sheet>
  )
}
