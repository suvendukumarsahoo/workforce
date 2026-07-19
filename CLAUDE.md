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