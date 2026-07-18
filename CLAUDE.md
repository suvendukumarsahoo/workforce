## Session Update — 16 July 2026

### Fixed
- **Dashboard tap-to-detail (src/pages/shared/Dashboard.jsx):** Team member rows in "Team — goal status" 
  had no onClick handler, so tapping did nothing. Added a `selectedMember` state + `MemberDetailSheet` 
  component (using existing `Sheet` UI, same pattern as `GoalEntrySheet` in TeamApp.jsx). Shows goal 
  breakdown, attendance, and expenses per member. Confirmed working.

- **Product/category/customer achievement not updating (src/lib/achievementEngine.js):** Key naming 
  mismatch — `computeAchievements` was writing to `ach.products`, `ach.categories`, `ach.customers`, 
  but all consumers (TeamApp.jsx, Dashboard.jsx) read `a.prods`, `a.cats`, `a.custs`. Renamed engine 
  output keys to `prods`/`cats`/`custs` to match. Confirmed working — product-wise achievement now 
  displays correctly in member detail sheet.

### Convention note
- Achievement objects use abbreviated keys: `value`, `prods`, `cats`, `custs` (NOT `products`/`categories`/`customers`).
- Goal objects use full keys: `value_goal`, `products`, `categories`, `customers` (per-field status objects).
- Don't confuse the two shapes when writing new code that touches both.

### Planned, not started — Distributor feature (major, multi-phase)
Requested: rename Customer → Distributor (full DB migration), add manager↔team-member mapping (HR), 
and a new lead-to-distributor pipeline:
1. New "New Customer Visit" menu — capture lead, log visits, interested/not-interested, follow-up 
   scheduling + location capture, in-app reminder list (no backend cron — reminders shown on app load).
2. "Final" stage → notifies manager for approval.
3. Manager approval → auto-sends Registration Form to team member (save/edit/submit).
4. Registration Form → Manager approve/reject (with revise loop, like existing goal approval pattern) 
   → then Admin approve/reject.
5. Admin approval → 48-hour payment window opens (UTR No, date, bank, amount, remarks) → Admin verifies 
   & "Acknowledges" → notifications to Manager + team member ("Distributor Created") → customer status 
   auto-updates to Distributor, mapped to team member.

Blocked on: user to share `CRUD_STATE_MACHINE_PATTERN.md` and `seed.sql` before Phase 1 (schema) begins, 
so new tables/workflow follow existing approval-flow conventions rather than a new pattern.

Notification system: building from scratch (nothing exists yet).
## Session Update — 16 July 2026 (Part 2)

### Phase 1 — Customer → Distributor rename: COMPLETE & VERIFIED WORKING
- DB migration run: `customers`→`distributors`, `customer_assignments`→`distributor_assignments` 
  (column `customer_id`→`distributor_id`), `invoices.customer_id`→`distributor_id`, added 
  `members.manager_id` (self-FK, for HR team mapping), added `notifications` table (RLS disabled, 
  matching other tables — flagged for later: enable RLS across all tables before going live commercially).
- `db.js`: old CUSTOMERS functions replaced with `fetchDistributors/createDistributor/updateDistributor/deleteDistributor`, 
  using `distributors` / `distributor_assignments` / `distributor_id`.
- `useData.jsx`: `customers`/`setCustomers` state renamed to `distributors`/`setDistributors`. 
  NOTE: this file's `useAuth` import must be `from './useAuth'` (same folder), NOT `'../../hooks/useAuth'` 
  — got this wrong once, caused a full app crash.
- All consuming files updated to destructure `distributors: customers` from `useData()` (keeps local 
  variable name `customers` everywhere else in each file untouched — only the context key changed): 
  `Dashboard.jsx`, `TeamApp.jsx`, `Parameters.jsx`, `Invoices.jsx`, `GoalApprovals.jsx`. 
  `Targets.jsx` does NOT use customers at all — leave its useData() destructure as original.
- `Customers.jsx` renamed to `Distributors.jsx`, full rewrite (function name, db calls, labels, default 
  type `'New Customer'` instead of `'Retailer'`).
- `WebApp.jsx` and `Settings.jsx`: menu **id** deliberately kept as `'customers'` (internal permission key, 
  referenced by `hasMenu('customers')` and stored in `roles.menus` in DB) — only the **label** changed to 
  "Distributors". Do NOT rename the id without also migrating `roles.menus` data.
- `type` field semantics: no longer `'Retailer'`/`'Distributor'` — new leads start as `'New Customer'`, 
  flip to `'Distributor'` when the full approval+payment flow (not yet built) completes. No DB CHECK 
  constraint on this column, so free text values are fine.
- Future, NOT yet built: separate "New Retailer" menu under Distributor Functions with Primary Order 
  Page, Closing Stock Entry, Add Beats, Add Retailer — detailed flow to be defined later.

### Known pre-existing bug (unrelated to Distributor work, logged not fixed)
- `attendance` table query fails: Supabase error `"column attendance.month does not exist"`. 
  `db.fetchAttendance(month, year)` queries `.eq('month',...).eq('year',...)` but the table likely only 
  has a `date` column (per usage pattern seen in TeamApp.jsx: `new Date(x.date).getDate()`). 
  Attendance dashboard cards still render (probably showing 0/empty) despite this failing silently.
  ### Additional fix (17 July 2026)
- Parameters.jsx was crashing with "editing is not defined" — a `const [editing, setEditing] = useState(null)` 
  declaration had been lost during earlier edit/undo cycles. Re-added right after the useData() destructure 
  line. Confirmed working now.

### Phase 2 — New Customer Visit: IN PROGRESS
- New table `distributor_visits` created (id, distributor_id, member_id, visit_date, outcome, notes, 
  next_followup_date, latitude, longitude). Added columns to `distributors`: `lead_stage` (values: 'new', 
  'interested', 'not_interested', 'final_pending', 'final_approved'), `next_followup_date`, 
  `business_info` (jsonb), `personal_info` (jsonb) — fields inside these jsonb blobs are placeholders, 
  real field requirements to be defined later.
- `db.js` additions: `fetchVisits`, `createVisit`, `updateDistributorLeadStage`, `fetchDueFollowups`.
- New file created: `src/pages/shared/NewCustomerVisit.jsx` — single-page adaptive form (toggle New/Existing 
  customer), outcome buttons (Interested/Not Interested/Final), follow-up date picker, due-followups list 
  at top. Location capture: on submit, shows `window.confirm("Are you at the Distributor Point?")` → if Yes, 
  `window.prompt` requires typing "Yes" to confirm → only then calls browser geolocation API. Declining 
  either step submits the visit with blank lat/long. Same confirmation flow applies to both new leads and 
  revisits.
- Access: Sales Team role only for now (added `'newCustomerVisit'` to `roles.menus` for role id `r5` 
  'Sales Team' in DB). Manager access intentionally deferred, not added yet.
- `WebApp.jsx` wiring (for desktop/manager-side sidebar) done: import added, menu entry under new 
  `sec: 'Distributor Functions'` section, PAGE_MAP entry added.
- **NOT yet done: TeamApp.jsx wiring** (this is where Sales Team users actually see it, since they use 
  a separate bottom-tab mobile-style app, not the WebApp.jsx sidebar). 

### Pending decision — TeamApp.jsx navigation redesign (agreed, not yet implemented)
Bottom tab bar (currently: Home, Goals, Expenses, Attend., Salary) won't scale as more Distributor 
Functions pages get added. Agreed approach: keep bottom bar for these 5 frequent core items, add a 
"More" tab (last position) that opens a sidebar/drawer menu for everything else — starting with 
New Customer Visit, and future Add Beats/Add Retailer/Primary Order/Closing Stock pages. 
NEXT STEP: get current full `TeamApp.jsx` content, then implement the More-tab + drawer pattern, 
add `newCustomerVisit` tab entry gated by `hasMenu('newCustomerVisit')`, and render `<NewCustomerVisit/>` 
inside the drawer/new tab.

### Phase 3+ (not started)
Final stage → manager approval notification → Registration Form (save/edit/submit) → Manager 
approve/reject with revise loop → Admin approve/reject → 48hr payment window (UTR/date/bank/amount/
remarks) → Admin verify + Acknowledge → notifications to Manager+member → status flips to Distributor, 
auto-mapped to team member. Notification system: `notifications` table exists in DB but no UI/read-flow 
built yet.
## Session Update — 17 July 2026

### Phase 2 — New Customer Visit: FIRST FULL VISIT CONFIRMED SAVED SUCCESSFULLY
- `NewCustomerVisit.jsx` tested end-to-end with a real Sales Team login (Arjun Nair) — new customer 
  created, visit logged, saved successfully to `distributors` + `distributor_visits` tables.
- TeamApp.jsx navigation redesign COMPLETE: bottom bar now has Home/Goals/Expenses/Attend./Salary + 
  a "More" (☰) button as 6th item. Tapping More opens a `Sheet` drawer listing `MORE_ITEMS` 
  (currently just "New Customer Visit", gated by `hasMenu('newCustomerVisit')`). This pattern is 
  the template for adding future Distributor Functions pages (Add Beats, Add Retailer, Primary 
  Order, Closing Stock) without crowding the bottom bar — just add new entries to `MORE_ITEMS`.
- `useData.jsx` now also fetches and exposes `visits`/`setVisits` (from `db.fetchVisits()`), added 
  to the Promise.all batch and the context Provider value. Confirmed working, no problems.

### Next step (in progress, not yet done)
Building visit/lead-stage summary displays in two places:
1. **TeamApp.jsx dashboard tab** — team member's own summary card (visit count + stage breakdown: 
   Interested / Not Interested / Final). Code drafted, not yet pasted/tested.
2. **Dashboard.jsx (Manager/Admin)** — org-wide summary across all team members. NOT YET DESIGNED 
   or coded — this is the next piece to build after #1 is confirmed working.

Reminder of lead_stage values on `distributors` table: 'new', 'interested', 'not_interested', 
'final_pending', 'final_approved'.