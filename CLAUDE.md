# WorkForce — Project Context for Claude Code

## What this is
WorkForce is a workforce management SaaS platform for sales organizations,
currently targeting 1–2 early commercial customers. Built and maintained
by a single developer (fast iteration, cost-conscious, no over-engineering).

- **Live app:** https://workforce-zeta-one.vercel.app
- **Repo:** https://github.com/suvendukumarsahoo/workforce
- **Local dev machine:** Windows, Node v24.13.0, project at `C:\Users\workforce`
- **Hosting:** Vercel (current). Netlify identified as preferred free
  alternative for private repos at commercial scale — revisit if/when
  Vercel's free tier stops fitting.

## Tech stack
- Frontend: React + Vite
- Backend/DB: Supabase (~15 tables)
- Deployment: Vercel
- PWA support via `manifest.json`

## Critical architecture rule — DO NOT BREAK
**All Supabase calls must go through `src/lib/db.js` and `src/lib/supabase.js`
only.** No component or page should import the Supabase client directly.
This is intentional: it lets a future migration to AWS happen by replacing
just those two files. Any new feature that needs data access should add a
function to `db.js`, not call Supabase inline elsewhere.

## Roles (role-based access control)
Five roles, each with distinct permissions across the app:
1. **Admin** — full access, enters invoices, manages users/roles
2. **Manager** — sets goal parameters, approves/rejects team goals and fields
3. **Accounts** — enters invoices (alongside Admin), manages expense/payroll data
4. **HR** — attendance and payroll oversight
5. **Sales Team** — sets their own goal values, logs activity, views their
   own targets/achievement (read-only on achievement)

## Core business logic — DO NOT reinterpret without asking
- **Goal setting:** Manager sets goal parameters → team member fills in
  their own proposed values → goal is submitted and **locked** (no further
  edits by the team member after submission).
- **Approval:** Manager reviews the locked goal and can approve or reject
  **individual fields**, each with a note explaining the decision.
- **Achievement tracking:** Achievement is computed **solely from invoices**
  entered by Admin/Accounts. Team members can never manually enter or edit
  their own achievement numbers — this is a hard rule, not a preference.
- **Expenses:** Separate workflow from goals/achievement; team members
  submit, relevant role approves.
- **Attendance & payroll:** Tracked features feeding into HR/Accounts views.

## Current status
Just completed a major foundational build sprint covering: target setting,
goal approval flow, invoice-driven achievement, expense management,
attendance, payroll, and RBAC across all five roles. The app is in the
"test, then add features incrementally" phase — no need to re-architect
core flows; extend them.

## Working style / preferences
- Prefer fast iteration and incremental features over big refactors or
  speculative abstraction.
- Cost-conscious on infra — flag any suggestion that adds recurring cost.
- Don't re-explain the whole system on every task — this file is the
  standing context. Read it, then focus only on the specific feature/bug
  at hand.
- When touching data access, always go through `db.js` / `supabase.js`
  per the architecture rule above — never bypass it "just this once."

## Open items / things to confirm before assuming
- Exact current list of Supabase tables (~15) — check schema directly
  rather than assuming table names.
- Whether Netlify migration is scheduled or still just a "someday" option.
