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
