import test from 'node:test'
import assert from 'node:assert/strict'
import { getGoalOverallStatus, computeAchievements } from './achievementEngine.js'

test('treats a rejected value goal as editable and rejected', () => {
  const goal = {
    value_goal: 120000,
    value_status: 'rejected',
    value_note: 'Needs revision',
  }

  assert.equal(getGoalOverallStatus(goal), 'rejected')
})

test('treats mixed approved and rejected fields as partial', () => {
  const goal = {
    value_goal: 120000,
    value_status: 'approved',
    customers: {
      c1: { goal: 50000, status: 'rejected', note: 'Revise this' },
    },
  }

  assert.equal(getGoalOverallStatus(goal), 'partial')
})

test('treats a rejected field mixed with still-pending fields as partial, not pending', () => {
  // Regression test: a manager reviewing goals field-by-field commonly rejects one field before
  // getting to the rest, leaving them 'pending' rather than 'approved'. The overall status must
  // still surface as 'partial' (so the member sees a revise prompt) — it must not fall through to
  // 'pending' just because nothing has been approved yet.
  const goal = {
    value_goal: 120000,
    value_status: 'pending',
    customers: {
      c1: { goal: 50000, status: 'rejected', note: 'Revise this' },
      c2: { goal: 30000, status: 'pending' },
    },
  }

  assert.equal(getGoalOverallStatus(goal), 'partial')
})

test('a pending_approval invoice does not count toward achievements', () => {
  // Regression test: CLAUDE.md documented this status guard as already applied, but it had never
  // actually landed in computeAchievements — a not-yet-approved invoice was silently counting
  // (e.g. inflating the Distributor Presence Map's "billed" status, and every achievement number
  // that reads from computeAchievements). See DistributorPresenceMap.jsx / AwaitingInvoiceTile.jsx.
  const goals = {
    m1: { value_goal: 100000, value_status: 'approved' },
  }
  const invoices = [
    { member_id: 'm1', distributor_id: 'd1', status: 'pending_approval', date: '2026-08-01', lines: [{ product_id: 'p1', qty: 10, rate: 100 }] },
    { member_id: 'm1', distributor_id: 'd1', status: 'approved', date: '2026-08-02', lines: [{ product_id: 'p1', qty: 5, rate: 100 }] },
    { member_id: 'm1', distributor_id: 'd1', date: '2026-08-03', lines: [{ product_id: 'p1', qty: 2, rate: 100 }] }, // no status = legacy, treated as approved
  ]

  const result = computeAchievements(invoices, goals)
  assert.equal(result.m1.value, 700) // only the approved (500) + status-less (200) invoices count, not the pending one (1000)
})
