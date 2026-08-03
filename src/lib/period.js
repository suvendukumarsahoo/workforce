/**
 * lib/period.js
 * Pure helpers for monthly goal periods (e.g. "2026-11"). No DB calls.
 * Local calendar date, NOT toISOString() — same IST-boundary lesson already learned once in
 * db.js's todayStr() (UTC+5:30 means a naive toISOString() split can land on the wrong month
 * near midnight).
 */

const pad2 = n => String(n).padStart(2, '0')

export function getCurrentPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

export function formatPeriodLabel(period) {
  if (!period) return '—'
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// {from, to} ISO date bounds (inclusive) covering the whole calendar month of `period`.
export function monthRangeForPeriod(period) {
  const [y, m] = period.split('-').map(Number)
  const from = `${y}-${pad2(m)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${pad2(m)}-${pad2(lastDay)}`
  return { from, to }
}

// Fraction of `period`'s month that has elapsed as of today (1 if the period is a past month).
// Used directly as an aggregation "weight" for the Today tab — reusing the same goal*weight
// proration path as multi-month Custom ranges (see goalAggregation.js).
export function monthElapsedRatio(period) {
  const [y, m] = period.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m
  const elapsedDays = isCurrentMonth ? today.getDate() : daysInMonth
  return elapsedDays / daysInMonth
}

// Prorated slice of a monthly target for "today" pace-checking: target * elapsed-days/days-in-month.
export function proratedTarget(monthlyTarget, period) {
  return (Number(monthlyTarget) || 0) * monthElapsedRatio(period)
}

// A custom [fromDate, toDate] range (ISO 'YYYY-MM-DD') may span multiple calendar months.
// Returns [{period, weight}] where weight = fraction of days in the range that fall in that
// period's month — used to prorate goal comparison across overlapping months.
export function resolvePeriodsInRange(fromDate, toDate) {
  const from = new Date(fromDate)
  const to = new Date(toDate)
  if (isNaN(from) || isNaN(to) || from > to) return []
  const totalDays = Math.round((to - from) / 86400000) + 1

  const periods = []
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  while (cursor <= to) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const overlapStart = monthStart > from ? monthStart : from
    const overlapEnd = monthEnd < to ? monthEnd : to
    const overlapDays = Math.round((overlapEnd - overlapStart) / 86400000) + 1
    const period = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`
    periods.push({ period, weight: overlapDays / totalDays })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return periods
}

// {from, to} JS Date bounds for the Today/This Month/This Year snapshot tabs used by
// SalesSnapshot.jsx, TeamSnapshot.jsx, and Dashboard.jsx's New Customer Visits funnel — kept here
// (rather than duplicated per-component) so all three panels resolve "This Month" etc. identically.
export function rangeForTab(tab, now) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  if (tab === 'today') return { from: new Date(y, m, d), to: new Date(y, m, d, 23, 59, 59) }
  if (tab === 'year') return { from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59) }
  return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59) }
}

// Last n periods (most recent first), for a period-picker dropdown.
export function listRecentPeriods(n = 12) {
  const out = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}
