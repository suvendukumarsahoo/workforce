# WorkForce — Project Reference

Solo dev: Suvendu Kumar Sahoo, Bhubaneswar. React+Vite frontend, Supabase backend, deployed
workforce-zeta-one.vercel.app. GitHub repo public (risk — switch to Netlify for private repo before
commercial launch).

> This file is a **current-state reference**, not a session log. It describes what the app does and
> how it's built today, not the history of how each feature got there. Full build history (every
> session's narrative, false starts, and corrections) lives in git log/diff on this file if ever
> needed — nothing here is lost, just not repeated on every load.

## Architecture Rules (never violate)
- ALL Supabase calls go through `src/lib/db.js` + `src/lib/supabase.js` only — this is the sole
  migration boundary to AWS if ever needed.
- Roles table: `id` is manual text (`r1` Admin, `r2` Manager, `r3` Accounts, `r4` HR, `r5` Sales Team,
  `r6` Warehouse Manager, `r7` Driver). `menus` and `actions` are `jsonb` arrays.
- `role_id` lives on `users` table, NOT `members`. To find users of a role: query `users` directly,
  never filter `members.role_id` (it doesn't exist).
- Menu convention: internal `id` stable, `label` can be renamed freely without breaking `roles.menus`
  permission data.
- Coding style: exact file+location instructions, plain-text find/replace (no diff syntax),
  paste-ready code blocks, verify paste landed (large pastes have truncated mid-tag before).

## Recurring Bug Patterns (check these first when something's "missing")
1. **Code given but never pasted/saved** — verify with Ctrl+F before assuming a bug is new.
2. **Duplicate declarations** from repeated partial pastes — search for function/import name,
   confirm exactly 1 match before adding.
3. **PostgREST ambiguous FK** — any table with 2+ FKs to the same target needs explicit
   `table!constraint_name` aliasing in `.select()`. Hit repeatedly: `attendance_punches` (2 FKs to
   `users`), `attendance_rule_users` (2 FKs to `users`). Also watch for columns whose FK constraint
   points to `users(id)` but the app actually stores `members.id` values in practice (schema comment
   lies) — `retail_visits.member_id` and `secondary_orders.member_id` are both this trap; PostgREST
   embeds against `members` on these columns fail outright ("could not find a relationship") even
   though the values line up — resolve the name client-side against the already-loaded `members`
   list instead of embedding. Also hit when a table has its own denormalized pointer *back* into
   something that also points at it — `secondary_orders.delivery_id → secondary_order_deliveries.id`
   plus `secondary_order_deliveries.order_id → secondary_orders.id` gives PostgREST two valid paths
   between the same two tables, so a plain `delivery:secondary_order_deliveries(...)` embed errors
   with `PGRST201` (needs `secondary_order_deliveries!secondary_orders_delivery_id_fkey`). Unlike the
   `member_id` case above, this one **doesn't fail loudly in the app** — `{ data, error }` still
   returns from the client, and if the caller doesn't check `error` (as `stockReport.js`'s Sales
   fetch didn't, initially), the embed just silently comes back `null`/empty and every downstream
   number computes as if nothing happened — caught only by checking real numbers against hand
   computed expectations during live verification, not by any crash or visible symptom. Whenever
   adding a denormalized "back-pointer" column alongside an existing reverse FK, assume the ambiguity
   and alias explicitly from the start rather than waiting to hit it.
4. **Stale Vite module cache** surviving dev-server restart — if global search shows zero real
   references but a component still renders, delete `node_modules/.vite` or hard-refresh + restart.
5. **`if (!loaded) fetchX()` render-time fetch pattern** — flagged in several older tile components,
   causes request storms on re-render. Proper fix is `useEffect(() => {...}, [])`. New code should
   never use this pattern; not proactively swept from old code.
6. **Menu list duplicated in up to 3 places, drifts out of sync** — `WebApp.jsx`'s `ALL_MENUS` (Admin/
   Manager sidebar), `Settings.jsx`'s own separate `ALL_MENUS` (role-permission checkboxes), and
   `TeamApp.jsx`'s `MORE_ITEMS` (Sales Team's own shell) are three independent arrays, not shared
   imports. **Any new menu id must be manually mirrored into all applicable ones**, or it becomes
   either unreachable or invisible in the permissions screen. A role's `roles.menus` box must also be
   checked in Settings before that role can actually see a new menu — this is a manual rollout step,
   not a code bug, for every new feature.
7. **IST (UTC+5:30) local-date vs `toISOString()`'s UTC date** — `toISOString()` lands on the wrong
   calendar day for any event between ~12:00–5:29am local time. Fixed multiple times already
   (`db.js`'s `todayStr()`, `period.js`'s `getCurrentPeriod()`, `secondary_orders.order_date`,
   `retail_visits.visit_date`) — always compute local date parts directly (`getFullYear()`/
   `getMonth()`/`getDate()`), never `toISOString().slice(0,10)`, for any new date-stamped write.
8. **`react-hooks/purity`**: `Date.now()`/`new Date()` can't be called directly during render —
   capture one value up front (`const now = new Date()`) and derive everything from it. Building a
   cumulative array with a mutated closure variable inside `.map()`/`Array.from()` is also flagged —
   use an immutable `.reduce()` instead.
9. **Recharts `RadialBarChart` (`MeterGauge`) needs an explicit angle-axis domain** — without
   `<PolarAngleAxis type="number" domain={[0,100]} angleAxisId={0} tick={false} />`, a single-point
   gauge always renders as a full circle regardless of real percent (already fixed everywhere
   `MeterGauge` is used, but any new radial gauge needs this too).
10. **A background `TOKEN_REFRESHED` auth event must never reach `setLoading(true)` in
    `useAuth.jsx`** — Supabase silently fires this via `onAuthStateChange` whenever a backgrounded
    tab regains focus, indistinguishable from a real sign-in unless the event name is checked.
    `App.jsx` unmounts the *entire* app tree (`WebApp`/`TeamApp`/`PunchInGate` and everything under
    them) while `authLoading` is true, so letting a token refresh trip that flag wipes any
    in-progress form/cart/draft the instant someone switches tabs and comes back. Fixed once
    (`db.js`'s `onAuthChange` now forwards the real event name; `useAuth.jsx` ignores
    `TOKEN_REFRESHED` outright and only ever shows the splash on the true first load via
    `hasLoadedRef`) — any future auth-related edit must preserve this filter.
11. **No table besides `vehicle_locations`/`distributor_celebrations` gets live cross-user
    updates** — `useData.jsx`'s `loadAll()` only ran once per login; one user's change was invisible
    to another already-logged-in session until something forced a refetch (previously only the
    token-refresh remount above did this, unreliably). `DataProvider` now also silently
    (`loadAll(true)`, no spinner, no unmount) re-fetches everything on `visibilitychange` (tab
    regains focus) plus a 60s floor poll while logged in, guarded against overlapping calls via
    `loadingRef`. This is a polling/focus-refresh floor, not true Realtime — up to ~60s lag is
    expected; if that's ever not good enough for a specific table, extend it with a real
    `postgres_changes` subscription (same pattern as the two tables above) rather than shortening
    the poll interval further.
12. **A statement ending without a semicolon, immediately followed by a line starting with `(`,
    silently merges into a function call on the previous line** — classic JS ASI trap, hit building
    `pendingTasks.js`: `const stages = cond ? A : B\n(distributors || []).filter(...)` parsed as
    `(cond ? A : B)(distributors || [])`, i.e. calling whichever array `A`/`B` was as a function. The
    symptom is a runtime `TypeError: X is not a function` naming something that is very obviously
    not meant to be called — not a lint error (the file is syntactically valid, just not what was
    meant). Only a risk when a `(`/`[`/backtick-led line follows a real statement (an assignment,
    a call) — the same pattern immediately after an opening `{` is always safe (nothing precedes it
    to merge with). Semicolon (or a leading `;` on the new line) fixes it; this codebase's style
    otherwise omits semicolons freely, so this is worth a second look specifically wherever a
    multi-line chain starts with `(`.
13. **`ui.jsx`'s `Btn` destructive-action variant is `v="bad"`, not `v="danger"`** — `Btn` falls back
    silently to the default gray style (`BTN_STYLES[v] || BTN_STYLES.def`) for any unrecognized `v`,
    so passing `"danger"` produces no error and no visual warning at all that anything's wrong — a
    "Reject"/"Not Delivered"/destructive button just quietly renders as a plain default button
    instead of red. Caught by inspection while building Order Delivery, not by any tool. The full
    variant set is `def`/`pri`/`ok`/`bad`/`gh`/`warn` — check `BTN_STYLES` in `ui.jsx` rather than
    guessing a variant name for any new destructive/warning action.
14. **Grouping/matching by a date string instead of the entity's real id silently conflates two
    different records that happen to share a date** — `computeStockTakePeriods`'s periods only
    carried `from`/`to` as date strings until this was hit; both the Discrepancy Report generator
    (`StockTakeEntry.jsx`, matched a just-created period via `p.to === take.take_date`) and the Stock
    & Sales Report's Detail tab (grouped rows via `` `${from}|${to}` ``) picked up **every** period
    ending on that date once two physical stock takes for the same distributor landed on the same
    calendar day (a same-day recount is a completely normal thing to do) — silently merging two
    distinct periods' numbers into one, no error, no crash, just wrong/duplicated rows. The
    Detail-tab version was worse: with no distributor in the key at all, two *different* distributors
    counted on the same day would have merged too. Fixed by adding a real `takeId` to each period
    object and keying/matching on that instead — caught live during verification (two rows for the
    same product with conflicting numbers), not by inspection. Whenever a period/event has both a
    date and a real row id, key on the id; a date string is never guaranteed unique on its own.

## Data Model Quick Reference
- **Roles**: `r1` Admin, `r2` Manager, `r3` Accounts, `r4` HR, `r5` Sales Team, `r6` Warehouse
  Manager, `r7` Driver.
- **`members` vs `users`**: `users` is login/role identity (all 7 roles). `members` is the
  Sales-Team-and-Driver-only roster (`member_id` on `users` links them; most Admin/HR/Manager/
  Accounts/WM users have no `members` row). `members.manager_id` (→ `users.id`) is the general
  employee→Manager link (added for the Late Present/Half Day attendance rules). Sales-Team-specific
  manager assignment (goal hierarchy) also uses `members.manager_id` — same column, one hierarchy.
- **Generated ID formats** (sequential, count-then-pad, per day/entity): `LD-DDMMYYYY-NN` (loads),
  `SO-DDMMYYYY-NN` (secondary orders), `BT-NNNN` (beats), `RO-NNNN` (retail outlets),
  `DS-{memberId}-DDMMYYYY-{seq}` (Distributor Secondary day-summary/retailing-complete batches, one
  member can have several per day), `PST-DDMMYYYY-NN` (physical stock takes), `DL-DDMMYYYY-NN`
  (secondary order deliveries), `SDR-DDMMYYYY-NN` (stock discrepancy reports).
- **No leave/holiday calendar anywhere in the app** — "Absent" simply means "no punch recorded for a
  past calendar day," weekends included.
- **RLS disabled across all tables** — flagged pre-launch requirement, not yet addressed.

## Module: Distributor Order → Picking → Load → Delivery Pipeline

**Status flow (`distributor_orders.status`):** `order_submitted` → `manager_approved_admin_pending`
→ `confirmed` → `submitted_for_picking` → (picking sub-flow) → *(in practice, never advances further
— `confirmPicking`, the only function that would set `picking_confirmed`, has zero call sites
anywhere in the app; every order past picking effectively stays at `submitted_for_picking` forever,
tracked instead via `picking_status`/`load_id`/`loading_stage`/the allocation's own `status`)*.

**Picking sub-flow (`distributor_orders.picking_status`):** `pending_picking` → `picking_done` (has
any non-Available item) → `ready_for_load` (all Available) — Admin creates a Load only when
`ready_for_load` AND zero Unavailable among active items.

**Key files:**
- `DistributorOrder.jsx` (Sales Team, create/edit orders, local-draft pattern, payment cap
  validation, native `<select>` product picker whose `<option>`s carry inline color per
  `stock_status`).
- `OrderApproval.jsx` (Manager+Admin approve → `OrderFullDetail` read-only+CreateLoad if clean, or
  `OrderPickingDetail` editable if not).
- `OrderPickingDetail.jsx` (cancel/add/qty-edit — local draft only, nothing hits DB until
  "Confirm & Send to Warehouse," which diffs+batches all changes). Shared by three audiences via a
  `canEdit = isReviewer || (isAdmin && !order.review_assigned_to)` derivation — `isAdmin` alone no
  longer gates editing (see Delegated Order Review below).
- `WMDashboard.jsx`: tiles — Orders Ready to Pick, Pending Picking, Picking Complete, Load List,
  Vehicle Parked for Loading, Loading In Progress.
- `OrderFullDetail.jsx`: shared read-only detail (Order Status, Picklist, Delivery card). Used by
  `OrderStatus.jsx` across all 4 roles.
- `Warehouses.jsx` / `Vehicles.jsx` (masters). `LoadCreatedList.jsx`: unallocated loads → Allocate
  Vehicle (capacity check, driver dropdown filters out **locked** drivers — see Driver Lock-out
  below) → direction-conflict warning → `vehicle_allocations` row. `RouteMapSheet.jsx`: Leaflet+OSRM
  (no Google Maps key — migration point is this one component).

**Delegated Order Review** (`distributor_orders.review_assigned_to`/`review_requested_at`/
`review_requested_by`) — when Admin opens a not-fully-picked order from Order Approval's "Completed
Picklist," Admin can either edit it directly (unchanged default) or delegate that review via a new
"Send for Review" button: `db.sendOrderForReview` resolves the target as the order creator's Manager
(`members.manager_id`, same manager-lookup pattern as `OrderStatus.jsx`) or, if that rep has no
manager mapped, the order creator's own `users.id` — and stamps all 3 columns. Once delegated,
Admin's own view of that order goes read-only with a "⏳ Pending review by {name}" banner
(`isPendingReviewByOther`) until the assignee acts; no re-delegation chain (the "Send for Review"
button itself is hidden once `review_assigned_to` is set, from every viewer). The delegate lands in
their own queue: Manager gets a new "Sent for Your Review" card on `OrderApproval.jsx`
(`isReviewer={true}` passed into the same `OrderPickingDetail.jsx`); the order-creator fallback
surfaces on their own Home tab via `src/components/OrdersForReviewCard.jsx` (mirrors
`StockTakeScheduleCard.jsx`'s self-contained fetch+card shape), dropped into `TeamApp.jsx`'s
dashboard tab. Whoever actually confirms — Admin directly, the Manager, or the rep — the existing
`returnToWarehouseManager` call (unchanged otherwise) also clears all 3 review columns, dropping the
order out of whichever queue it was sitting in. No notification on delegation (v1 scope).

**Driver (r7) flow** — own bottom-tab shell in `WebApp.jsx` (`isDriver = role?.id==='r7'`), 3 tabs:
`assignedLoads` (`AssignedLoads.jsx` — accept load, confirm vehicle parked), `driverLoadingConfirm`
(`DriverOrderConfirmTile.jsx` — per-order load-qty confirm), `driverJourney`
(`AllocationJourneyTile.jsx` — invoice checklist → journey → per-stop delivery → return-to-base).
`LoadingScreen.jsx`: per-stop→per-item→Lift Stack→qty÷lift button grid→Pause/Resume→auto-complete→
driver-confirmation poll→next stop. Not globally persistent across navigation (by design). The
actual stop-advance/loading_complete **write** happens inside `db.driverConfirmOrderLoaded` itself
(fired the moment the driver confirms) — not inside `LoadingScreen.jsx`'s poll, which only
re-syncs its own local UI to whatever already happened. Fixed a real stuck-forever bug this way:
the write used to live only in that poll, which stopped running the moment the WM closed the
screen, so a driver confirming while the WM wasn't watching left the allocation at
`loading_in_progress` forever even though every order was already `driver_confirmed` — no manual
DB fix needed for existing stuck rows either, `db.fetchInProgressAllocations` self-heals any
allocation whose orders are all already `driver_confirmed` on every load.

**Driver lock-out**: a driver is locked (unavailable in Allocate Vehicle's dropdown) iff they have
any `vehicle_allocations` row with `status != 'completed'` — derived purely from that column, no
separate boolean (`db.fetchDriversWithLockStatus()`).

**Invoicing**: `invoices.status` (`pending_approval`→`approved`, default `'approved'` for legacy
direct-entry rows). `AwaitingInvoiceTile.jsx` groups awaiting-invoice orders by `allocation_id`.
`InvoiceApprovalTile.jsx` (Admin+Accounts) approves. `achievementEngine.js` gates on
`invoice.status === 'approved'` — pending invoices don't count toward achievement.
`src/lib/printInvoice.js` — PDF via `window.print()`, no library.

**Delivery/Transit Tracking (Journey Phases 1–4)** — fully built, schema applied, browser-confirmed:
- **Phase 1**: invoice-gated 3-item checklist (Collected Invoice/Waybill/Informed Distributor) →
  Start Journey → `RouteMapSheet.jsx` computes OSRM route, stores `route_plan` → `status='in_transit'`
  → per-stop Arrived (`db.markArrived` etc.) → cross-role stage display via `orderStageLabel.js`.
- **Phase 2**: live GPS (`vehicle_locations` table, driver's `watchPosition` throttled ~1 ping/45s
  while the Journey tab is mounted) → Admin's `VehicleLiveMap.jsx` (Supabase Realtime subscription,
  real WebSocket) with idle-alert (>30min stationary) via `notifications`. **The live-position ping
  chain itself was never verified with a real moving device** — everything else in Phase 2 confirmed
  working; this one piece is explicitly deferred until tested with real field movement.
  `vehicle_locations` retention/pruning also explicitly deferred (grows forever, cheap for now).
- **Phase 3**: per-stop lifecycle — Arrived → Start Unloading → Delivery Complete (captures GPS) →
  Next Stop / Return to Base (last stop) → 3-item return checklist → Submit Journey Complete →
  **`JourneyApprovals.jsx`** (Admin-only approval, the *only* path to `status='completed'`) → this is
  also what clears the driver lock-out.
- **Phase 4**: `JourneyVeinTimeline.jsx` + `src/lib/journeyTimeline.js` (`buildJourneyEvents`,
  `journeySummary`, shared `CATEGORY_COLOR`) — connected-dot vertical timeline of every driver
  activity from Accept Load through Return to Base, on both `JourneyApprovals.jsx` (admin, with a
  remarks field + PDF export via `src/lib/printJourney.js`) and the driver's own Journey tab
  (read-only "Completed Journeys" list, no PDF button there).

**Still deferred**: POD photo upload (needs a new Supabase Storage bucket, not started — nothing in
this codebase uses Supabase Storage yet). No reject/timeout/escalation path anywhere in the journey
pipeline — matches this app's convention of approve-only flows.

## Module: Goals & Performance

**Monthly Goals architecture** — Manager sets parameter scope (`Parameters.jsx`, per member per
calendar month, `period` = `YYYY-MM`) → Sales Team sets goal values (`TeamApp.jsx`'s
`GoalEntrySheet`) → locks on submit → Manager approves/rejects **per field** (`GoalApprovals.jsx`) →
per-field-approved triggers achievement tracking for that field, every calendar month. Both
`parameters` and `goals` are period-scoped rows (`unique(member_id, period)`).

- **`src/lib/period.js`** — pure date helpers: `getCurrentPeriod()`, `monthRangeForPeriod()`,
  `rangeForTab(tab, now)` (Today/Month/Year → `{from,to}` JS Dates, shared by every tab-scoped
  dashboard panel in the app), `resolvePeriodsInRange()`, `listRecentPeriods()`.
- **`src/lib/achievementEngine.js`** — pure, `computeAchievements(invoices, goals, products,
  distributors, visits, retailVisits, retailOutlets, secondaryOrders, dateRange)`. Achievement is
  gated **per-field** (`goal.<field>_status === 'approved'`), not by the goal's overall status.
  `getGoalOverallStatus` returns `'partial'` if ANY field is rejected, regardless of other fields'
  states (a rejected field must always be user-editable). Distributor Secondary's `secondary_value`/
  `secondary_orders`/`productive_outlets` loops count an order only once its **delivery outcome is
  confirmed** (`secondary_orders.delivery_status` is `'full'` or `'partial'`), dated by that order's
  `delivery.delivered_date` — NOT merely once Retailing Complete locks it into a batch (dated by
  `order_date`), which was the original rule. Changed so these three figures actually reconcile
  against the Stock & Sales Report's own Sales figure (`stockReport.js`'s `flattenSales`) — both now
  share the same "delivered, net of any partial-delivery returns, dated by delivered_date" math;
  `secondary_value` explicitly nets out returned qty the same way. A `pending` (not yet marked either
  way) or `not_delivered` order counts toward neither report — it hasn't moved any goods yet. Found
  live: a rep's Secondary Value on Team Snapshot didn't match the Stock & Sales Report's Sales total
  for the same distributor even after accounting for pending/not-delivered orders — root cause was
  these fields being order-taking-based while Stock Report was delivery-based, two irreconcilable
  definitions; not a numeric bug once traced. `fetchSecondaryOrders` (db.js) now embeds
  `delivery:secondary_order_deliveries!secondary_orders_delivery_id_fkey(delivered_date,
  delivery_items(...))` (same ambiguous-FK alias as the Stock Report's own fetch, Bug Pattern #3) so
  every consumer of the global `secondaryOrders` context has what it needs. `TeamSnapshot.jsx`'s own
  "Distributor Secondary" raw-activity stat tiles and `Dashboard.jsx`'s Admin/Manager rollup section
  mirror this same gating by hand (not by calling into `achievementEngine.js`) — same duplicated-
  filter drift risk as Recurring Bug Pattern #6, keep all three in sync on any future change here.
  The **Distributor Secondary Order Report** (`DistributorSecondaryReport.jsx`, below) deliberately
  keeps its own, different scope — every completed-batch order regardless of delivery outcome, dated
  by `order_date` — since its job is showing what a rep *booked*, not what was delivered; it no longer
  shares a definition with the achievement engine, unlike before this change. "Distributors Created"
  achievement (`acq`) is deliberately **ungated** (counts the
  real pipeline event unconditionally) so it always matches the pipeline's own "Distributor Created"
  tile — only the *goal target* number still requires approval.
- **`src/lib/goalAggregation.js`** — `aggregateForMembers(memberIds, slices, products, categories,
  customers)`, the single aggregation function reused at every drill level. A **slice** = one
  period's `{goalsMap, paramsMap, achievementsMap, weight}`.
- **Auto "Other Distributors" target** — `goal.customers.__other__`, auto-computed as `Sales Value
  goal − sum(named distributor targets)` on every goal submit, inherits `value_status` (no
  independent approval). Applies even with distributor-wise tracking off (in that case it's the
  entire Sales Value goal).
- **Terminology**: goal-setting UI is display-labeled "Distributor" everywhere (`customers` in code
  is unchanged — `enable_customers`, `sel_custs`, `ach.custs`, etc. — display-only rename).
- **Dashboards** (all reuse `MeterGauge`/`ContributionDonut`/`GoalVsAchievedBreakdown`/`NeedleGauge`
  from `src/components/charts/GoalBarChart.jsx`, colors from `src/lib/categoryColors.js`):
  - **`GoalsStatus.jsx`** (menu id `targets`, label "Goals Status") — Admin sees org-wide, Manager
    sees own team only (`members.manager_id`). Sales Value hero gauge, Top-3 podium, Distributors
    Created gauge, Retail Visits (raw `retail_visits` count, own donut+total), Category Breakdown
    (`NeedleGauge` per category, own identity color), Roster table, member drill via
    `MemberGoalDetail.jsx`. Always "this month," no period picker.
  - **`Dashboard.jsx`** (Admin/Manager shared page) — `SalesSnapshot.jsx` (dark widget: Today/Month/
    Year tabs, non-cumulative per-period Line revenue trend, Manager Leaderboard →
    `ManagerLevelSheet`/`MemberGoalDetail` drill w/ `zIndex=320` to stack correctly, Recent Orders,
    Orders Under Process/Stale stats, Top 10 Customers/Products w/ dual-tone share bars), the New
    Customer Visits funnel (same tab-scoping as SalesSnapshot, lifted `tab` state), then (Admin-only,
    `role.id==='r1'`) 5 more dark-panel rollup sections: **Distributor Secondary** (raw
    Today/Month/Year activity, `onNavigate` link to the Order Report), **Warehouse**, **Driver**,
    **HR**, **Accounts** — each a condensed summary + one-level drill + "View full X" handoff to the
    already-built rich page (not full parity, deliberately). Manager sees only Sales + their own
    Distributor Secondary team section.
  - **`TeamSnapshot.jsx`** (Sales Team's own Home tab in `TeamApp.jsx`) — light "CRM dashboard"
    style: 5 colored stat tiles, My Pipeline donut + Top Distributors, Won Deals & Revenue (fixed
    trailing 12 months, not tab-scoped), Goal Progress meters + Products/Categories/Distributors
    breakdown (always this month), Distributor Secondary raw stats + `onNavigate` link to the Order
    Report. All tab-scoped figures (Won/Win Rate/Open Leads/pipeline donut) are computed from raw
    records inside this component, not pre-aggregated upstream, so tab-switching actually changes
    the numbers.
- **Admin-only Reset Goal** (`GoalApprovals.jsx`, `db.resetGoal`) — zeroes a member's goal for a
  picked period back to `'draft'` without deleting the row.

## Module: Distributor Pipeline (New Customer → Distributor)

New Customer Visit (`NewCustomerVisit.jsx`) → Interested/Not Interested/Final → Manager approval
(`DistributorApproval.jsx`) → Registration → Document Submit Wizard (haversine, 30km competitor
check) → Payment → Admin verify → `distributors.type` flips to `'Distributor'`,
`lead_stage='final_approved'`. Both screens' write paths are instrumented via `db.logActivity` (see
Activity Log below).

**Distributor-Created Celebration** — the instant `markPaymentReceived` (Admin's final "Payment
Received" click) succeeds, an org-wide, any-role, live celebration broadcasts to every currently
logged-in session: 5s of CSS-animated flying balloons, a synthesized cheer tone (Web Audio API,
no audio asset), and the avatar of whichever member logged the *first* visit on that distributor
(earliest `distributor_visits.visit_date` for that `distributor_id`, resolved client-side against
the already-loaded `visits`/`members` from `useData()` — credits whoever originally found the lead,
not necessarily who closed it). Own dedicated table + Supabase Realtime channel —
`distributor_celebrations` (`db.createDistributorCelebration`/`subscribeDistributorCelebrations`,
same `postgres_changes` INSERT-subscribe shape as `vehicle_locations`/`subscribeVehicleLocations`),
**not** the existing `notifications` table (see Deferred/Known Issues below — that table is
schema-drifted and already broken). Fire-and-forget from `DistributorApproval.jsx`, same
non-blocking convention as `logActivity`. `src/components/CelebrationOverlay.jsx` is mounted once,
globally, in `App.jsx` for every logged-in user regardless of role — `position:fixed`,
`pointer-events:none`, queues multiple celebrations one at a time via a ref queue. Reuses `ui.jsx`'s
existing `Av` avatar component; falls back to a plain 🎉 when the distributor has no visit on record
(a real data gap, not treated as blocking — matches this app's "not a rep's problem to fix a
data-master gap" convention from stock-take geofencing).

**Catch-up for late logins** — the Realtime subscription above only reaches sessions already open at
the exact moment a celebration fires; anyone not logged in yet misses it with no way to see it later.
`CelebrationOverlay.jsx`'s second effect covers this: on every login (keyed off `currentUser` from
`useAuth`, so it fires once per real sign-in, never on a background tab-refocus — see the
`TOKEN_REFRESHED` fix above) it reads a per-user `localStorage` watermark
(`wf_celebration_lastSeen_{userId}`, keyed per user not per browser since devices get shared across
roles in this app) and calls `db.fetchDistributorCelebrationsSince(lastSeen)` to enqueue anything
missed into the same playback queue. The very first time a given user+browser is ever seen, no
watermark exists yet — that run only sets the baseline to "now" and plays nothing, so shipping this
feature (or a brand-new user's first-ever login) never floods them with the app's entire celebration
history; only genuinely-missed events from that point forward ever catch up. The watermark always
advances to "now" after each check regardless of whether anything was found, so the same gap is never
re-queried twice.

## Module: Distributor Secondary (Beats, Retail Outlets, Secondary Orders)

Sales-Team-only field-sales tool (`src/pages/shared/DistributorSecondary.jsx`, reached via
`TeamApp.jsx`'s More menu — **not** registered in `WebApp.jsx`, Admin/Manager have no equivalent
day-to-day tool, only the read-only Order Report below). Flow: pick a **Distributor** first → its
**Beats** (`beats` table, coverage days descriptive-only) → a beat's **Retail Outlets**
(`retail_outlets`) → cart-style item order (category pills, qty steppers, respects product
`stock_status`) or "No Order" with a reason → **Ongoing Orders** tab (today's not-yet-locked orders,
Edit/Delete) → **Retailing Complete**.

**Multi-batch Retailing Complete**: locks all currently-unlocked orders for the day into a new
**batch** (`day_summaries` row, id `DS-{memberId}-DDMMYYYY-{seq}`, `secondary_orders.batch_id`
stamped to match). If further orders are taken after a batch locks, Retailing Complete automatically
re-enables (new orders start `locked:false`) and confirming creates the *next* sequential batch —
each batch's own PDF receipt is scoped to only its own orders. The live **Day Summary** tab (outlet-
wise/product-wise rollup) always shows the whole day regardless of batch count.

**Achievement hook**: every retail-outlet visit (order or no-order) writes a `retail_visits` row —
this is the source for the dedicated Distributor Secondary goal fields below, NOT the general
"New Customer Visits" goal (that reverted to `distributor_visits`-only).

**Distributor Secondary goal category** (4 fields, same scope→submit→approve handshake as every
other goal field): **New Outlets**, **Productive Outlets**, **Total No. of Orders**, **Value** — all
gated on completed batches (`batch_id` set), not raw order/visit counts.

**Unit conversion** (Distributor Secondary's cart only — `DistributorOrder.jsx`/picking/invoicing
are untouched): products optionally have a **Lowest Unit** and **Alternate Unit**, each with a
factor relative to the existing `unit` column (UI-labeled "Base Unit"). `src/lib/unitConversion.js`
— `availableUnitsForProduct`, `toBaseQty`. Rate always stays per Base Unit; the cart converts to
base-unit-equivalent before totaling, so downstream (Day Summary, PDF/ZIP export, achievement) reads
genuinely base-unit quantities untouched by which unit the rep picked.

**Distributor Secondary Order Report** (`src/pages/shared/DistributorSecondaryReport.jsx`, menu id
`distributorSecondaryReport`, reachable by all 3 audiences — Sales Team's own activity, Manager's own
team, Admin org-wide with an added Sales Rep filter) — **Summary** tab: one row per (batch ×
distributor × beat) combination, with a **Total Items** column that counts item *lines* across the
group's orders, not a summed quantity — summing qty across different products would add mismatched
units together (Litres + Units + Pieces), the same class of mistake the Stock & Sales Report's own
totals row (`allSameUnit`) exists to avoid; caught live as a nonsensical "132.05 items" figure. Also
carries a per-row **Stock Return / Stock Delivered / Delivery Pending** breakdown (orders + value each)
splitting that group's Total Value by delivery outcome — same delivered-net-of-returns math as
`stockReport.js`'s `flattenSales`/`achievementEngine.js`'s Value gating (see Goals & Performance
above), computed inline in `DistributorSecondaryReport.jsx` rather than shared, since this report
needs it per-row/per-group rather than per-member. A `'full'` order's whole value counts as
Delivered; `'not_delivered'` counts its whole value as Return (nothing reached the outlet, so it
effectively all came back); `'partial'` splits across **both** — its net-of-return portion under
Delivered and its returned portion under Return — so a partial order is counted in both the Return
and Delivered "orders" tallies at once, and those two counts (plus Pending) deliberately don't sum
back to Total Orders; unset/`'pending'` status counts its whole value as Pending (outcome not yet
marked). Verified live: every row's Delivered value + Return value + Pending value sums exactly back
to that row's Total Value. `fetchSecondaryOrdersForReport` (db.js) embeds `delivery` the same way as
every other reader of this relationship (`!secondary_orders_delivery_id_fkey` alias, Bug Pattern #3).
Drilling into a row opens an order-no-wise list → full read-only order detail
(`src/components/SecondaryOrderDetailSheet.jsx`, a shared component — also used by Order Delivery
below — reuses `printSecondaryOrder.js`'s existing PDF). **Detail** tab: flat
itemwise rows. Both filterable (Distributor/Beat/Sales Rep/date range) and exportable to PDF
(`jspdf-autotable`, this app's first paginated-table PDF) and Excel (`xlsx`, first Excel export ever
in this app — carries 2 known high-severity npm-registry CVEs SheetJS no longer patches; accepted
since this feature only writes exports, never parses untrusted input). Report scope is **completed
batches only** (`batch_id is not null`), dated by `order_date`, regardless of delivery outcome — a
deliberately different, order-taking scope than the achievement engine's own delivery-confirmed
definition (see Goals & Performance above); this report's job is showing what a rep *booked*, the
live Day Summary's is "everything today," neither is "what got delivered" (that's the Stock & Sales
Report / Order Delivery module instead).

Reachable via "View Report" links from all three Distributor Secondary dashboard panels above.
`WebApp.jsx`'s `onNavigate`/`goTo` accepts an optional second `params` arg (threaded as a sibling
`navParams` prop to every page) so a click-through can pre-fill/lock the Report's date range —
`GoalsStatus.jsx`'s link arrives **locked** to that period's month (a Goals figure only means
anything for the exact month it was computed over); `Dashboard.jsx`/`TeamSnapshot.jsx`'s links
arrive unlocked, pre-filled to whichever Today/Month/Year tab was active. `TeamApp.jsx` (no generic
`onNavigate`) mirrors the same concept locally via a `reportParams` state + callback prop.

**`src/lib/printSecondaryOrder.js`** — single-order PDF + batch ZIP (`jszip`, real individual PDF
files, not one combined document). **`src/lib/printDaySummary.js`** — per-batch/day-summary PDF.

**Order Delivery** (`src/pages/shared/SecondaryOrderDelivery.jsx`, menu id `secondaryOrderDelivery`,
same 3-way audience as the Order Report — Sales Team's own, Manager's own team, Admin org-wide)
tracks whether a locked secondary order's goods actually reached the retail outlet, separately from
the order itself. **Pending** = `batch_id is not null && cancelled = false && delivery_status =
'pending'` — same "completed batch" scope as the achievement engine/Order Report, but deliberately
**no age limit**: stays pending indefinitely until acted on
(`db.fetchSecondaryOrdersForReport`'s `from`/`to` are optional for exactly this — Order Delivery is
the one caller that omits them). Only the rep who took the order marks its delivery (they're the one
who'd actually know, e.g. on a next visit) — Manager/Admin get a read-only rep-wise rollup that
drills into the same batch/order views but without any action buttons.

**Schema**: `secondary_orders.delivery_status` (`pending`/`full`/`partial`/`not_delivered` — deliber-
ately not reusing `cancelled`, which already means something else entirely: the order itself voided
*before* it locked) + `delivery_id`, denormalized onto the order row so the dashboard can filter/sum
directly off `secondary_orders` (already global `useData()` context) with no second query or embed —
same reasoning as the `member_id` FK-embed trap in Recurring Bug Pattern #3, applied pre-emptively.
One `secondary_order_deliveries` row per order (id `DL-DDMMYYYY-NN`, same count-then-pad local-date
convention as `SO-`/`LD-`/`PST-`/`DS-`) records who/when/what outcome — created even for a bulk batch
action, just many at once, so "a delivery id against an order id" always holds 1:1 regardless of how
it was reached. `secondary_order_delivery_items` (`order_item_id`, `returned_qty`) only gets rows for
a **partial** delivery, and only for lines that actually had a return — full/not-delivered orders need
no item rows at all (0 returned / fully returned is implicit, not stored).

**Two different dates, on purpose**: `marked_at` (timestamptz, always `now()`) is an audit stamp of
when the app action happened — never used to date anything downstream. `delivered_date` (plain
`date`, rep-entered via a date field on every mark-delivered action, defaulting to today but
editable) is the real fact — the Stock & Sales Report's Sales figure is dated by this, exclusively
(see that module below). Validated client-side against two independent floors, whichever is later
wins (`effectiveMinDate` in `SecondaryOrderDelivery.jsx`): never before the order's own `order_date`
(for a batch-level bulk action or the shared field on the order-drill sheet, that's the *latest*
`order_date` among every order the date applies to, since a date valid for the latest is
automatically valid for every earlier one too) — **and never on or before that distributor's latest
physical stock take date**, hard-blocked (disabled Save, not a soft warning) with a specific message
naming the discrepancy report that already exists for that period. That second floor exists because
a Discrepancy Report is an immutable snapshot the moment a stock take happens — a delivery
back-dated to on/before that date would silently change what Sales *should* have been for an already
-frozen period without ever updating the report, permanently diverging the live ledger from its own
snapshot. Fetched per distributor actually appearing in the rep's own pending orders
(`db.fetchStockTakesForDistributors`, latest `take_date` per distributor), not the whole scope.

**Reduce-taps flow**: pending orders group by `batch_id` (one Retailing Complete run). The fast path —
tapping a pending batch offers **Mark All Fully Delivered** / **Mark All Not Delivered** in one action
across every still-pending order in it (`db.markOrdersDelivered`, bulk insert + per-order update).
**Partial** at the batch level does no bulk write at all — it just opens that batch's order list,
where the same three-way choice repeats *per order* (Full/Not Delivered fire immediately; only an
order-level **Partial** opens the item-qty entry sheet, `db.markOrderPartiallyDelivered`). The
order-drill sheet holds a local snapshot of its orders (not a live view), so both action paths splice
the just-processed order(s) out of that snapshot immediately (closing the sheet outright once nothing
pending remains in it) rather than waiting on the next background reload to stop showing them as
actionable — caught as a real staleness bug during build, fixed before shipping.

## Module: Distributor Physical Stock Take & Stock/Sales Report

A distributor's stock is tracked by **scheduled physical counts**, not an auto-derived ledger — a
Manager sets a stock-take cadence per distributor, HR must approve it, and once approved it drives
both a schedule on the Sales Team member's own page and a hard block on that day's punch-in once a
count goes overdue.

**Schedule (`distributor_stock_take_rules`, one row per distributor)** — Manager authors/edits via
`src/pages/manager/StockTakeSchedule.jsx` (menu `stockTakeSchedule`): Frequency
(Weekly/Fortnightly/Monthly, fixed 7/14/30-day intervals — Monthly is *not* calendar-month-aware, by
explicit choice) + a Deviation Limit in days (1–7, the grace window past the due date). **Not a
one-time/locked setup** — editable any time. Every edit writes only to the row's `pending_*`
columns (`db.upsertStockTakeRule`) and fires an HR notification
(`createNotification({target_roles:['r4']})`) — the currently-**active** (last-approved)
`frequency`/`deviation_limit_days` keeps governing the gate/schedule undisturbed until HR acts, so
an in-flight proposal can never silently override what's actually in effect. HR (+ Admin) approves
via `src/pages/shared/StockTakeRuleApprovals.jsx` (menu `stockTakeRuleApprovals`,
`db.approveStockTakeRuleChange`/`rejectStockTakeRuleChange`) — approving copies `pending_*` into the
active columns and clears them; rejecting just clears `pending_*`, active config (if any) untouched.

**Cycle anchor**: a newly-approved schedule doesn't start counting from the approval moment — it
starts from the covering rep's *next punch-in* ("frequency is calculated immediately from next
punch in of team"). `first_anchor_date` sits on the rule row for exactly this bootstrap; once a real
stock take exists for that distributor, its `take_date` always wins over `first_anchor_date` in due-
date math (`src/lib/stockTakeSchedule.js`'s `computeDueStatus`) — the column becomes moot after the
first count. `db.bootstrapStockTakeAnchors` is called opportunistically (from `PunchInGate.jsx`'s
stock-take check, idempotent, no scheduled job) rather than needing a cron.

**Punch-in gate (`src/components/PunchInGate.jsx`, r5/Sales Team only)** — a new `useEffect`
parallel to the existing punch-check one resolves the rep's own distributors, fetches their rules +
latest stock takes, and runs `computeDueStatus` per distributor. `state==='overdue'` (past the
deviation deadline) **blocks that day's punch-in entirely**, replacing the normal punch card with a
full-screen "Physical Stock Take Required" view that embeds `StockTakeEntry` directly (no routing —
`PunchInGate` sits above `TeamApp`'s own tab state, so it renders the form itself, queue-style: one
overdue distributor at a time, `onDone` pops to the next). `state==='warn'` (within 2 days of the
deadline) is a soft, non-blocking banner on the normal punch card. This only affects the
not-yet-punched-today path — never retroactively locks someone out after they've already punched in.

**Physical count entry (`src/pages/team/StockTakeEntry.jsx`)** — needs no approval (ground-truth
data capture, not a contestable figure). **Exhaustive by design**: every active product gets a line,
including explicit 0s — a product simply absent from a take means "not recounted," a distinct fact
from "counted as zero" that the report must preserve (see below). Reused three ways: embedded in
`PunchInGate`'s forced overdue screen, `TeamApp.jsx`'s `stockTakeEntry` menu tab (voluntary/early
counts, via a distributor-picker wrapper), and `src/components/StockTakeScheduleCard.jsx` (the
always-visible, non-blocking schedule card on the Sales Team's own Home tab, "Take Stock Now" per
row — same due-status logic as the gate, so the two can never disagree). Take date is always the
real current local date (`createStockTake`'s count-then-pad `PST-DDMMYYYY-NN`, same local-date
convention as `SO-`/`LD-`) — never user-editable.

**Pending-deliveries confirmation gate** — since Sales is now real (sourced from Order Delivery, see
below), a count taken while this distributor still has undelivered batches won't have those orders'
outcomes reflected in that period's Sales yet. `StockTakeEntry.jsx` checks
`db.fetchPendingDeliveryBatchesForDistributor` on mount; if any exist, it shows them (grouped by
batch, with order count + value) in place of the count form, with a "Confirm & Proceed" button —
soft, same convention as the geofence warning below, not a block. Skipped entirely (straight to the
count form) when there's nothing pending, so it never adds friction to the common case.

**Discrepancy report generation** — the moment `createStockTake` succeeds, `StockTakeEntry.jsx`
fires (fire-and-forget, a failure here must never undo or hold up a stock take that already saved)
`generateDiscrepancyReport`: re-fetches this one distributor's stock takes/receipts/secondary-
orders/opening-stock and runs `computeStockTakePeriods` (stock-take-anchored — **used exclusively
here**, never by the live Stock & Sales Report below, see that section for why conflating the two
was a repeated mistake this module's history keeps correcting), pulls out the period that just
closed (matched on the new take's own id, not its date — two takes for the same distributor can
share a calendar date, and a date-string match would ambiguously pick up both), and persists it via
`db.createDiscrepancyReport` into `stock_discrepancy_reports`/`_items` (id `SDR-DDMMYYYY-NN`, same
count-then-pad local-date convention as every other generated id here). Each report is an
**immutable snapshot** — the numbers are stored as computed at that moment, not re-derived later, so
a later-edited invoice or return can't silently rewrite history. Viewable via the Stock & Sales
Report's own "Discrepancy Reports" tab (below).

**Geofencing (distributor proximity, separate from the punch-in overdue gate above)** — on save,
`StockTakeEntry.jsx` captures the rep's current position and compares it to the distributor's
`confirmed_latitude`/`confirmed_longitude` via `haversineMeters` (`src/lib/geo.js`, same helper
`PunchInGate.jsx` uses for HQ deviation). `distributor_stock_takes` carries `lat`/`lng`/`distance_m`/
`location_flag` (mirrors `attendance_punches`' own lat/lng/distance/flag columns) so every count's
actual location is on record regardless of outcome. Currently **soft-warn only**
(`GEOFENCE_HARD_BLOCK = false` — a single named constant, deliberately kept as the one line to flip
when this becomes a real block): outside `GEOFENCE_RADIUS_M` (100m) shows one combined toast
("Stock take saved · ⚠ Xm from Y's location — recorded anyway") and still saves — two separate
`showToast()` calls back-to-back was tried first and silently lost the warning (the app only shows
one toast at a time, second call clobbers the first before it's readable), so the warning is folded
into the single post-save toast instead. A distributor with no confirmed coordinates on file skips
the check entirely (allowed through unverified — nothing to check against, not a rep's problem to
fix a Distributor-master data gap).

**Stock & Sales Report (`src/pages/shared/DistributorStockSalesReport.jsx`, menu
`distributorStockSalesReport`, same 3-way audience as the Secondary Order Report)** — **has nothing
to do with physical stock-take dates.** This took three passes to land on: first a period *header*
grouping Detail's rows by stock-take window, then a Period-From/To dropdown pair still anchored to
take dates — both reverted. It's a plain **date-range ledger**, same convention as every other
date-filtered report in this app (`DistributorSecondaryReport.jsx`'s own From/To): real
`<input type="date">` fields, defaulting to the current calendar month, freely editable, with zero
relationship to when a physical count happened. For whatever `[From, To]` range is picked, per
distributor+product: **Opening** = the one-time approved Opening Stock baseline plus every
Receipt/Sale dated *before* `From`; **Receipts**/**Sales** = real transactions dated *within*
`[From, To]`; **Closing** is always `Opening + Receipts − Sales` — this report never touches a
physical count at all. Physical counts and their variance live entirely in the separate Discrepancy
Reports tab below, generated independently by `StockTakeEntry.jsx`.

**Two independent pure functions in `src/lib/stockReport.js`, deliberately never sharing a caller**:
`computeStockLedger` (this report — takes `from`/`to`, no stock-take input at all) and
`computeStockTakePeriods` (the Discrepancy Report only — takes real `stockTakes` rows, no user-picked
range). Both share the same underlying event-flattening helpers (receipts/sales/opening-baseline) so
the *math* can't drift between them, but their calling contract is intentionally incompatible —
`computeStockLedger` cannot be handed stock takes, `computeStockTakePeriods` cannot be handed a
manual date range. Since Receipts/Sales are fetched all-time/unbounded regardless (`from`/`to` are
never sent to the server), changing the date range in the UI is a pure client-side recompute — no
refetch, `DistributorStockSalesReport.jsx` keeps the raw fetched invoices/secondary-orders/opening-
stocks in state and re-runs `computeStockLedger` reactively.

**Summary tab** = one row per (Distributor, Product) with that range's Opening/Receipts/Sales/Closing
— only for combinations that have *some* history (an approved Opening Stock entry, or at least one
real receipt/sale ever for that distributor); not a full distributor×product cross-product, which
would be almost entirely empty rows. **Detail tab** = flat itemwise — one row per actual Receipt
line and one row per actual Sale line that falls inside the range, each showing its real date and a
Receipt/Sale type tag — genuinely different transactions, not periods. Both tabs' PDF/Excel exports
stay flat (qty and value as separate columns each) regardless of the on-screen qty+value stacking.

**Every quantity also shows its value** (`QtyValue` component, stacked qty-then-₹-value in the same
cell) — Receipts/Sales value comes from the real per-line transaction rate (already on the invoice
line / delivered order item); Opening/Closing have no transaction of their own (point-in-time
balances, not events), so those are valued off the product's master `price` instead.

**Totals row** (bottom of Summary, Detail, and each Discrepancy Report's item table, on-screen only —
exports unchanged) — always sums the ₹ **value** columns, since value is comparable across products;
quantity is only summed alongside it when every row currently in view shares one `unit`
(`allSameUnit` in `DistributorStockSalesReport.jsx` — summing "3 Litres + 5 Units" would be
meaningless), otherwise the quantity cell shows `—` while value still totals correctly (e.g. all
distributors/all products shows `—` qty + a real ₹ total; filtering to one Product shows both).

**Receipts** now sources from `invoices` (`db.fetchReceiptsForStockReport`), not
`distributor_order_items.final_qty` directly — the invoice is the authoritative billed-quantity
record, and can exist with no linked order at all (legacy/manual entries, `invoices.order_id null`,
pre-dating the digital order pipeline). An order-linked invoice only counts once the driver has
actually confirmed delivery (`order.delivered_at` set, Journey Phase 3's Delivery Complete — same
gate as before, just checked via the invoice's embedded order rather than the order directly); a
legacy invoice has nothing to confirm against, so it counts as soon as it's `status='approved'`.

**Opening Stock (`distributor_opening_stocks`/`_items`)** — the very first period for a distributor
defaults Opening to 0 unless a **one-time manual baseline** has been entered and approved — missing
one is never a blocker, just means 0. `distributor_id` is that table's own primary key (not a
generated id) — this is what enforces "entered once, ever" at the database level; a second
submission attempt simply fails the insert. Anyone with report access can start the entry
(`db.submitOpeningStock`, one qty field per product, inline in `DistributorStockSalesReport.jsx`
rather than a separate page — it only ever matters in this report's context) — needs **Manager then
Admin** sign-off, sequential, before either `computeStockLedger` or `computeStockTakePeriods` will
actually use it as a baseline (`status`: `pending` → `manager_approved` → `approved`,
`db.approveOpeningStockManager`/`approveOpeningStockAdmin`). The UI gate is strict about the
sequencing — Admin never sees (or can act on) a `pending`-stage row, only `manager_approved` ones,
otherwise an Admin clicking through would silently record itself as the Manager-stage approver and
the two-stage requirement would mean nothing. No reject/edit path in v1, matching this app's general
approve-only-flow convention.

**Discrepancy Reports tab** (3rd tab, alongside Summary/Detail — **no Period filter here**, it's
already just a flat chronological list of discrete events, one per physical stock take) — each row
is a title (report id + distributor name) and its period (`{from_date}` → `report_date`, both stored
on the header row at generation time since every item in one report shares the same period), plus a
variance-count badge. Clicking one opens the itemized breakdown as a genuine **table** — the report's
identifying info (id, distributor, period, and the stock take's real date **and time** via the
embedded `take:distributor_stock_takes` — `db.fetchDiscrepancyReports` — since `take_id` has no
reverse FK back from `distributor_stock_takes`, unlike the `secondary_order_deliveries` case, this
embed is unambiguous) sits in the Sheet's header/title as narration, not repeated per row; the table
itself is **deliberately just the closing-stock comparison** — Product +
Calculated-Closing/Physical-Closing/Variance (each cell qty+value stacked, same `QtyValue` component
as the main report), no Opening/Receipts/Sales columns. An earlier pass included those too; reverted
— they already live in the Stock & Sales Report itself, and repeating them here just duplicated that
report instead of giving this one a clear, single job. `StockTakeEntry.jsx`'s generator only computes
and stores the closing-stock fields for the same reason (the unused opening/receipts/sales columns on
`stock_discrepancy_report_items` are left in the schema for old rows, just no longer written to).
Numbers shown are exactly as computed at that stock take's moment, unaffected by anything that's
happened to the ledger since.

All figures are already base-unit-equivalent (invoice lines and secondary-order items are both
already base-unit-equivalent quantities; physical counts via `unitConversion.js`'s `toBaseQty`, same
as Distributor Secondary's cart) — "report in the highest unit" is just display formatting: base-unit
qty as-is, labeled with the product's Base Unit, rounded to 1 decimal (`stockReport.js`'s `round1`,
display-time only — the underlying computation stays unrounded). `computeStockTakePeriods` still
carries the last known Physical Closing forward across any take that skipped a product, rather than
treating a skip as zero (unchanged, Discrepancy Report only). Export reuses `printSecondaryReport.js`'s
generic `downloadReportPdf`/`downloadReportExcel` as-is.

## Module: Attendance & HR

**Punch-In System** — every employee (all 7 roles) punches in once per calendar day before reaching
the app (`PunchInGate.jsx`, wraps both `WebApp`/`TeamApp`). Keyed by `users.id` (not `members.id` —
most non-Sales/Driver roles have no `members` row). Two-stage HR/Admin approval per punch: Stage 1
(punch-in itself) and Stage 2 (that day's activity) — a day only shows green "Present" once both are
approved. `db.punchIn()` defends the `unique(user_id,date)` constraint (duplicate insert treated as
success). Self-view: `MyAttendanceCalendar.jsx`. Legacy `attendance` table/`db.fetchAttendance` is
fully superseded and orphaned — safe to delete, not yet done.

**Punch-time gating rules** (`src/pages/shared/AttendanceRules.jsx`, menu id `attendanceRules`,
"Daily Attendance Rules," under a renamed "HR Functions" sidebar section) — HR authors a rule
(scoped to a role) → Admin approves the **rule setting** once (a `RuleDetailSheet` review, not a
one-click approve) → HR then **maps specific users** into it (no separate approval needed for
mapping itself, via `attendance_rule_users`, decoupled from the rule row). 4 rule types on tabs:
- **Late Present / Half Day** (post-hoc classification, resolved via a 1-or-2-stage waiver workflow):
  threshold (grace minutes) + Approver 1 (Manager or HR; if Manager, Approver 2 is auto HR). Half Day
  supersedes Late Present when both thresholds are crossed. An unapproved instance, past a
  configurable count (`attendance_rule_settings`, Admin-only), escalates into an extra "Effective
  Absent" on the roster — a derived, live-computed count, not a stored counter. Waiver caps per
  approver-role per employee per month, also Admin-configurable. "Waiver Counts" card (Admin) —
  By Employee / By Approver tabs, month-picker.
- **Punch Deviation / Early Punch** (real-time gates at the moment of punching in, no waiver
  workflow) — threshold (metres from HQ / minutes before duty time) + **Action**: Allow (silent) /
  Don't Allow (hard block, no punch row created) / Allow with Warning (existing confirm-and-flag UX).
  `resolvePunchGateRule` picks the most-restrictive matching rule. `users.allowed_deviation_m`
  remains the fallback for anyone not covered by an approved Punch Deviation rule (unchanged
  soft-warn behavior). Both stages can trigger on the same punch — flag reasons join with `; `.

**`AttCal`** (shared calendar, `ui.jsx`) — solid saturated colors (green Present / red Absent /
violet Pending / amber Today), not the original pastel palette.

**HR Dashboard vs Attendance Approval (split)**:
- **`Attendance.jsx`** (menu `attendance`) is now an HR Dashboard for HR/Admin, restyled after a
  reference dashboard (Tipsoi) the user pointed at — same light Card/Tile styling as the rest of the
  app, not a dark reskin: 4 ring-style hero stat tiles (`RingStat`, plain SVG progress ring + %, not
  recharts — six-plus of these can sit in one row) for Present/Absent/On Time/Late (Present = punched
  in today, independent of approval status — On Time + Late always sums back to it), plus plain
  `Tile`s for Total Employees/Pending Approvals below; **Role-Wise Attendance** — one compact
  center-labeled donut per role (`RoleDonut`), all fitting one row, shared legend below — stands in
  for the reference's per-department donuts since WorkForce has no Department field, Role is the
  closest existing grouping; **Late Today** / **Absent Today** two-column card (the reference's
  second card is "On Leave," which has no real equivalent — no leave/holiday calendar in this app —
  so "Absent Today" fills that slot with real data instead), each row with avatar, role, Line Manager
  (resolved via `users.manager_id`, blank when unset) and a per-user monthly recurrence count;
  **Attendance Feed** — simplified chronological punch list (avatar, name, time, relative "Xm/h/d
  ago"), no status badge; then, kept unchanged below all of the above: `AttendanceTrendChart`
  (Present/Absent/Late per day), Manpower Production Issues card, and the **Attendance Roster** —
  summary rows only (P/X/A/Rate + badges), tapping an employee opens a `RosterCalendarSheet` with
  their full month calendar; tapping a day inside that opens a **read-only** `AttendanceDayDetailSheet`
  (no approve buttons).
- **`AttendanceApprovals.jsx`** (menu `attendanceApprovals`, HR/Admin-only) — Stage 1 + Stage 2
  approval queues, moved off the dashboard entirely. Opens the same `AttendanceDayDetailSheet`
  (`src/components/AttendanceDayDetailSheet.jsx`, shared component) but **fully actionable**
  (`readOnly=false`) — all approving happens exclusively here now.
- Non-HR/Admin roles (including Manager) see `MyAttendanceCalendar.jsx` on `attendance`; Manager's
  own waiver-approval queue lives on the Daily Attendance Rules page instead.

**Activity Log** (`activity_log` table, `db.logActivity`/`db.fetchActivityLog`, non-blocking
soft-fail) — feeds Stage 2's "Activity Details" as a connected-dot **vein diagram**
(`src/components/VeinTimeline.jsx`, `src/lib/activityTimeline.js`) for non-driver roles only
(Driver's Stage 2 stays journey-based, untouched). Instrumented write paths so far: Invoice/Goal/
Expense approvals, Products/Distributors/Settings master-data edits, order submit/edit, order/
picking/loading approvals and confirmations, journey-complete approval, New Customer Visit +
Distributor Approval pipeline. Not yet instrumented: Vehicles/Warehouses/Categories/Employees master
screens — explicit follow-up, not started.

**`Employees.jsx`** — the real `users` CRUD screen also carries HQ lat/long, Approved Deviation
Limit, Duty Reporting Time, and Reporting Manager (`manager_id`) fields. No cycle-guard on
`manager_id` (a Manager could be assigned as their own report) — low risk, not defended against.

## Module: Warehouse — Daily Stock Update / Production Issues (3M)

**`StockUpdate.jsx`** (WM-only, menu `stockUpdate`) — every product, grouped by category, WM sets
**Available / Wait / Unavailable** (persistent, not daily-reset) which drives
`DistributorOrder.jsx`'s product `<option>` styling/selectability. Independent 3M **Issues** checklist
per product (Material/Machinery/Manpower × 2 reasons each, `src/lib/productionIssues.js`) — does NOT
drive the status dropdown. Setting status back to Available auto-resolves any active issues (and
manually unticking logs the same way) via `db.resolveProductIssues`, writing to
`product_issue_resolutions` (append-only, gives each resolved issue its own timestamp).
**`ProductionIssues.jsx`** (Admin+WM) — Itemwise / Issuewise / Resolved tabs. Manpower-only issues
also surface on the HR/Admin Attendance dashboard.

**Total Picked Qty** — `StockUpdate.jsx` shows, per product, the total quantity currently picked
(`availability==='Available'`) across orders still in the picking pipeline — **excludes orders
already loaded onto a vehicle** (`loading_stage` reaching `'wm_loaded'`/`'driver_confirmed'`; that
column defaults to the *string* `'pending'`, not null, so the exclusion check is an explicit
allow-list, not a falsy check). Load creation/vehicle allocation alone don't exclude an order, only
actual physical loading does. Clicking the total opens a distributor-wise breakdown by order number.

## Module: Geographical / Maps

**`DistributorPresenceMap.jsx`** (menu `geoBusinessView`, "Geographical Business View," standalone
page) — every billable distributor (`type !== 'New Customer'`, includes both `'Distributor'` and
`'Direct'`) plotted on a fixed Odisha-centered Leaflet+OSM map (`setView`, not `fitBounds` — a wide/
short container vs. a roughly-square bounding box zooms out too far with `fitBounds`), colored by
billing recency (green this month / orange last 3 months / red older-or-never). District + state
boundary overlays (`public/data/odisha-districts.geojson`/`odisha-state.geojson`, CC BY 4.0 from
DataMeet, static, non-interactive, state outline drawn in a deeper navy over the district hairlines).

**`VehicleLiveMap.jsx`** (menu `vehicleLiveMap`, "Live Tracking") — see Journey Phase 2 above.

## Module: Pending Tasks Bell

Cross-cutting, every role — the bell icon (`src/components/PendingTasksBell.jsx`) mounted in
`WebApp.jsx` (desktop sidebar top, mobile top bar, and the Driver shell's own top bar — all 3
non-Team layout branches) and `TeamApp.jsx` (Sales Team's header, next to Logout — this shell had no
bell at all before). Replaces the old `NotificationBell.jsx`, deleted outright — that component read
the `notifications` table, which CLAUDE.md's Deferred/Known Issues section already flagged as
schema-drifted and silently empty for every call site; this isn't built on `notifications` at all.

**`src/lib/pendingTasks.js`** — `fetchPendingTasks({ currentUser, role, hasMenu, context })`, pure
aggregation of every "needs your action" queue this app already has: Order/Goal/Invoice/Expense/
Distributor/Journey/Stock-Take-Rule/Attendance/Waiver approvals, Sales Team's own Order-Review/
Pending-Visits/Stock-Take-overdue items, Warehouse's Ready-to-Pick/Pending-Picking, Driver's
Assigned-Loads-awaiting-acceptance. Each category reuses the **exact same fetch + filter** its own
source page already uses (e.g. Expense Approval's `expenses.filter(e => e.status === 'pending')` is
identical to `WebApp.jsx`'s own sidebar badge computation) — deliberately, so this can never drift
from what the source page itself shows (the same drift risk flagged for menu lists in Recurring Bug
Pattern #6 applies to any duplicated filter, not just menu arrays). Categories backed by data already
in `useData()` context (goals/invoices/expenses/distributors) cost no extra fetch; everything else
(orders, journey/stock-take-rule/attendance/waiver approvals, picking, driver allocations) is a
lightweight role-gated fetch — a category's queries only fire at all if `hasMenu(itsMenuId)` is true
for the current role, so a given user only ever triggers the handful of fetches relevant to them.

**v1 scope, deliberately**: tapping a task navigates to that category's existing page/tab (`nav`, a
plain menu/tab id both `WebApp.jsx`'s `goTo` and `TeamApp.jsx`'s `setTab` already understand) — not a
deep link into the exact record. True per-record auto-open ("land on this one order, already
scrolled/expanded") would require adding "open record X" support to each of the ~12 target pages
individually (none of them support it today — `navParams` is otherwise only consumed by
`DistributorSecondaryReport.jsx`, for a date-range prefill, not record-level opening); deferred as
its own follow-up rather than done all at once.

**Refresh**: `PendingTasksBell.jsx` fetches on mount (once `useData()`'s own `loading` flag confirms
the global context has actually populated — see the race-condition note below), on `visibilitychange`,
and on a 60s poll — same freshness floor as `useData.jsx`'s own live-refresh mechanism, not true
Realtime. An in-flight/dirty-flag guard (`inFlightRef`/`dirtyRef`) makes a call that arrives while one
is already running re-fire immediately after the current one finishes, instead of silently dropping —
without this, the very first fetch (which starts the instant `currentUser` is set, before `useData()`'s
own initial `loadAll()` has necessarily resolved) would compute against empty `goals`/`expenses`/etc,
then get permanently stuck on that empty snapshot once `useData()` populates moments later, since a
naive "skip if already loading" guard just drops that update instead of queuing a redo. Caught this
exact bug live during verification (badge showed 0 while the sidebar's own Expense Approvals badge
showed a real 4) before shipping.

## Deferred / Known Issues (not blocking, revisit later)

- **`notifications` table is schema-drifted and every call site has likely been silently failing**
  — `db.js`'s `createNotification`/`fetchNotifications`/`markNotificationRead` read/write
  `target_roles`/`title`/`body`/`ref_id`/`read`, but the live table's actual columns (confirmed via
  direct REST column probes) are `id`/`type`/`created_at`/`message`/`member_id`/`is_read` — an older
  schema this code was never migrated to match. Every existing call site (idle-alert Phase 2,
  stock-take rule change notifications) has been inserting/querying against columns that don't
  exist. Found while building the Distributor-Created Celebration (which deliberately uses its own
  `distributor_celebrations` table instead, see above) — not fixed as part of that work, since it's
  unrelated in scope. Needs either a migration to add the columns the code expects, or a rewrite of
  the code to match the live schema.
- **`createUser()` needs a `service_role` key** — client-side `auth.admin.createUser()` fails "User
  not allowed" for every new employee. Real fix = Edge Function, parked. Manual workaround, every
  new employee:
  1. Supabase Dashboard → Authentication → Users → **Add user** → email + password → check "Auto
     Confirm User" → copy the generated **User UID**.
  2. If Sales Team (`r5`) or Driver (`r7`), first create their `members` row (Table Editor →
     `members` → `name`/`avatar`/`color`; `manager_id` can be set later) — every other role skips
     this, `member_id` stays `NULL`.
  3. Insert the `users` row:
     ```sql
     insert into users (name, email, role_id, member_id, avatar, color, auth_id)
     values ('Full Name', 'email@example.com', 'r5', 123, 'AN', '#3b82f6', 'paste-the-auth-uid-here');
     -- role_id: r1 Admin, r2 Manager, r3 Accounts, r4 HR, r5 Sales Team, r6 Warehouse Manager, r7 Driver
     -- member_id: members.id from step 2, or NULL if not sales/driver
     ```
     Optional (Attendance): `hq_latitude`, `hq_longitude`, `duty_start_time`, `allowed_deviation_m`
     (defaults to 20). They can log in immediately with the step-1 email/password once this row exists.
- **Products not tagged to a warehouse** — no per-warehouse stock linkage anywhere in the schema;
  explicitly deferred to a later, separate session.
- **Members/driver master has no create/edit UI** — `members` rows created directly in Supabase;
  `createMember`/`updateMember`/`deleteMember` in `db.js` are unused. Deferred.
- **POD photo upload** — needs a new Supabase Storage bucket (first use of Storage in this app),
  not started.
- **`vehicle_locations` retention** — grows forever, no pruning; cheap for now, deferred.
- Performance: the `if (!loaded) fetchX()` render-time fetch pattern in older tile components causes
  request storms on re-render — flagged, not fixed.
- RLS disabled across all tables — pre-launch requirement, not addressed.
- Google Maps migration path open — currently Leaflet+OSRM, swap point is `RouteMapSheet.jsx` only.
- `npm audit` flags a pre-existing high-severity `react-router`/`react-router-dom` advisory,
  unrelated to any work done here — `--force` would be a breaking routing change, out of scope.

## Dev Environment Notes

- No chromium-cli/Playwright available by default in this Windows dev environment for most of this
  project's history — many features were verified via `vite build` + scoped `eslint` only at build
  time. The **`run-workforce` skill** (installs Playwright into the scratchpad, not the repo) is now
  the established way to actually drive the app end-to-end against live Supabase data — use it for
  any future verification pass. Its SKILL.md Gotchas section covers real traps already hit: Settings'
  role tabs sort alphabetically (default tab is rarely the one you want), a checkbox's DOM `checked`
  state updates before React's async save reconciles (don't trust a screenshot taken immediately
  after a click), the sidebar menu list has its own internal scroll region a full-page screenshot can
  miss, and a `fullPage: true` screenshot can catch a Recharts `Pie` mid-remount-animation looking
  blank even though it renders fine non-`fullPage` (a Playwright+Recharts interaction, not an app
  bug).
- Verification convention for every change: `vite build` clean + scoped `eslint` on touched files,
  compared against a `git stash` baseline to prove no new regressions (this codebase carries a known,
  stable set of pre-existing lint errors — `WebApp.jsx`'s `SideContent` static-component warning +
  unused `Btn`, `Settings.jsx`'s unused `Inp`, `ui.jsx`'s 2 `react-refresh/only-export-components`,
  and a handful of others — none of which should be "fixed" incidentally while touching those files
  unless that's the actual task).
- Schema changes are always applied manually by the user via the Supabase SQL editor — verify
  application via a direct read-only REST probe (curl + anon key from `.env.local`, RLS is disabled
  app-wide) before assuming a migration landed, rather than trusting either party's "should be done."
