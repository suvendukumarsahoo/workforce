# CRUD State Machine Pattern for WorkForce

## Overview
All entities in WorkForce follow a **unified CRUD state machine** for approval workflows. This pattern ensures consistent behavior across goals, expenses, invoices, payroll, and any other approval-based features.

---

## Entity States

Every entity has one of these states:

| State | Can Add | Can Edit | Can Delete | Description |
|-------|---------|----------|------------|-------------|
| `draft` | — | ✅ | ✅ | Created but not submitted for approval |
| `pending` | ❌ | ❌ | ❌ | Submitted for approval, awaiting review |
| `approved` | — | ❌ | ❌ | Approved, locked for edit/delete |
| `rejected` | — | ✅ | ✅ | Approval rejected, returned to editable state |
| `partial` | ❌ | ✅ (rejected fields only) | ❌ | Some fields approved, others rejected or pending |

---

## State Transitions

```
draft ──[submit]──> pending
  ↑                    ↓
  └─[reject]────── rejected
  
pending ──[approve]──> approved
   ↓
rejected (user edits & resubmits)
   ↓
pending ──[approve]──> approved
   ↓
   └─[approve partial]──> partial
                ↓
              approved (if user accepts partial)
              ↓
              rejected (on specific fields)
                ↓
                editable (for those fields only)
```

---

## CRUD Rules by State

### CREATE (Add New Entry)
- Always allowed
- New entry starts in `draft` state
- User can immediately edit before submission

### EDIT
**Allowed in:** `draft`, `rejected`, `partial` (rejected fields only)
**Blocked in:** `pending`, `approved`

**Logic:**
- In `draft` → edit all fields
- In `rejected` → edit only rejected fields; approved fields hidden
- In `partial` → edit only rejected fields; approved fields hidden and locked
- In `pending` → show spinner "Awaiting review" message, disable form
- In `approved` → completely locked, no edit option shown

### DELETE
**Allowed in:** `draft`, `rejected`
**Blocked in:** `pending`, `approved`, `partial`

**Logic:**
- In `draft` → delete allowed with confirmation
- In `rejected` → delete allowed with confirmation
- In `pending` → show "Locked - awaiting approval" message
- In `approved` → completely blocked
- In `partial` → blocked (has approved fields that are locked)

### SUBMIT (Send for Approval)
**Allowed in:** `draft`, `rejected`
**Blocked in:** `pending`, `approved`, `partial`

**Logic:**
- User clicks "Submit for approval"
- State changes to `pending`
- Form locks (all fields become read-only)
- Dashboard shows "Awaiting approval"

---

## Parent-Child Relationship Rules

**Rule:** If an entry has unapproved child entries, it cannot be edited or deleted until those children are resolved.

### Examples:

**Goal (parent) ← Customer/Product/Category goals (children)**
- User cannot EDIT or DELETE a goal with pending child goals
- User must wait for manager to approve/reject children first
- Exception: If child is rejected, user can delete the child entry, then edit/delete parent

**Invoice (parent) ← Invoice lines (children)**
- Cannot EDIT invoice if any line is pending approval
- Cannot DELETE invoice if any line is pending
- Must clear/resolve all lines first

**Payroll entry (parent) ← Deductions, Allowances (children)**
- Cannot EDIT payroll if any component is pending
- Cannot DELETE payroll if any component is pending

### Implementation Pattern:
```javascript
// Check if entry can be edited/deleted
const canModify = (entry) => {
  if (entry.status === 'pending' || entry.status === 'approved') return false
  
  // Check child entries
  const pendingChildren = getChildEntries(entry.id)
    .filter(c => c.status === 'pending' || c.status === 'partial')
  
  if (pendingChildren.length > 0) return false
  
  return true
}
```

---

## Rejection Behavior

**When manager rejects an entry:**

1. **Single rejection** (all fields rejected)
   - Entry state → `rejected`
   - User can EDIT all fields
   - User can DELETE if desired
   - User can RESUBMIT (goes back to `pending`)

2. **Partial rejection** (some fields approved, some rejected)
   - Entry state → `partial`
   - User can EDIT only the rejected fields
   - Approved fields are hidden (not shown in form)
   - User can RESUBMIT (only rejected fields go back to `pending`, approved ones stay `approved`)
   - User cannot DELETE (because some fields are approved/locked)

3. **On resubmit:**
   - Only CHANGED rejected fields go to `pending` for re-review
   - UNCHANGED rejected fields keep their status
   - APPROVED fields remain `approved` and don't need re-review

---

## Data Refresh Pattern

**After any CRUD operation (create, edit, delete, submit, approve, reject):**

```javascript
// Step 1: Save to database
const { error } = await db.updateEntry(id, payload)

// Step 2: Update local state (optimistic update)
setEntries(prev => ({ ...prev, [id]: updated }))

// Step 3: Refresh ALL data from database
await loadAll()

// Step 4: Close dialog/form
onClose()

// Step 5: Show toast
showToast('Saved successfully')
```

**Key:** `loadAll()` MUST complete before closing the UI, so the dashboard and other pages see fresh data.

---

## Form State Management

### For Components with Forms:

**Rule:** Component functions must be defined **outside** the parent render scope, or wrapped in `useMemo` to prevent recreation on state changes.

**Bad (causes focus loss):**
```javascript
function ReviewSheet() {
  const [notes, setNotes] = useState({})
  
  const FieldRow = () => {
    return <textarea onChange={...} />  // Re-created on every render!
  }
  
  return <FieldRow />
}
```

**Good (stable across renders):**
```javascript
function FieldRow({ notes, setNotes }) {
  return <textarea onChange={e => setNotes(x => ({ ...x, [key]: e.target.value }))} />
}

function ReviewSheet() {
  const [notes, setNotes] = useState({})
  return <FieldRow notes={notes} setNotes={setNotes} />
}
```

---

## Implementation Checklist for New CRUD Feature

Before marking a feature complete:

- [ ] All states (`draft`, `pending`, `approved`, `rejected`, `partial`) are handled
- [ ] Edit/Delete buttons shown/hidden based on current state
- [ ] Form is disabled (read-only) in `pending` and `approved` states
- [ ] Rejected fields are editable and highlighted in `rejected` and `partial` states
- [ ] After submit/approve/reject, `loadAll()` is called and awaited before closing dialog
- [ ] Parent-child rules enforced (can't modify parent if children pending)
- [ ] Component functions defined outside render scope (no focus loss on typing)
- [ ] Toast shows after data refresh completes
- [ ] Dashboard updates immediately (no refresh needed)
- [ ] All state transitions tested manually

---

## Quick Reference: Which Operations Call `loadAll()`?

| Operation | Called By | Must Await `loadAll()` |
|-----------|-----------|------------------------|
| User submits entry | Team member | ✅ Yes, before closing form |
| User edits entry | Team member | ❌ No (stays in `draft`) |
| User deletes entry | Team member | ✅ Yes, before closing |
| Manager approves | Manager | ✅ Yes, before closing |
| Manager rejects | Manager | ✅ Yes, before closing |
| Team member resubmits | Team member | ✅ Yes, before closing |

---

## Example: Goals CRUD (Implemented Today)

**States:** `draft` → `pending` → `approved` OR `rejected` → (edit/resubmit cycle)

**Edit Rules:**
- `draft`: Edit all fields ✅
- `pending`: Locked 🔒
- `approved`: Locked 🔒
- `rejected`: Edit all fields ✅
- `partial`: Edit rejected fields only ✅

**Delete Rules:**
- `draft`: Delete allowed ✅
- `pending`: Blocked 🔒
- `approved`: Blocked 🔒
- `rejected`: Delete allowed ✅
- `partial`: Blocked 🔒

**Parent-Child:** None (goals don't have children entries)

---

## Example: Future - Invoices CRUD (Template)

**States:** `draft` → `pending_lines` (waiting for lines) → `pending_approval` → `approved`

**Edit Rules:**
- `draft`: Edit invoice and add/remove lines ✅
- `pending_lines`: Can't add/remove lines once submitted ❌
- `pending_approval`: Locked for review ❌
- `approved`: Locked ❌

**Delete Rules:**
- `draft`: Delete invoice (deletes all lines) ✅
- `pending_lines`: Blocked ❌
- `pending_approval`: Blocked ❌
- `approved`: Blocked ❌

**Parent-Child:** Invoice (parent) ← Invoice lines (children)
- Can't delete invoice if any line is `pending`
- Can't edit invoice if any line is `pending`

