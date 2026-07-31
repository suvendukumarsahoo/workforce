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
### Phase 2 continued — Team member's own visit summary: COMPLETE & TESTED
- TeamApp.jsx dashboard tab now shows "My New Customer Visits" card with tap-to-drill-down: 
  stage counts (Interested/Not Interested/Final) → tap → LeadListSheet (leads in that stage) → 
  tap a lead → LeadDetailSheet (stage + full visit history with notes/location if captured). 
  Confirmed working end-to-end with real Sales Team login.
- Two new components added at bottom of TeamApp.jsx: LeadListSheet, LeadDetailSheet.
- `useData()` destructure in TeamApp.jsx now also includes `visits`.

### Next up (not started)
Manager/Admin Dashboard.jsx — org-wide New Customer Visit summary (all team members combined), 
same drill-down pattern as TeamApp.jsx version above, but showing stage counts across everyone 
and letting manager/admin see which team member owns which lead.
### Phase 2 continued — Follow-up popup + Pending Visits flow: COMPLETE & TESTED
- On TeamApp.jsx load, if leads are due today (stage='interested', next_followup_date <= today, 
  contact_today=false), a FollowupPopup shows each with "Will Contact Today" / "Reschedule" buttons.
- "Will Contact Today" sets `contact_today=true` on the distributor row, moving it into "Pending Visits" 
  (accessible via More menu, shows count badge).
- Tapping a pending visit opens VisitCloseSheet: notes field + 3 outcome buttons:
  - Remain Same (interested) → stays 'interested', requires new next_followup_date
  - Not Interested → lead_stage='not_interested', visit note auto-prefixed "Deal Fail (Nth visit)" 
    where N = count of prior visits + 1
  - Final → lead_stage='final_pending' (Phase 3 manager-approval flow not yet built)
- New db.js field used: `contact_today` boolean on distributors table (added via migration).
- Gotcha hit twice: pasting large multi-part code blocks into VS Code caused silent truncation 
  mid-tag (a `<textarea ... rows={3}` lost its closing `/>` both times). When pasting big JSX blocks, 
  verify the LAST few lines actually landed by scrolling to file end, not just checking Problems tab 
  immediately (it can lag/cache). Ln 621 Col 82 "Identifier expected" was the symptom.
  ## Session Update — 18 July 2026

### Phase 2 — New Customer Visit: FULLY COMPLETE
- Manager/Admin Dashboard.jsx now shows a "New Customer Visits" org-wide summary card (stage counts: 
  Interested/Not Interested/Final) with drill-down: tap a stage → StageLeadListSheet (all leads in that 
  stage across all team members, shows owner name) → tap a lead → LeadDetailSheetAdmin (stage, owner, 
  full visit history with notes/location). Confirmed working.
- This mirrors the same pattern already built in TeamApp.jsx (team member's own summary) — both now live.
- Dashboard.jsx useData() destructure fixed again (had regressed to plain `customers` instead of 
  `distributors: customers` — same recurring gotcha, watch for this every time Dashboard.jsx is touched).

### Phase 2 is DONE. Full feature recap:
Sales Team member logs visits via "New Customer Visit" (in TeamApp.jsx More drawer) → new or existing 
lead → outcome (Interested/Not Interested/Final) → location capture via double-confirm dialog → 
follow-up date scheduling → daily popup for due follow-ups (Will Contact Today / Reschedule) → 
Pending Visits list → visit-closing form (Remain Same / Not Interested-Deal Fail / Final) → both 
team member and Manager/Admin have drill-down visibility into all leads and visit history.

### Phase 3 — STARTING NOW: Post-"Final" approval chain
Full flow to build: lead marked Final → Manager approves/rejects → (if approved) Registration Form 
auto-sent to member (save/edit/submit) → Manager approve/reject with revise loop (per 
CRUD_STATE_MACHINE_PATTERN.md) → Admin approve/reject → 48hr payment window opens → member submits 
payment details (UTR/date/bank/amount/remarks) → Admin verifies + "Acknowledges" → notifications to 
Manager+member → distributor.type flips to 'Distributor', auto-mapped to team member (already assigned 
via distributor_assignments from lead creation, so no extra mapping step needed there).

**Menu naming (user-specified):** "New Distributor Approval" — manager-facing page, tap-to-drill-down 
pattern: list of leads pending approval → tap → customer detail page → approve/reject.

**Schema added this session (run in Supabase):**
```sql
CREATE TABLE distributor_registrations (
  id SERIAL PRIMARY KEY, distributor_id TEXT NOT NULL REFERENCES distributors(id),
  member_id INTEGER NOT NULL REFERENCES members(id), reg_data JSONB DEFAULT '{}',
  manager_status TEXT DEFAULT 'draft', manager_note TEXT,
  admin_status TEXT DEFAULT 'draft', admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE distributor_payments (
  id SERIAL PRIMARY KEY, distributor_id TEXT NOT NULL REFERENCES distributors(id),
  registration_id INTEGER NOT NULL REFERENCES distributor_registrations(id),
  member_id INTEGER NOT NULL REFERENCES members(id), status TEXT DEFAULT 'pending',
  utr_no TEXT, payment_date DATE, bank TEXT, amount NUMERIC, remarks TEXT,
  window_expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), verified_at TIMESTAMPTZ
);
```
Both run successfully. `reg_data` is a JSONB placeholder — actual registration form fields to be 
defined later (per user: "fields we will change as per requirement, these are only information").

**lead_stage progression (full list now):** new → interested → not_interested (closed) | final_pending 
→ [manager approves] → registration_pending → registration_manager_review → registration_admin_review 
→ payment_pending → payment_verification → [distributor.type = 'Distributor', flow complete]

### Next step (in progress)
db.js additions for registrations (createRegistration, fetchRegistrations, updateRegistration) — 
about to be added, not yet confirmed saved. After that: add `registrations`
### Phase 3a — Final approval (Manager): COMPLETE & TESTED
- New file: src/pages/manager/DistributorApproval.jsx — lists leads with lead_stage='final_pending', 
  tap-to-drill-down to visit history, Approve/Reject with required note on reject.
- Approve → creates distributor_registrations row (manager_status/admin_status both 'draft') + 
  updates distributors.lead_stage to 'registration_pending'.
- Reject → distributors.lead_stage back to 'interested', logs a visit note "Final rejected by manager: ...".
- Wired into WebApp.jsx as "New Distributor Approval" under Distributor Functions, Manager role only.
- Verified in DB: registration row created correctly, lead_stage updated correctly.

### Phase 3b — Registration Form fields: FINALIZED, build not started

**reg_data JSON shape (Registration Form fields):**
firm_name, firm_type ('Partnership'|'Proprietorship'), firm_address, mobile_no, whatsapp_no 
(prefilled=mobile, editable), gstin_available ('Yes'|'No'), gstin_number (if Yes), 
gst_declaration (if No), town, district, state, email, pan (required), fssai_no, aadhar_no,
godown_size, no_of_salesmen, no_of_delivery_units,
current_business: [{company_name, avg_monthly_turnover, working_since, salesman_type}] (dynamic table, has row total),
area_of_operation: [{market_name, no_of_outlets}] (dynamic table),
existing_wd_30km ('Yes'|'No'), existing_wd_details (if Yes),
vehicle_passage_constraint ('Yes'|'No'), vehicle_passage_details (if Yes)

**Terms & Conditions:** admin creates/manages a T&C template (separate admin page, not yet designed) 
shown as part of the registration form/printout.

**Signatures:** NOT digital — after Admin approves registration, member downloads/prints the form, 
gets it physically signed (Sales Officer/Manager/Admin), then uploads a photo/scan as a document 
(part of the 5-10 document upload set).

**Full lead_stage progression (with display labels):**
final_pending → [Manager approves] → registration_pending (member fills form, draft/edit/save)
→ registration_manager_review (member submits) → [Manager approves] → registration_admin_review 
→ [Admin approves] → documentation_pending (member downloads form, uploads signed copy + 5-10 
supporting docs) → documentation_admin_review (display label: "Distributor Documentation Verification") 
→ [Admin approves] → payment_pending (display label: "Awaiting Payment", 48hr window opens) 
→ payment_verification → [Admin verifies + Acknowledges] → distributors.type = 'Distributor' 
(flow complete)

Note: internal lead_stage values (snake_case) stay stable; only UI-facing labels shown to users 
use human-readable names ("Distributor Documentation Verification", "Awaiting Payment") — same 
convention as menu id vs label established earlier in the project.

**Not yet built:** document upload/storage mechanism (needs new table + Supabase Storage bucket), 
admin T&C template management page, form PDF generation for download/print.

### Building order (incremental, one stage at a time, same pattern as Phase 1/2)
1. Registration Form itself (fields finalized above) — member fills/saves/submits — NEXT UP
2. Manager approve/reject on submitted registration (revise loop, per CRUD_STATE_MACHINE_PATTERN.md)
3. Admin approve/reject on manager-approved registration
4. Document upload stage (Supabase Storage)
5. Admin document verification approve/reject
6. Payment window + submission + Admin verify/acknowledge → Distributor conversion
### Phase 3b — Document Submission Wizard: schema + label refinements

**Corrected stage labels:**
- documents_submitted → display: "Document Submitted"
- documentation_verification → display: "Distributor Registration Under Process" (corrected from 
  earlier "Distributor Document under Verification" — that label is WRONG, do not use it)
- payment_pending → display: "Awaiting Payment" (unchanged)

**Elapsed time tracking (new):** every lead_stage change from final_pending onward must show 
relative time since that change (e.g. "Document submitted 2 mins ago"). Implemented via:
- New column: `distributors.stage_updated_at` (TIMESTAMPTZ, default now())
- `db.js`'s `updateDistributorLeadStage()` now auto-stamps `stage_updated_at = now()` whenever 
  `updates.lead_stage` is present — this is automatic for ALL existing callers, no other code 
  needed to change.
- `timeAgo(isoDate)` helper function added (returns "just now"/"N mins ago"/"N hours ago"/"N days ago").

**Revised "Submit Documents" flow (5-step wizard, replaces the simple button):**
Before a team member can mark documents submitted, they must complete:
1. Confirm/edit Distributor Name (as per GST/PAN)
2. Geo-location check vs original visit location (haversine distance):
   - Within 100m → "Proceed?" confirmation, uses original visit's lat/long as confirmed_latitude/longitude
   - Beyond 100m or no original location → "Are you at the Distributor point?" → Yes → warning that 
     location differs → type "yes" to confirm → captures CURRENT geolocation as confirmed_latitude/longitude
3. Confirm/add Town + District (both required)
4. Confirm/add Mobile Number (required — must exist, was missing from original visit form)
5. "Any distributor within 30km?" Yes → requires Name + Town of that distributor; No → proceed
Only after all 5 steps does actual submission fire, updating lead_stage to 'documents_submitted' 
plus saving all collected fields.

**Schema added this session:**
```sql
ALTER TABLE distributors ADD COLUMN mobile_no TEXT;
ALTER TABLE distributors ADD COLUMN town TEXT;
ALTER TABLE distributors ADD COLUMN district TEXT;
ALTER TABLE distributors ADD COLUMN confirmed_latitude NUMERIC;
ALTER TABLE distributors ADD COLUMN confirmed_longitude NUMERIC;
ALTER TABLE distributors ADD COLUMN nearby_wd_30km TEXT;
ALTER TABLE distributors ADD COLUMN nearby_wd_name TEXT;
ALTER TABLE distributors ADD COLUMN nearby_wd_town TEXT;
ALTER TABLE distributors ADD COLUMN stage_updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE distributors ADD COLUMN resend_note TEXT;  -- from earlier, Admin's ReSend comment
```

**Files created:** src/pages/shared/DocumentSubmitWizard.jsx (5-step wizard component) — created, 
not yet wired into TeamApp.jsx. Includes haversineMeters() distance calculation helper.

**db.js updated:** updateDistributorLeadStage() now auto-stamps stage_updated_at — confirmed saved.

### Admin side — what Admin sees at 'documents_submitted' stage (per user spec, not yet built)
All wizard-collected data displayed (name, mobile, town, district, nearby WD info) + a map icon 
linking to confirmed_latitude/confirmed_longitude. Admin has an "Acknowledge" action → moves stage 
to documentation_verification ("Distributor Registration Under Process"). Manager sees all this 
read-only (no action button) — per earlier decision to extend DistributorApproval.jsx for both roles.

### Next steps (in order)
1. Wire DocumentSubmitWizard.jsx into TeamApp.jsx (replace direct "Submitted" button with wizard, 
   add db.js function to save all wizard-collected fields + set lead_stage='documents_submitted')
2. Extend DistributorApproval.jsx: show documents_submitted leads with full data + map icon; 
   Admin gets "Acknowledge" button, Manager read-only; add timeAgo() display everywhere stages show
3. Then continue: Acknowledge → documentation_verification → Admin ReSend(w/comment)/Approved for 
   Payment → payment_pending (48hr window) → payment submission → Admin verify/acknowledge → 
   distributors.type = 'Distributor'
   ### Phase 3 — Document Submission + Admin Approval: COMPLETE & TESTED

**DistributorApproval.jsx fully rebuilt** (Manager + Admin, role-gated via `role.name === 'Admin'`):
- Shows all leads in PIPELINE_STAGES (final_pending through final_approved) with stage label + 
  timeAgo(stage_updated_at) elapsed time.
- Tap a lead → shows confirmed details (mobile, town, district, nearby WD, Google Maps link via 
  confirmed_latitude/longitude) + full visit history.
- Manager: read-only ("View only — no action needed from Manager at this stage").
- Admin actions by stage: final_pending → Approve/Reject (existing 3a flow); documents_submitted → 
  "Acknowledge Receipt" button → moves to documentation_verification; documentation_verification → 
  "ReSend" (with mandatory comment, saved to distributors.resend_note, sends back to 
  registration_pending) OR "Approved for Payment" → moves to payment_pending.
- Both Admin and Manager roles needed `distributorApproval` added to their `roles.menus` array in DB 
  (Admin was missing this — remember to check both roles when adding new menu items going forward).

**Bug fixed:** TeamApp.jsx was missing the actual `<LeadListSheet>` render block entirely (only had 
the onClick setting state, no corresponding render) — tapping a stage count did nothing. Fixed by 
adding the render block between the stage-count Card and the LeadDetailSheet render.

**Bug fixed:** Goal entry re-opening for already-approved members. When Manager/Admin enables a NEW 
parameter (e.g. enableAcq) for a member whose overall goal status is already 'approved', the 
"Set my goals"/"Revise" button used to stay hidden (canEnter only checked draft/rejected/partial). 
Fixed by adding `hasNewParam` check — detects any enabled parameter with no corresponding status 
in the goal record yet, and allows re-opening the entry form for just that new field while 
everything else stays locked/approved as before.

**Label change:** "New customer acquisition" → "New Distributor Appointment" everywhere (Parameters.jsx 
toggle label, TeamApp.jsx GoalEntrySheet field label). Internal keys unchanged: `enableAcq`, 
`acq_goal`, `acq_status`, fieldKey="acq".

**Known gap, not yet tested:** DocumentSubmitWizard's field-saving was tested once with a STALE lead 
(pushed to documents_submitted before the wizard existed, so mobile/town/district/location are all 
NULL for that specific test lead). Need a fresh end-to-end wizard test on a lead that goes through 
registration_pending → wizard properly this time, to confirm the wizard's collected fields actually 
save to distributors table correctly.

### Phase 3 — FINAL STAGE, starting now: Payment + Distributor Conversion

**Schema (redefine distributor_payments — no data exists yet, safe to redefine cleanly):**
```sql
DROP TABLE IF EXISTS distributor_payments;
CREATE TABLE distributor_payments (
  id SERIAL PRIMARY KEY, distributor_id TEXT NOT NULL REFERENCES distributors(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  mode_of_payment TEXT NOT NULL,   -- Cash/Cheque/NEFT/RTGS/UPI
  bank_name TEXT NOT NULL, ifsc_code TEXT NOT NULL, bank_branch TEXT NOT NULL,
  transaction_date DATE NOT NULL, transaction_amount NUMERIC NOT NULL, transaction_id TEXT NOT NULL,
  remarks TEXT,  -- only optional field
  status TEXT DEFAULT 'submitted',
  created_at TIMESTAMPTZ DEFAULT now(), verified_at TIMESTAMPTZ
);
```

**Flow:** payment_pending ("Awaiting Payment", 48hr countdown from stage_updated_at, visible to 
Team Member + Manager) → member taps status → payment entry form (all fields mandatory except 
Remarks) → Submit → lead_stage='payment_verification' ("Payment Acknowledgement Pending") → Admin 
reviews submitted details → clicks "Payment Received" → lead_stage='final_approved' ("Distributor 
Created"), distributors.type flips to 'Distributor'.

**Achievement tracking (needs real logic, not just labels):** achievementEngine.js currently ONLY 
computes achievements from invoices (value/products/categories/customers) — has ZERO concept of 
counting completed distributor appointments. Must add: count of distributors where type='Distributor' 
AND assignedTo includes member, per member, exposed as `a.acq` in the achievements object. Requires:
1. computeAchievements() signature change to also accept distributors data
2. useData.jsx: pass distributors into the useMemo() call that computes achievements
3. This makes "Distributor Appointment" goal progress bars finally show real numbers (currently 
   g.acq_goal exists as a target but a.acq has never been computed — silently shows 0 always)

### Building order for this final piece
1. Run schema SQL above
2. Fix achievementEngine.js + useData.jsx (acq counting from distributors) — do this FIRST since 
   everything else depends on it existing
3. db.js: createPayment(), fetchPayments(), verifyPayment() functions
4. TeamApp.jsx: 48hr countdown display + payment entry form (opens when tapping payment_pending lead)
5. DistributorApproval.jsx: show submitted payment details to Admin + "Payment Received" button
6. Manager: read-only countdown display (reuse existing read-only pattern)
### Bug fixes — goal status & achievement counting (19 July 2026)

**Bug: stale/orphaned goal fields kept status stuck at 'pending' forever.** If a Manager later 
disabled a parameter (e.g. unchecked Customer-wise value) after a member had already submitted 
goals with that field, the old pending/rejected field data stayed in the goals JSON forever — but 
GoalApprovals.jsx only renders fields for currently-enabled parameters, so there was no way to ever 
resolve it. Fixed: `getGoalOverallStatus(goal, param)` in achievementEngine.js now takes an optional 
second `param` argument and only counts fields whose parameter is currently enabled (also respects 
`sel_custs`/`sel_prods`/`sel_cats` — if a specific item was removed from the selection list, its 
stale status is ignored too). All 2 real call sites updated:
- useData.jsx: builds `memberParam` from the raw `pa` array (NOT the `params` state, which isn't 
  updated yet at this point in loadAll()) and passes it in.
- TeamApp.jsx: passes existing `p` (member's own params, already in scope).
- GoalApprovals.jsx: no change needed — just reads the pre-computed `goals[m.id].status`.

**Bug: acq (Distributor Appointment) achievement was counting ALL distributors, not just ones 
appointed through the pipeline.** Original fix counted `type === 'Distributor'`, but pre-existing 
seed distributors (TCS Auto Parts, Wipro Motors, etc.) already have that type from seed.sql and 
aren't part of the New Customer Visit → Final → Payment pipeline at all. Corrected: 
achievementEngine.js now counts `lead_stage === 'final_approved'` instead — this value only ever 
gets set at the very end of the full pipeline (after Admin acknowledges payment), so pre-existing 
seed data is correctly excluded.

**Missing UI: TeamApp.jsx "My Goals" tab never rendered Visits or Acq (Distributor Appointment) 
sections at all** — only Value/Product/Category/Customer. Added two new Card blocks after the 
Customer goals section: "New Distributor Appointment" (shows goal, status badge, achieved count 
from `a.acq`, progress bar when approved) and "Outlet Visits" (goal + status, no achievement 
tracking exists for this one yet). Confirmed both now visible and correctly showing Approved status 
with 0 achieved (correct, since no lead has completed the full pipeline yet).

### Phase 3 — Payment stage: IN PROGRESS

**New file created:** src/pages/shared/PaymentEntryForm.jsx — fields: Mode of Payment 
(Cash/Cheque/NEFT/RTGS/UPI buttons), Bank Name, IFSC Code, Bank Branch, Transaction Date, 
Transaction Amount, Transaction ID (all required), Remarks (optional). Validates all required 
fields before allowing submit.

**TeamApp.jsx wiring so far:**
- Import added: `import PaymentEntryForm from '../shared/PaymentEntryForm.jsx'`
- New state: `const [paymentLead, setPaymentLead] = useState(null)`
- LeadDetailSheet: added `onOpenPayment` prop, `getCountdown()` helper (computes 48hr deadline from 
  `stage_updated_at`, shows "Xh Ym remaining" or "Window expired"), and a new block shown when 
  `lead.lead_stage === 'payment_pending'`: countdown display + "Enter Payment Details" button that 
  calls `onOpenPayment(lead)`.

### Next steps (not yet done)
1. Update the `<LeadDetailSheet>` render call site to pass `onOpenPayment={(lead) => { setPaymentLead(lead); setSelectedLead(null) }}`
2. Add `<PaymentEntryForm>` render block (conditional on `paymentLead`), wired to a new `onSubmit` 
   handler that: calls `db.createPayment()` with the form data + distributor_id/member_id, then 
   calls `db.updateDistributorLeadStage(paymentLead.id, { lead_stage: 'payment_verification' })`
3. Manager: read-only countdown display (DistributorApproval.jsx already shows stage + timeAgo — 
   should also show countdown specifically for payment_pending, reusing same getCountdown logic)
4. DistributorApproval.jsx (Admin): show submitted payment details (fetch via db.fetchPayments(), 
   filter by distributor_id) + "Payment Received" button → calls db.verifyPayment(paymentId) AND 
   db.updateDistributorLeadStage(leadId, { lead_stage: 'final_approved', type: 'Distributor' }) 
   — this is the final step that completes the entire Phase 3 pipeline and makes the acq achievement 
   count increment for the team member.
   ### Recurring bug — LeadListSheet render block keeps disappearing (2nd occurrence)

TeamApp.jsx's `{selectedStage && (<LeadListSheet .../>)}` render block has now gone missing TWICE 
during this project — both times the onClick handler (`setSelectedStage(key)`) stayed intact and 
correct, but the corresponding render block vanished, likely during a large paste/edit operation 
that silently dropped a chunk. Symptom each time: tapping a stage count (Interested/Not 
Interested/Final) does nothing, no console error, no visible failure.

**If this happens a third time:** search TeamApp.jsx for `{selectedStage && (` — if there's no 
match, the block is missing. Fix by adding it directly before the `{selectedLead && (` block:
```javascript
{selectedStage && (
  <LeadListSheet
    stage={selectedStage}
    leads={(customers || []).filter(d => (d.assignedTo || []).includes(mid) && d.type === 'New Customer' &&
      (selectedStage === 'final' ? ['final_pending', 'registration_pending', 'documents_submitted', 'documentation_verification', 'payment_pending', 'payment_verification', 'final_approved'].includes(d.lead_stage) : d.lead_stage === selectedStage))}
    onSelectLead={d => { setSelectedLead(d); setSelectedStage(null) }}
    onClose={() => setSelectedStage(null)}
  />
)}
```
Re-fixed and confirmed working as of 19 July 2026, evening.

### General lesson learned this session
After any large multi-block paste into TeamApp.jsx, verify with `Ctrl+F` that ALL expected render 
blocks/components are present (search each of: `selectedStage`, `selectedLead`, `docWizardLead`, 
`paymentLead`, `pendingDetail`, `showFollowupPopup` — each state variable should have both a setter 
call AND a corresponding `{stateName && (...)}` render block). Don't assume "no console error" means 
the paste landed completely — missing render blocks fail silently (nothing happens on click, no crash).
### Bug fixes this session (payment flow wiring)

**Bug: duplicate `<LeadDetailSheet>` render block in TeamApp.jsx.** Two separate 
`{selectedLead && (<LeadDetailSheet .../>)}` blocks existed — one correct (with `onOpenPayment` 
prop), one stale leftover (without it). React was rendering the stale one, causing 
"onOpenPayment is not a function" crash when tapping the payment button. Deleted the stale 
duplicate. LESSON: whenever adding a new prop to a component, search for ALL render call sites 
of that component (`<ComponentName`) before assuming there's only one — duplicates from earlier 
pastes are a recurring risk in this file.

**Bug: db.js payment functions were designed but never actually pasted in.** `createPayment`, 
`fetchPayments`, `verifyPayment` were planned in an earlier CLAUDE.md entry but the actual paste 
into db.js never happened, causing "db.createPayment is not a function" on submit. Now added and 
confirmed working — PaymentEntryForm successfully submits.

### Phase 3 — Payment stage, FINAL PIECE remaining

**Schema (run in Supabase):**
```sql
ALTER TABLE distributors ADD COLUMN distributor_created_at TIMESTAMPTZ;
ALTER TABLE distributors ADD COLUMN distributor_created_by INTEGER REFERENCES members(id);
```

**Design for Admin's payment_verification screen (in DistributorApproval.jsx):**
- Tap a lead at `payment_verification` stage → fetch and show full payment details from 
  `distributor_payments` table (mode, bank name, IFSC, branch, txn date, amount, txn ID, remarks)
- Two Admin actions:
  - **"Not Received till Now"** → re-stamps `distributors.stage_updated_at = now()` only (stage 
    stays payment_verification) — this resets the "last checked X ago" timer visible to Manager 
    and Team Member, creating a visible loop until payment is confirmed
  - **"Payment Received"** → sets on distributors: `lead_stage='final_approved'`, 
    `type='Distributor'`, `distributor_created_at=now()`, `distributor_created_by=<team member's 
    member_id, from distributor_assignments>`; also marks the distributor_payments row as 
    `status='verified'` via existing `db.verifyPayment(paymentId)`. This is the FINAL step — 
    completes the entire Phase 3 pipeline, and is what makes the acq achievement count increment 
    (achievementEngine.js already counts `lead_stage === 'final_approved'`,
    ### Next steps
1. Run schema SQL above
2. Add to db.js: a function to fetch payment(s) for a specific distributor_id (or reuse 
   fetchPayments() and filter client-side), and a function/logic for "Not Received till Now" 
   (simple updateDistributorLeadStage call with no lead_stage change, just forces stage_updated_at)
3. DistributorApproval.jsx: add payment_verification case — show payment details Sheet + two 
   buttons as designed above
4. Test full end-to-end: Sales Team submits payment → Admin sees details → "Not Received" loop 
   test → "Payment Received" → confirm distributors.type flips, achievement count increments for 
   the team member's Distributor Appointment goal
   ### Phase 3 — Payment Verification & Distributor Creation: COMPLETE

**Schema added:**
```sql
ALTER TABLE distributors ADD COLUMN distributor_created_at TIMESTAMPTZ;
ALTER TABLE distributors ADD COLUMN distributor_created_by INTEGER REFERENCES members(id);
```

**db.js additions:** `createPayment`, `fetchPayments`, `verifyPayment`, `updatePayment`.

**DistributorApproval.jsx — final payment_verification stage built:**
- Admin taps a `payment_verification` lead → `loadPayment()` fetches the matching row from 
  `distributor_payments`, populates both `payment` (original) and `editedPayment` (working copy) state.
- All payment fields (mode, bank name, IFSC, branch, date, amount, txn ID, remarks) rendered as 
  **editable inputs** — Admin can overwrite anything the team member entered before finalizing.
- "Not Received till Now" → re-stamps `stage_updated_at` only, stays at same stage — creates a 
  visible loop (shows "Not Received — as on [date/time]" to Team Member, Manager, and Admin, all 
  reading the same `stage_updated_at` field).
- "Payment Received" → saves any Admin edits via `db.updatePayment()`, then sets on distributors: 
  `lead_stage='final_approved'`, `type='Distributor'`, `distributor_created_at=now()`, 
  `distributor_created_by=<owning team member's id>`; marks payment row `status='verified'` via 
  `db.verifyPayment()`. This is the pipeline's final step.

**Visibility across all 3 roles confirmed:**
- TeamApp.jsx LeadDetailSheet: shows "Not Received till Now — as on [date/time]" when 
  lead_stage='payment_verification' (added as sibling block to resend_note, NOT nested inside it — 
  watch for this nesting mistake, the two conditions are mutually exclusive by lead_stage so nesting 
  silently breaks the new block).
- DistributorApproval.jsx: same status text shown to both Manager (read-only) and Admin (with action 
  buttons), since they share this one file gated by `isAdmin`.

### Bugs fixed this session (recurring pattern: incomplete/partial pastes)
1. Duplicate `<LeadDetailSheet>` render in TeamApp.jsx — one had `onOpenPayment` prop, stale 
   duplicate didn't. React rendered the stale one → crash. Always search `<ComponentName` for ALL 
   render call sites before adding a new prop, not just the one being edited.
2. db.js payment functions (createPayment etc.) were planned in CLAUDE.md but never actually pasted 
   into the file — caused "db.createPayment is not a function".
3. Duplicate `loadPayment` function declaration — parse error, then when "fixing" it by deleting one 
   copy, the WRONG (older, incomplete) one was kept, leaving `payment`/`editedPayment` state 
   declarations entirely missing even though the JSX and functions using them were present. 
   General lesson: when two duplicate declarations exist, diff them carefully before deleting — the 
   newer/more complete one isn't always the second one that appears in search results.

### PHASE 3 IS NOW FULLY COMPLETE — full pipeline recap:
New Customer Visit (lead capture, location-confirmed) → Interested/Not Interested/Final outcomes → 
follow-up scheduling & daily reminder popup → Pending Visits → visit-closing (Remain Same/Not 
Interested-Deal Fail/Final) → Manager approves Final → Registration Pending → team member sends 
form+docs externally, clicks Submitted → 5-step Document Submit Wizard (name confirm, geo-location 
check vs original visit, town/district, mobile, 30km-competitor check) → Admin Acknowledges Receipt 
→ Distributor Registration Under Process → Admin ReSend(w/comment, loops back) OR Approved for 
Payment → 48hr countdown (Awaiting Payment) → team member submits Payment Entry Form → Payment Under 
Verification → Admin reviews/edits payment details → Not Received (loops) OR Payment Received → 
distributors.type flips to 'Distributor', creation timestamp+creator recorded, Distributor 
Appointment achievement count increments for the owning team member's goal.

Manager and Team Member have full read-only visibility into every stage throughout, via 
DistributorApproval.jsx (Manager) and TeamApp.jsx's drill-down (Team Member + Home dashboard 
summary + Manager/Admin Dashboard.jsx org-wide summary from Phase 2).

### Not yet built (deferred, no active plan)
- "New Retailer" menu (Primary Order Page, Closing Stock Entry, Add Beats, Add Retailer)
- Admin T&C template management page (mentioned early in Phase 3 planning, superseded by the 
  simpler "external platform + submit confirmation" approach — likely no longer needed as originally 
  scoped, revisit if the printed form still needs a formal T&C template source)
- Netlify migration (flagged early on, before commercial launch, for private-repo support)
- RLS (Row Level Security) across all Supabase tables — flagged multiple times, still not done
- Pre-existing attendance bug: `db.fetchAttendance` queries nonexistent month/year columns
### Post-Phase-3 refinements — in progress

**Distributors.jsx master list:** added two columns — "Created On" and "Created By" (separate 
columns, not combined), rendering `distributor_created_at`/`distributor_created_by` for leads that 
completed the full pipeline. Confirmed data was already saving correctly; this was purely a display 
gap.

### Now building: 4-tile stage summary + payment amount, both TeamApp.jsx and Dashboard.jsx

**Requirement:** Total visits, Interested, Not Interested, Final (in-progress pipeline stages), and 
Distributor Created — as 4 (or 5, including visits count in the subtitle) separate clickable tiles, 
each drilling down to lead list → lead detail. Team member sees own; Manager/Admin see org-wide 
totals with drill-down to which team member owns each lead.

**Key design change:** `final_approved` must be split OUT of the "Final" bucket into its own 
"Distributor" bucket — previously `final_approved` was included in the general 
`PIPELINE_STAGES`/`final` count, which would double an entry once a lead actually completes (it'd 
show in both "Final" and would need to also show as "Distributor Created"). New stage groupings:
- `IN_PROGRESS_STAGES` (shown as "Final" tile): final_pending, registration_pending, 
  documents_submitted, documentation_verification, payment_pending, payment_verification
- `final_approved` alone → new "Distributor Created" tile

**Payment amount display:** requires `payments` data to be globally available (previously only 
fetched ad-hoc inside DistributorApproval.jsx via `loadPayment()` for a single lead at a time). 
Adding `payments`/`setPayments` to useData.jsx (same Promise.all pattern as visits/registrations) — 
IN PROGRESS, not yet confirmed saved.

### Next steps
1. Finish useData.jsx payments wiring (4 edits: Promise.all destructure, useState, setPayments call, 
   Provider value) — given to user, not yet confirmed done
2. TeamApp.jsx: update stageCounts calc (interested/not_interested/final/distributor split), update 
   grid to 4 tiles, add payment amount somewhere (likely shown in the Distributor lead's detail 
   sheet, sourced from `payments` filtered by distributor_id)
3. Dashboard.jsx (Manager/Admin): same 4-tile treatment for the "New Customer Visits" org-wide 
   summary card, same drill-down pattern already established (StageLeadListSheet → 
   LeadDetailSheetAdmin) — need to add 'distributor' as a 4th selectable stage there too
4. Both LeadDetailSheet (TeamApp) and LeadDetailSheetAdmin (Dashboard) should show payment amount 
   when lead_stage === 'final_approved', pulled from `payments` filtered by distributor_id
   ## Session Update — 21 July 2026

### Bug fixes — tile counting (TeamApp.jsx + Dashboard.jsx)

**Bug: completed distributors vanished from all tile counts.** Both `myLeads` (TeamApp.jsx) 
and `newLeads` (Dashboard.jsx) filtered on `d.type === 'New Customer'` — but `type` flips to 
`'Distributor'` the moment Admin confirms payment (`final_approved`). This silently excluded 
every completed distributor from the summary tiles and drill-down lists the instant they 
converted. Fixed: filter now checks `d.lead_stage` (truthy) instead of `type`, in both files, 
in both the tile-count logic and the `LeadListSheet`/`StageLeadListSheet` leads filter.

**Dashboard.jsx subtitle mismatch:** "X total leads" subtitle was counting distributors with 
any `lead_stage` set — including stale seed data if `lead_stage` ever got a default value via 
ALTER TABLE. Fixed: subtitle and new "Total Visited" tile both now derive from `visits` records 
(`visitedIds = new Set(visits.map(v => v.distributor_id))`), so only leads with an actual visit 
count, matching the same logic used for the tile itself.

**TeamApp.jsx subtitle mismatch:** "X total visits logged" counted raw visit *records* (repeat 
visits to the same lead counted twice), while tiles count each lead once. Fixed: subtitle now 
uses unique lead count (`new Set(myVisits.map(v => v.distributor_id)).size`) so it always equals 
Interested + Not Interested + Final + Distributor Created.

### Tile layout — 5-tile format, both TeamApp.jsx and Dashboard.jsx
Both home summary cards now show identical layout: **Total Visited, Interested, Not Interested, 
Final, Distributor Created** (renamed from "Distributor"). All 5 tiles tappable, all drill down 
via `LeadListSheet`/`StageLeadListSheet`. "Distributor Created" tile and its list rows now show 
the payment amount (from `payments`/`distributor_payments`, filtered by `distributor_id`) once 
a lead reaches `final_approved`. `useData.jsx`'s existing `payments` wiring is a dependency for 
all of this — confirm it's saved if tiles ever show missing payment data.

**Label rename:** "Distributor" → "Distributor Created" everywhere (tile label, LeadListSheet/
StageLeadListSheet stage label map). "New Distributor Appointment" goal label also renamed to 
"Distributor Created" in TeamApp.jsx's My Goals tab and GoalEntrySheet — internal keys (`enable_acq`, 
`acq_goal`, `acq_status`, `fieldKey="acq"`) unchanged. Parameters.jsx toggle label not yet renamed 
to match (deferred).

### Bug fix — Manager lost final_pending approval action (DistributorApproval.jsx)
A later rebuild of this file gated ALL actions behind `isAdmin`, including the original Phase 3a 
final_pending approve/reject flow that was explicitly built for **Manager**. Fixed: added 
`isManager` check, restored `(isAdmin || isManager)` gate specifically on the final_pending 
approve/reject block, and adjusted the "View only" message to not show for Manager at that one 
stage. All later stages (documents_submitted, documentation_verification, payment_verification) 
remain Admin-only as designed.

### New feature: Distributor Order module — Phase 1 built (Team Member creation)

**Schema added:**
```sql
ALTER TABLE products ADD COLUMN weight NUMERIC;
ALTER TABLE products ADD COLUMN length NUMERIC;
ALTER TABLE products ADD COLUMN breadth NUMERIC;
ALTER TABLE products ADD COLUMN height NUMERIC;
ALTER TABLE products ADD COLUMN volume NUMERIC GENERATED ALWAYS AS (length * breadth * height) STORED;

ALTER TABLE distributors ADD COLUMN payment_mode TEXT DEFAULT 'Advance';
-- 'Advance' (default, auto for pipeline-created distributors) or 'Credit' (manual/uploaded only)

CREATE TABLE distributor_orders (
  id SERIAL PRIMARY KEY, distributor_id TEXT NOT NULL REFERENCES distributors(id),
  member_id INTEGER NOT NULL REFERENCES members(id), order_date TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'order_submitted',  -- order_submitted -> manager_approved_admin_pending -> confirmed
  manager_id INTEGER REFERENCES members(id), manager_approved_at TIMESTAMPTZ,
  admin_confirmed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE distributor_order_items (
  id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES distributor_orders(id),
  product_id TEXT NOT NULL, category_id TEXT, rate NUMERIC NOT NULL, weight NUMERIC, volume NUMERIC,
  order_qty NUMERIC NOT NULL, approved_qty NUMERIC, final_qty NUMERIC
);
CREATE TABLE distributor_order_payments (
  id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES distributor_orders(id),
  distributor_id TEXT NOT NULL REFERENCES distributors(id), member_id INTEGER NOT NULL REFERENCES members(id),
  mode_of_payment TEXT NOT NULL, bank_name TEXT NOT NULL, ifsc_code TEXT NOT NULL, bank_branch TEXT NOT NULL,
  transaction_date DATE NOT NULL, transaction_amount NUMERIC NOT NULL, transaction_id TEXT NOT NULL,
  remarks TEXT, status TEXT DEFAULT 'submitted', created_at TIMESTAMPTZ DEFAULT now(), verified_at TIMESTAMPTZ
);
```

**db.js additions:** `createDistributorOrder`, `fetchDistributorOrders`, `updateOrderStatus`, 
`updateOrderItemQty`, `createOrderPayment`, `fetchOrderPayments`, `verifyOrderPayment`.

**Products.jsx:** added Weight, Length, Breadth, Height fields to the add/edit form and Weight/
Volume columns to the table. `volume` is a DB-generated column (never sent in payload).

**Menu wiring:** `distributorOrder` added to `roles.menus` (jsonb array, confirmed via 
`SELECT menus FROM roles LIMIT 1` showing bracket format) for Sales Team, Manager, and Admin. 
WebApp.jsx: new sidebar entry under "Distributor Functions". TeamApp.jsx: added to `MORE_ITEMS` 
drawer (same pattern as `newCustomerVisit`).

**New file: `src/pages/shared/DistributorOrder.jsx`** — Team Member's order-creation flow:
1. Select distributor (filtered to `type === 'Distributor'`, own assignments only)
2. If distributor's `payment_mode === 'Advance'`: payment entry form shown FIRST (same fields 
   as distributor payment form), must complete before proceeding to items
3. Item entry: dropdown-driven table — product dropdown excludes already-added products 
   (hard duplicate prevention), rate/weight/volume auto-populate from product master on add, 
   qty is a live editable `<input>` directly in the table row, editable anytime pre-submission
4. Payment details (if Advance) shown as a persistent compact card at the top of the item screen
5. Real-time validation: grand total turns red and "Save & Review" disables the instant order 
   value exceeds the payment amount; double-checked again in `goToConfirm()` as a safety net
6. Category-wise summary (qty/weight/volume/value) + grand total
7. OTP screen (demo hardcoded `1234`) → on confirm, creates `distributor_orders` + 
   `distributor_order_items` + (if Advance) `distributor_order_payments`, status = `order_submitted`

### New feature: Distributor Order module — Phase 2 built (Manager + Admin approval)

**New file: `src/pages/manager/OrderApproval.jsx`** — shared by Manager and Admin, role-gated:
- Manager sees orders at `order_submitted`; Admin sees orders at `manager_approved_admin_pending`
- Payment details card always visible at top for both roles (per requirement: payment details 
  shown on all three order screens — Team/Manager/Admin — always)
- Item table: Order Qty always shown read-only; Manager gets editable "Approved Qty" column; 
  Admin additionally sees Manager's approved qty (read-only) plus editable "Final Qty" column
- Manager: OTP (`1234`) required to confirm approval → sets `approved_qty` AND seeds `final_qty` 
  to match (so Admin's default starts from Manager's numbers, not the original order) → status 
  `manager_approved_admin_pending`
- Admin: no OTP required (per spec — OTP only for Team + Manager stages). If payment exists, 
  must click "Confirm Payment" (marks `distributor_order_payments.status='verified'`) before 
  "Confirm Order" enables → status `confirmed`. Credit-mode orders (no payment row) skip straight 
  to Confirm Order.
- Menu `orderApproval` added to Manager + Admin roles only (not Sales Team)

**Known gaps / deferred:**
- No Reject option built yet at either Manager or Admin order-approval stage
- Post-confirmation flow (stock deduction, dispatch, invoice, notifications) intentionally 
  deferred — order just marks `status='confirmed'` for now, per explicit instruction to keep 
  it simple and build further logic later
- `if (orders.length === 0) loadOrders()` pattern used for initial fetch in OrderApproval.jsx 
  instead of `useEffect` — works but could re-fire on renders before data populates; revisit if 
  excessive network calls are observed
- Parameters.jsx "New customer acquisition"/"New Distributor Appointment" toggle label not yet 
  renamed to "Distributor Created" to match TeamApp.jsx

### Deferred feature — Payment Hold / ReInitiate flow (planned, not started)
Discussed and designed but explicitly parked for later:
- 48hr payment window expiry → auto-flip `payment_pending` → `payment_hold` ("Hold for Payment"), 
  checked on every `loadAll()` (app load), new "On Hold" tile in TeamApp/Dashboard
- Manager: note + "ReInitiate Payment" → `payment_reinitiate_pending`
- Admin: note + Approve (reject option and destination TBD — mid-discussion when parked) → 
  reopens 48hr window, `payment_request_count += 1`, tagged "2nd Request"
- "On Hold" tile count is meant to stay "sticky" (via `payment_request_count > 1` check) through 
  the whole reinitiate cycle until `final_approved`, so it doesn't double back into "Final"
- Schema planned: `distributors.payment_request_count` (default 1), `hold_note`, `reinitiate_note` 
  — NOT yet run in Supabase
  ## Session Update — 25 July 2026

### Bug fix — TeamApp.jsx / Dashboard.jsx tile counting (carried over investigation)
Root cause of "completed distributors vanish from tiles" traced and fixed: both files filtered on 
`d.type === 'New Customer'`, but `type` flips to `'Distributor'` on `final_approved`, silently 
excluding converted leads from all tile counts/drill-downs. Fixed in both to filter on `d.lead_stage` 
(truthy) instead. Also fixed subtitle mismatches: Dashboard.jsx's "total leads" now derives from 
actual `visits` records (not stale `lead_stage` defaults from ALTER TABLE); TeamApp.jsx's subtitle 
now counts unique visited leads instead of raw visit records, so subtitle always equals 
Interested+Not Interested+Final+Distributor Created. Both files now show identical 5-tile format: 
Total Visited, Interested, Not Interested, Final, Distributor Created (renamed from "Distributor").

### Bug fix — DistributorApproval.jsx Manager lost final_pending approve/reject
A rebuild had gated ALL actions behind `isAdmin`, removing Manager's original Phase 3a action at 
`final_pending`. Restored `(isAdmin || isManager)` gate specifically for that stage; all later 
stages remain Admin-only.

### New module: Distributor Order (Team → Manager → Admin approval chain)
**Schema:** `products` gained `weight`, `length/breadth/height` + individual `length_unit`/
`breadth_unit`/`height_unit` (feet/inch, each dimension independently convertible) + `stacking_norm` 
(max cartons stacked); `volume` is a generated column converting each dimension to feet before 
multiplying. `distributors` gained `payment_mode` ('Advance' default / 'Credit', pipeline-created 
always Advance). New tables: `distributor_orders`, `distributor_order_items`, 
`distributor_order_payments`.

**Team Member (`DistributorOrder.jsx`):** select distributor → if Advance, payment form required 
first (persistent compact summary card shown throughout) → tabular item entry (dropdown excludes 
already-added products, rate/weight/volume auto-populate) → live qty input, real-time grand total 
capped against payment amount (red warning + disabled Save & Review if exceeded) → OTP (`1234`) → 
order list shows Order ID + distributor + town; `order_submitted` rows are tap-to-edit (re-enters 
same flow, updates existing order via `updateDistributorOrder`/`updateOrderPayment` instead of 
creating new).

**Manager/Admin (`OrderApproval.jsx`):** Manager sees `order_submitted` queue, edits qty (seeds both 
`approved_qty` and `final_qty` so Admin's default trails Manager's numbers), OTP-gated approval → 
`manager_approved_admin_pending`. Admin reviews same order, edits final qty, can add new items 
(product picker, duplicate-safe) while status is pre-picking, confirms payment then confirms order 
(no OTP for Admin, per spec) → `confirmed`, then explicitly advances via `OrderStatusFlow` chip to 
`submitted_for_picking`.

**Bug fixed:** duplicate/leftover import and JSX fragment mismatches occurred repeatedly across 
`DistributorOrder.jsx`, `OrderApproval.jsx`, `WebApp.jsx` during incremental edits — recurring lesson: 
always verify single occurrence of any import/function name before pasting new instances.

**Critical bug fixed — PostgREST ambiguous relationship:** `fetchDistributorOrders()` failed silently 
(empty results, no visible error) because `distributor_orders` has two FKs to `members` 
(`manager_id`, `member_id`); fixed by explicit `members!distributor_orders_member_id_fkey` / 
`members!distributor_orders_manager_id_fkey` aliasing in the select.

### New module: Picking flow (Warehouse Manager + Admin loop)
**New role:** `r6` "Warehouse Manager", desktop WebApp.jsx login (not mobile TeamApp).

**Schema:** `distributor_order_items` gained `availability` ('Available'/'Unavailable'/'Wait'/null-
Pending), `wait_days`, `cancelled`. `distributor_orders` gained `picking_status` 
('pending_picking'→'picking_done'→'ready_for_load'→'confirmed'), `picking_updated_at`, 
`picking_round`, `load_id`, `load_created_at`.

**Flow:** Order reaches `submitted_for_picking` → Warehouse Manager's Dashboard tiles: Orders Ready 
to Pick, Pending Picking, Picking Complete, Load List (all open an embedded `PickingEditSheet` — 
availability dropdown per item, live fill rate (Value/Item/Qty %), color-coded rows). Submitting 
with **any** non-Available item (Wait OR Unavailable — corrected from Wait-only) keeps 
`picking_status='picking_done'`; all-Available flips to `'ready_for_load'`. Both states remain 
editable by Warehouse Manager (qty/add/delete stay Admin-only; only availability status is WM's to 
set) until Admin creates a load.

**Admin's Completed Picklist (`OrderApproval.jsx`):** table (Order ID, Distributor, Items Ord/Picked, 
Qty Ord/Picked, Order Value, Last Updated) listing both `picking_done` and `ready_for_load` orders 
(not `load_id`'d yet). Row click branches: if every active item is Available → read-only 
`OrderFullDetail` with working "Create Load" button (also requires zero Unavailable, not just zero 
Wait); otherwise → editable `OrderPickingDetail` (Cancel any row regardless of status, Add new item 
with live rate/row-total preview, qty edits) — all changes held in **local draft state only**, zero 
DB writes until "Confirm & Send to Warehouse" is clicked, which diffs the draft against original 
items (cancels removed, adds new, updates changed qty) in one batch, calls 
`returnToWarehouseManager` (increments `picking_round`), shows a toast, and closes. Payment cap 
(Available+Wait value ≤ payment received) enforced live on both add and qty-edit, with red visual 
feedback; "Confirm & Send" disabled if exceeded.

**Load creation:** `db.createLoad()` generates `LD-DDMMYYYY-NN` sequential-per-day ID. `OrderFullDetail` 
gates the button via `canCreateLoad` prop (only Completed Picklist passes `true`; Order Status / 
Picking Done Report are view-only). `OrderFullDetail`'s Fill Rate/Summary/Picked-Qty/Status columns 
are gated behind `pickingStarted = ['picking_done','ready_for_load'].includes(order.picking_status)` 
— NOT just `status==='submitted_for_picking'`, since Admin can approve-for-picking before Warehouse 
Manager has actually touched it; Mgr Approved Qty column always shows, amber+asterisk-flagged when 
it differs from Order Qty.

**Consolidated tracking:** `OrderStatus.jsx` (all 3 roles: Team sees own orders only) shows every 
order's live stage label (`orderStageLabel.js` helper) regardless of who's next responsible; opens 
same `OrderFullDetail`.

**Warehouse Manager Dashboard (`WMDashboard.jsx`):** Today/Monthly toggle; tiles for 
category-wise/Orders Received/Pending Picking/Picking Complete/Orders Ready to Pick/Load List, each 
opening an embedded Sheet (no separate Picking menu — deliberately removed; all editing now lives 
on Dashboard via `PickingEditSheet`).

**Known orphaned file:** `src/components/PickingPendingTile.jsx` — fully unused (confirmed via 
global search, only self-reference), tile inside it commented out as a stopgap after mysterious 
persistent rendering (later understood to be Vite module-graph cache, not real code) — safe to 
delete, tagged for later cleanup.

**Deferred:** `createUser()` in db.js calls `supabase.auth.admin.createUser()` client-side, which 
requires the service role key — currently fails with "User not allowed" for ALL new Admin-created 
employees, not just Warehouse Manager. Workaround: create users directly via Supabase Dashboard 
Authentication → Users (Auto Confirm checked) + manual `INSERT INTO users`. Proper fix (Edge 
Function or backend endpoint) explicitly deferred until after full testing.
## Session Update — 26-29 July 2026

### New module: Vehicle Allocation, Warehouse Master, Route Mapping

**Schema:**
```sql
CREATE TABLE warehouses (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, latitude NUMERIC, 
  longitude NUMERIC, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE vehicle_allocations (id TEXT PRIMARY KEY, vehicle_id TEXT REFERENCES vehicles(id), 
  warehouse_id TEXT REFERENCES warehouses(id), status TEXT DEFAULT 'waiting_driver_acceptance', 
  created_at TIMESTAMPTZ DEFAULT now());
ALTER TABLE distributor_orders ADD COLUMN allocation_id TEXT REFERENCES vehicle_allocations(id);
-- superseded earlier vehicle_id/warehouse_id/allocated_at columns directly on distributor_orders 
-- (kept as unused legacy columns) once multi-load-per-allocation grouping was introduced
```

**`Warehouses.jsx`** (Admin-only Master CRUD): name/address/lat/long, manual entry (no geocoding yet).

**`LoadCreatedList.jsx`**: lists all orders with a `load_id`, grouped into "Awaiting Allocation" 
(checkboxes, multi-select) and "Vehicle Allocations" (one row per allocation, showing combined 
qty/weight/volume/value across all its loads). "Allocate Vehicle" flow: combined weight/volume 
totals → vehicle dropdown filtered by capacity (`weight_capacity`/`volume_capacity` on `vehicles`) 
→ warehouse dropdown → **driver dropdown** (queries `users` table directly for `role_id = 'r7'`, 
since `role_id` lives on `users` not `members` — bug fixed after driver list initially came back 
empty) → direction-conflict warning (bearing/angular-diff check between warehouse and each stop; 
>90° apart shows a warning, button relabels "Confirm Anyway" but doesn't hard-block) → Confirm 
Allocation. "Deallocate Vehicle" button reverses this (clears `allocation_id` on all linked orders, 
deletes the allocation row).

**`RouteMapSheet.jsx`**: Leaflet.js (CDN) + OSRM public routing (no Google Maps key set up yet — 
deferred per explicit decision; migration path noted: only the map-rendering + routing-fetch 
component would need replacing, schema/data layer unaffected). Uses OSRM's `/trip/` endpoint 
(`source=first&roundtrip=false`) for shortest-path stop-order optimization, not `/route/` — shows 
optimized visiting order, total distance, total time. One "View Route" per **allocation** (not 
per load) once multi-load grouping was added.

### New role: Driver (`r7`) + full accept-to-loading flow

**Schema additions to `vehicle_allocations`:** `driver_id`, `driver_accepted_at`, `reporting_hours`, 
`reporting_minutes`, `delay_comment`, `transit_time_minutes`, `vehicle_parked_at`, 
`load_supervisor_name`, `labourer_names`, `loading_started_at`, `loading_completed_at`, 
`stop_sequence` (JSONB, order IDs in reversed-optimized-route order), `current_stop_index`.
New table `load_item_progress` (allocation_id, order_item_id, lift_stack_qty, loaded_qty, status 
[pending/loading/paused/complete], pause_reason, timestamps).

**`AssignedLoads.jsx`** (Driver): 
- Accept flow — "In Transit" toggle is mutually exclusive with manual reporting time entry (not 
  additive, corrected from initial build): if in transit, browser geolocation + OSRM computes 
  journey time to warehouse and that alone becomes "Reporting Time"; if not in transit, driver 
  manually enters hours+minutes. Either way, >30min triggers a required delay-comment field, 
  gating the Accept button.
- "Confirm Vehicle Parked for Loading" button once `driver_accepted`.
- `DriverOrderConfirmTile`: shows orders at `loading_stage='wm_loaded'` awaiting driver's per-order 
  load-quantity confirmation (loaded qty vs picked qty review, simple tap-confirm, no dispute flow).

**`VehicleParkedTile.jsx` + `LoadingInProgressTile.jsx`** (Warehouse Manager Dashboard): parked 
vehicles → WM selects → `StartLoadSheet.jsx` (Supervisor name + Labourer names, single 
comma-separated field) → computes stop sequence via OSRM trip-optimization, reversed for loading 
order (last delivery stop loaded first) → `loading_in_progress`.

**`LoadingScreen.jsx`** (the core screen): per-stop, per-item. Item picker → WM manually types 
"Lift Stack" qty (cartons per labourer trip, NOT a product-master field, entered fresh each time 
per user's explicit choice) → button grid (qty ÷ lift stack, red→green on click, live header 
Loaded/Balance update) → Pause/Resume with required reason → auto-complete when loaded=picked → 
next item, repeat. Once all items for a stop are loaded: WM clicks "Send for Driver Confirmation" 
(NOT instant stop-advance) → order flips to `loading_stage='wm_loaded'` → polls every 5s for 
`driver_confirmed` → only then advances `current_stop_index`, repeats for next stop → final stop's 
confirmation → `loading_complete`.

**Deferred:** true cross-navigation/full-refresh persistence for `LoadingScreen` (planned as a 
global overlay via `useSyncExternalStore` + top-level render in `WebApp.jsx`) was explicitly 
skipped — current screen works fine nested in the tile components, kept as-is.

### Live loading-status visibility (`OrderFullDetail.jsx`)
Per-item progress bar added to the Items table (Admin/Manager/Team all see this wherever the 
component renders — Order Status, Completed Picklist, Picking Done Report), polling 
`load_item_progress` every 12s while the sheet is open (simple `setInterval`, not Supabase 
Realtime, per explicit choice). `pickingStarted` guard corrected twice: first version used 
`status==='submitted_for_picking'`, which incorrectly showed Fill Rate/Summary/Picked-Qty columns 
the moment Admin approved for picking, before Warehouse Manager had touched anything — fixed to 
`['picking_done','ready_for_load'].includes(picking_status)`. Added a separate always-visible 
"Mgr Approved" qty column (amber+asterisk-flagged when it differs from Order Qty), independent of 
the picking-started gate.

### Bug fixes this session (recurring pattern: planned code never pasted / duplicated)
- `Picking.jsx`'s `needsUpdate` list originally required `hasWaitItems()` — an order stuck at 
  `picking_done` with zero Wait items (all resolved to Available/Unavailable) became invisible to 
  Warehouse Manager entirely (matched neither "To Pick" nor "Needs Update"). Fixed: "Needs Update" 
  now shows ALL `picking_done` orders regardless of item status, since reopening/resubmitting is 
  the only path to `ready_for_load` anyway.
- `submitPicking`'s `anyWait` check only inspected active (non-cancelled) items for literal `'Wait'` 
  status — but cancelled items retaining a stale `'Wait'` value from before deletion still counted, 
  incorrectly keeping clean orders at `picking_done` forever. Fixed: skip cancelled items entirely 
  in the loop.
- `OrderPickingDetail.jsx` (Admin's add/cancel/qty-edit screen) rewritten to use a **local draft 
  array** (`localItems`) instead of writing directly to DB on every change — per explicit 
  requirement that on-screen edits should render live but only persist to the database when 
  "Confirm & Send to Warehouse" is clicked, which diffs the draft against original items in one 
  batch (cancel removed / add new / update changed qty) before calling `returnToWarehouseManager`.
- Multiple duplicate-declaration parse errors across `OrderPickingDetail.jsx`, `LoadCreatedList.jsx`, 
  `WebApp.jsx`, `db.js` (repeat instances: `fetchAllocations`, `driverConfirmParked`, 
  `fetchParkedAllocations`, `wmConfirmArrival`, `Picking` import, `suitableVehicles` split mid-line) 
  — same recurring lesson as earlier sessions: always search for existing declarations before 
  pasting new ones; several were traced to Vite's module cache surviving dev-server restarts 
  (confirmed via global search showing zero real references) rather than genuine lingering code.

### Distributors.jsx master — location fields added
Table now shows "Location" (confirmed_latitude/longitude, monospace, copyable) and a separate "Map" 
column (📍 pin, opens Google Maps in new tab) as two distinct columns per explicit request. Edit 
form extended with editable Latitude/Longitude fields (Created On/Created By remain read-only 
audit fields, not editable — deliberately excluded from the edit form since they're system-set).

### Performance issue flagged, NOT yet fixed (deferred)
App became noticeably slow after this session's polling additions (5s driver-confirm check, 12s 
bar-chart poll) stacked on the pre-existing `if (!loaded) fetchX()` anti-pattern used across nearly 
every tile component (WMDashboard, VehicleParkedTile, LoadingInProgressTile, LoadCreatedList, 
OrderApproval, OrderStatus, PickingDoneReport, AssignedLoads, DriverOrderConfirmTile — re-fires on 
every render until state settles, same root cause flagged once before with `PickingPendingTile`'s 
request storm). Supabase usage checked: nowhere near quota (76MB/5GB egress, 28MB/500MB DB) — 
compute tier is "Nano" (smallest), likely just resource-constrained under concurrent polling + 
multi-role simultaneous testing sessions. Real fix (convert render-time fetch calls to proper 
`useEffect(() => {...}, [])`) explicitly deferred to "check later."

### New feature — planned, NOT yet built: Invoice from Load (ERP cross-check + approval)
Discussed and partially scoped:
- Schema planned: `invoices` gains `order_id`, `status` (default `'approved'` — preserves existing 
  direct-entry invoices' immediate-achievement behavior unchanged), `erp_invoice_number`, 
  `erp_date`, `erp_amount`, `created_by`, `approved_by`, `approved_at`
- "Awaiting Invoice Creation" tile (Admin + Accounts) once Driver confirms Loading Complete
- "Create Invoice From Load" — auto-populated billing from order items, ERP fields entered 
  alongside, soft-warning (not hard-block) if ERP amount differs from computed total
- New invoices default to `status='pending_approval'`; only Admin approval flips to `'approved'`, 
  at which point sales/target achievement should credit (existing direct-entry invoices unaffected 
  since they default straight to `'approved'`)
- PDF: confirmed browser print-to-PDF (`window.print()`) is sufficient, no PDF library needed
- **Blocked/paused:** needed to see `useData.jsx` (invoice fetch → `computeAchievements` wiring) and 
  `achievementEngine.js`'s `computeAchievements` function before writing the approval-gating filter, 
  to avoid breaking existing achievement calculation for pre-existing direct-entry invoices — these 
  two files were requested but not yet provided; **pick up here next session**.