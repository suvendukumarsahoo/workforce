import test from 'node:test'
import assert from 'node:assert/strict'
import { getGoalOverallStatus } from './achievementEngine.js'

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
