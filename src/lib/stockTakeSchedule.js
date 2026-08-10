/**
 * lib/stockTakeSchedule.js
 * Pure due-date logic for the Distributor Physical Stock Take schedule. No DB calls.
 * Single source of truth shared by PunchInGate.jsx (the hard block) and the team-page schedule
 * card, so the two can never disagree about whether a distributor's stock take is overdue.
 */

import { addDaysStr } from './period.js'

// Fixed day-counts for all three tiers — Monthly is a flat 30 days, not calendar-month-aware
// (matches Weekly=7/Fortnightly=14's own fixed-interval treatment, by explicit choice).
export const FREQUENCY_DAYS = { weekly: 7, fortnightly: 14, monthly: 30 }

export const FREQUENCY_LABELS = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly' }

const daysBetween = (fromStr, toStr) => Math.round((new Date(toStr) - new Date(fromStr)) / 86400000)

// rule: a distributor_stock_take_rules row (or null/undefined if none exists yet for that
// distributor). latestTakeDate: that distributor's most recent distributor_stock_takes.take_date
// ('YYYY-MM-DD'), or null if no take has ever been submitted. today: localDateStr(new Date()).
//
// state: 'inactive' (no approved schedule, or approved but no anchor yet — nothing to show/block)
//      | 'ok' (not yet due)
//      | 'warn' (within 2 days of the deviation deadline — soft, punch-in still proceeds)
//      | 'overdue' (past the deviation deadline — punch-in blocks until a count is submitted)
export function computeDueStatus(rule, latestTakeDate, today) {
  if (!rule || rule.status !== 'approved') return { state: 'inactive' }
  const anchor = latestTakeDate || rule.first_anchor_date
  if (!anchor) return { state: 'inactive' } // approved, but the rep hasn't punched in since — see bootstrapStockTakeAnchors

  const frequencyDays = FREQUENCY_DAYS[rule.frequency]
  const nextDue = addDaysStr(anchor, frequencyDays)
  const deadline = addDaysStr(nextDue, rule.deviation_limit_days)

  if (today >= deadline) return { state: 'overdue', nextDue, deadline, daysOverdue: daysBetween(deadline, today) }
  if (today >= addDaysStr(deadline, -2)) return { state: 'warn', nextDue, deadline }
  return { state: 'ok', nextDue, deadline }
}
