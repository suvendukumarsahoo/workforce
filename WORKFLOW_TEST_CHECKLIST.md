# Workflow Test Checklist

## Purpose
Before marking any **approval workflow** feature complete, run through these test scenarios. This prevents common bugs like unawaited async operations, focus loss in forms, and stale dashboard data.

---

## Goal Approval Workflow

### Setup
- [ ] Log in as Manager
- [ ] Verify there's a team member with goals in 'pending' status on Goal Approvals page

### Manager: Review and Approve/Reject Goals
- [ ] Click "Review goals" for a team member
- [ ] For each goal field:
  - [ ] Click "✓ Approve" button — verify it highlights in green
  - [ ] Click "✗ Reject" button — verify it highlights in red
  - [ ] When rejected, textarea appears for rejection reason
  - [ ] **Type rejection note continuously** (e.g., "This target is too low please revise") — verify each character appears without losing focus or requiring extra clicks
  - [ ] Click "Clear" button — verify decision is removed and textarea disappears
- [ ] After marking at least one decision, "Save decisions" button is enabled
- [ ] Click "Save decisions" — verify:
  - [ ] Dialog closes (after data loads — should NOT close immediately)
  - [ ] Toast says "Review saved — member notified"
  - [ ] List of pending goals updates (member should no longer appear if all fields approved, or should still appear if any rejected)
- [ ] **Refresh page** — verify manager still sees correct pending count

### Dashboard: After Manager Approves
- [ ] Navigate to Dashboard (as Manager or Admin)
- [ ] Verify:
  - [ ] "Goals pending" count decreased (or is now 0 if all approved)
  - [ ] Team member showing "Approved" badge if all fields approved
  - [ ] Team member showing "Partially approved" badge if mix of approved/rejected

### Dashboard: After Manager Rejects
- [ ] Navigate to Dashboard (as Manager or Admin)
- [ ] Verify:
  - [ ] "Goals pending" count is now 1 (member needs to revise)
  - [ ] Team member showing "Rejected" or "Partially approved" badge

---

## Team Member: Revision Workflow

### Setup
- [ ] Log in as Team Member
- [ ] Verify their goals show at least one "Rejected" field with red background and manager's rejection note

### Team Member: View Rejected Goals
- [ ] Navigate to My Goals tab
- [ ] Verify:
  - [ ] Overall goal status shows as "Rejected" or "Partial" (banner visible at top)
  - [ ] Rejected fields show with red background and manager's note
  - [ ] Approved fields are NOT shown (only rejected ones need revision)
  - [ ] "Revise & resubmit" or "Revise" button is visible

### Team Member: Edit and Resubmit
- [ ] Click "Revise" button
- [ ] Goal entry sheet opens showing:
  - [ ] Only rejected fields are editable (have input boxes)
  - [ ] Approved fields are hidden (not shown at all)
  - [ ] Each field shows the manager's rejection note
- [ ] Edit a rejected field value
- [ ] Click "Submit for approval"
- [ ] Verify:
  - [ ] Dialog closes after data loads (should NOT close immediately)
  - [ ] Toast says "Goals submitted for manager approval"
  - [ ] Overall goal status changes to "Pending review" or "Pending"
  - [ ] Edited field shows "Pending review" status
  - [ ] Unchanged approved fields still show "Approved" status

### Dashboard: After Team Member Resubmits
- [ ] Navigate to Dashboard (as Team Member)
- [ ] Verify:
  - [ ] Approved target still shows the original approved value
  - [ ] Overall goal shows "Partially approved" or "Pending review"
  - [ ] Achievement calculations only use approved fields

---

## Expense Approval Workflow

### Setup
- [ ] Log in as Team Member
- [ ] Expense Approvals page shows pending expenses

### Team Member: Submit Expense
- [ ] Navigate to My Expenses tab
- [ ] Click "+ New expense claim"
- [ ] Fill in Category, Description, Amount
- [ ] Click "Submit"
- [ ] Verify:
  - [ ] Form closes after data loads (should NOT close immediately)
  - [ ] Toast says "Expense submitted for approval"
  - [ ] Expense appears in list with "Pending" status
  - [ ] Dashboard "Expenses pending" counter increases

### Manager/Accounts: Approve/Reject Expense
- [ ] Navigate to Expense Approvals
- [ ] For each expense:
  - [ ] Click "✓ Approve" or "✗ Reject"
  - [ ] Verify status changes to "Approved" or "Rejected"
  - [ ] Toast confirms action
  - [ ] Dashboard "Expenses pending" counter decreases
  - [ ] **After a few actions:** Refresh page — verify changes persisted

---

## General Data Refresh Rules

For ANY approval workflow feature:
- [ ] After user clicks submit/save button on a dialog, `loadAll()` is called before dialog closes
- [ ] After `loadAll()` completes, all related data on other pages updates automatically
- [ ] Dashboard tiles and counts reflect the latest state without requiring page refresh
- [ ] Toast message appears AFTER data is loaded, not before

### Testing checklist for async operations:
- [ ] Form has `async` handler
- [ ] Submit button uses `await` (e.g., `onClick={async () => { await submitGoal(...) }}`)
- [ ] After submit/save, `loadAll()` is called and awaited
- [ ] UI only closes/resets after `loadAll()` completes
- [ ] No "race conditions" where UI closes before data loads

---

## Edge Cases to Test

- [ ] Reject all fields, verify overall status is "Rejected" (not "Pending")
- [ ] Approve some fields, reject others, verify status is "Partial" (not "Pending")
- [ ] Team member submits revised goals with same value as before, verify status stays "Approved" for that field
- [ ] Manager refreshes page during approval review, verify changes are still there
- [ ] Team member refreshes after resubmitting, verify new status appears
- [ ] Multiple rejections on same field, then approve later, verify note history is preserved (if applicable)

---

## Sign-off

Before marking a workflow complete:
- [ ] Ran through all sections above without finding bugs
- [ ] Tested on actual Supabase data (not mocked)
- [ ] Tested with multiple team members and managers
- [ ] No toast/loading state confusion
- [ ] Data is always consistent across all pages

