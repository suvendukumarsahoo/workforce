# WorkForce — Project Reference (Consolidated)

Solo dev: Suvendu Kumar Sahoo, Bhubaneswar. React+Vite frontend, Supabase backend, deployed 
workforce-zeta-one.vercel.app. GitHub repo public (risk — switch to Netlify for private repo before 
commercial launch).

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
1. **Code given but never pasted/saved** — happens constantly. Always verify with Ctrl+F before 
   assuming a bug is new.
2. **Duplicate declarations** from repeated partial pastes — search for function/import name, 
   confirm exactly 1 match before adding.
3. **PostgREST ambiguous FK** — any table with 2+ FKs to same target needs explicit 
   `table!constraint_name` aliasing in `.select()`.
4. **Stale Vite module cache** surviving dev-server restart — if global search shows zero real 
   references but a component still renders, delete `node_modules/.vite` or hard-refresh + restart.
5. **`if (!loaded) fetchX()` render-time fetch pattern** — used across most new tile components. 
   Causes request storms on every re-render. FLAGGED, NOT FIXED — proper fix is `useEffect(() => 
   {...}, [])`. App has been running slow (login/data taking 3-4 refreshes); Supabase usage is far 
   under quota (Nano compute tier likely just resource-constrained under polling + multi-tab testing).
6. **Menu list duplicated in two files, drifts out of sync** — `WebApp.jsx`'s `ALL_MENUS` (used for
   routing + sidebar/bottom-nav) and `Settings.jsx`'s own separate `ALL_MENUS` (used for the
   role-permission checkboxes) are two independent arrays, not a shared import. Found 2 Aug 2026:
   Settings.jsx's copy was missing ~12 entries added over prior sessions (including `assignedLoads`
   itself) — Admin had no way to toggle those via the UI at all. Fixed by backfilling Settings.jsx's
   list, but **any new menu id added to `WebApp.jsx` must be manually mirrored into `Settings.jsx`**
   or it'll be invisible in the permissions screen again.

## Core Business Modules (stable, working)
- **Goals/Targets**: **MONTHLY as of 2 Aug 2026 session** (see "Monthly Goals + Org→Manager→Member
  Dashboard" below for full detail) — Manager sets parameter scope → Sales Team sets goal values →
  lock on submit → Manager approves/rejects per-field → per-field-approved triggers achievement
  tracking for that field, **every calendar month**, not once. Achievement computed exclusively from
  `invoices`/`distributor_visits`/`distributors`, gated per-field (not by the goal's overall status).
- **Distributor pipeline**: New Customer Visit → Interested/Not Interested/Final → Manager approval → 
  Registration → Document Submit Wizard (haversine, 30km competitor check) → Payment → Admin verify 
  → `type` flips to 'Distributor', `lead_stage='final_approved'`.
- **Roles/permissions**: Settings-managed, takes effect next login only.

## Distributor Order → Picking → Load → Delivery Pipeline (current, most active area)

**Status flow (distributor_orders.status):** `order_submitted` → `manager_approved_admin_pending` → 
`confirmed` → `submitted_for_picking` → (picking sub-flow) → `picking_confirmed`

**Picking sub-flow (distributor_orders.picking_status):** `pending_picking` → `picking_done` (has 
any non-Available item) → `ready_for_load` (all Available) — Admin creates Load only when 
`ready_for_load` AND zero Unavailable among active items.

**Key files:**
- `DistributorOrder.jsx` (Team, create/edit orders, local-draft pattern, payment cap validation)
- `OrderApproval.jsx` (Manager+Admin approve, "Completed Picklist" table routes to either 
  `OrderFullDetail` read-only+CreateLoad if clean, or `OrderPickingDetail` editable if not)
- `OrderPickingDetail.jsx` (Admin cancel/add/qty-edit — LOCAL DRAFT ONLY, nothing hits DB until 
  "Confirm & Send to Warehouse" which diffs+batches all changes)
- `Picking.jsx` — DEPRECATED, functionality moved into `WMDashboard.jsx` tiles + `PickingEditSheet.jsx`
- `WMDashboard.jsx`: tiles — Orders Ready to Pick, Pending Picking, Picking Complete, Load List, 
  Vehicle Parked for Loading, Loading In Progress (each opens its own Sheet/screen)
- `OrderFullDetail.jsx`: shared read-only detail (Order Status, Completed Picklist, Picking Done 
  Report). `pickingStarted` gate = `['picking_done','ready_for_load'].includes(picking_status)` — 
  NOT `status==='submitted_for_picking'` (Admin can approve-for-picking before WM touches anything). 
  Has live per-item loading progress bar (12s poll). "Mgr Approved" qty column always visible, 
  amber-flagged if ≠ Order Qty.
- `OrderStatus.jsx`: consolidated cross-stage view, all 3 roles (Team sees own only).

**Load/Vehicle/Warehouse:**
- `Warehouses.jsx` (Admin master: name/address/lat/long, manual entry)
- `Vehicles.jsx` (master: vehicle_number/type/weight_capacity/volume_capacity in cu.ft)
- `LoadCreatedList.jsx`: unallocated loads (checkbox multi-select) → "Allocate Vehicle" (combined 
  weight/volume check vs vehicle capacity, warehouse dropdown, driver dropdown via `users` role_id 
  query) → direction-conflict warning (bearing >90° apart) → `vehicle_allocations` row created, 
  multiple loads share one allocation. "Deallocate Vehicle" reverses.
- `RouteMapSheet.jsx`: Leaflet+OSRM (no Google Maps key yet — deferred, migration = swap this one 
  component only). Uses `/trip/` endpoint for stop-order optimization.
- Load ID format: `LD-DDMMYYYY-NN` (sequential per day).

**Driver + Loading (r7 Driver role):**
- Driver has its own nav shell in `WebApp.jsx` (`isDriver = role?.id === 'r7'`) — bottom icon tab
  bar instead of the sidebar, since Driver's menu list is short. Currently 3 tabs, each its own
  menu id/page (was one page with 2 tiles stacked in it — split 2 Aug 2026 session so the bottom
  bar has more than one button): `assignedLoads` ("My Loads" — accept load / confirm vehicle
  parked, in `AssignedLoads.jsx`), `driverLoadingConfirm` ("Confirm Loading" — per-order load-qty
  confirm, `DriverOrderConfirmTile.jsx` used directly as a page), `driverJourney` ("Journey" —
  invoice checklist → Start Journey → per-stop Arrived, `AllocationJourneyTile.jsx` used directly
  as a page). Both tile components now render a friendly empty state instead of `return null` when
  their list is empty, since as standalone pages a blank screen under a tab reads as broken.
- `AssignedLoads.jsx`: Accept flow (in-transit toggle mutually exclusive w/ manual reporting time; 
  >30min total requires delay comment) → "Confirm Vehicle Parked" — unlocks WM's next-stop advance
  once the separate `driverLoadingConfirm` tab confirms load qty.
- `VehicleParkedTile.jsx` + `LoadingInProgressTile.jsx` (WM Dashboard) → `StartLoadSheet.jsx` 
  (Supervisor+Labourer names, computes reversed-optimized stop sequence) → `LoadingScreen.jsx`.
- `LoadingScreen.jsx` (core): per-stop→per-item→Lift Stack (WM types manually, NOT a product-master 
  field)→button grid (qty÷lift, click=green+adds to loaded)→Pause/Resume w/ reason→auto-complete→ 
  "Send for Driver Confirmation" (polls 5s for driver's tap-confirm)→next stop, reverse-delivery-order. 
  NOT globally persistent across navigation (explicitly deferred — works fine as-is nested in tiles).

**Schema (all applied):** `vehicle_allocations`, `warehouses`, `load_item_progress`, 
`distributor_orders` gained ~15 columns (allocation_id, load_id, load_created_at, picking_status, 
picking_updated_at, picking_round, loading_stage, driver_load_confirmed_at, + legacy unused 
vehicle_id/warehouse_id/allocated_at from pre-allocation-grouping design).
`distributor_order_items` gained availability/wait_days/cancelled.
`products` gained weight, length/breadth/height + PER-DIMENSION units (length_unit/breadth_unit/
height_unit, each independently feet/inch) + stacking_norm; volume = generated column converting 
each dimension to feet individually before multiplying (NOT single shared unit).

## Invoicing (in progress, NOT fully built)

**Schema (applied):** `invoices` gained `order_id`, `status` (default `'approved'` — preserves 
existing direct-entry invoices unchanged), `erp_invoice_number`, `erp_date`, `erp_amount`, 
`created_by`, `approved_by`, `approved_at`.

**Built:** `AwaitingInvoiceTile.jsx` (Admin+Accounts, on Invoices.jsx) — lists orders at 
`allocation.status='loading_complete'` with no invoice yet → "Create Invoice From Load" → 
auto-populated items/total from order → ERP fields (soft-warning only on mismatch, never blocks) → 
saves with `status='pending_approval'`.

**`achievementEngine.js` fix applied:** added `if (invoice.status && invoice.status !== 'approved') 
return` inside the invoice loop — pending-approval invoices don't count toward achievement until 
Admin approves. Existing direct-entry invoices unaffected (default to 'approved').

**Built (as of 1 Aug 2026 session):**
1. `InvoiceApprovalTile.jsx` (Admin+Accounts, on Invoices.jsx) — lists `pending_approval` invoices,
   Review sheet with line items + ERP mismatch warning, Approve button calls existing
   `db.approveInvoice(id, approvedBy)`.
2. `NotificationBell.jsx` (WebApp.jsx top bar) — new `notifications` table (`target_roles` jsonb,
   title, body, type, ref_id, read, created_at), 30s poll. `LoadingScreen.jsx` fires a
   `type: 'loading_complete'` notification to `['r1','r3']` the moment the driver confirms the
   final stop (`markLoadingComplete` call site).
3. Invoice No./Date/Amount/Status card added to `OrderFullDetail.jsx` (shared by `OrderStatus.jsx`
   across Admin/Manager/Accounts/Team) via new `db.fetchInvoiceForOrder(orderId)`.
4. PDF download — `src/lib/printInvoice.js`, `window.print()` in a new tab, no library. Wired into
   the Invoices list (PDF column), `InvoiceApprovalTile.jsx` review sheet, and the new invoice card
   on `OrderFullDetail.jsx`.

**Bugs fixed same session (same root cause as the 31 July fix below, found in two more spots):**
- `Invoices.jsx`'s manual "Add invoice" flow (`InvSheet`) was still sending `customer_id` on
  insert/update instead of `distributor_id` — every manual add/edit 400'd silently, and the list's
  Customer column read the wrong field too. Fixed both.
- `achievementEngine.js` line ~58 read `invoice.customer_id` for the per-customer achievement
  breakdown (`ach.custs`) — always undefined on real rows, so per-customer goal progress in the
  Team app has been stuck at 0 since that feature shipped. Fixed to `invoice.distributor_id`.
- Also found and fixed: `Invoices.jsx` had db.js's own functions
  (`fetchOrdersAwaitingInvoice`/`createInvoiceFromLoad`/`fetchPendingInvoices`/`approveInvoice`)
  accidentally duplicated into the page file, referencing `supabase` with no import —
  would have thrown `ReferenceError` on load. Removed the duplicate block (real versions stay in
  db.js only, per the architecture rule).

**Still open:** re-verify `achievementEngine.js`'s approval-gating fix end-to-end now that the
customer_id fix is in (per-customer goal progress bars should now move).

## Deferred / Known Issues (not blocking, revisit later)
- `createUser()` in db.js needs `service_role` key (client-side `auth.admin.createUser()` fails 
  "User not allowed" for ALL new employees). Workaround: manual Supabase Dashboard Auth + SQL insert. 
  Fix = Edge Function, explicitly parked until after full testing.

  **Manual workaround, step by step (documented 4 Aug 2026 session):**
  1. Supabase Dashboard → Authentication → Users → **Add user** → email + password → check "Auto
     Confirm User" → copy the generated **User UID**.
  2. If the new user is Sales Team (`r5`) or Driver (`r7`), first create their `members` row (Table
     Editor → `members` → insert `name`/`avatar`/`color`; `manager_id` can be left blank and set
     later via Set Parameters) — every other role skips this, `member_id` stays `NULL` for them.
  3. Insert the `users` row:
     ```sql
     insert into users (name, email, role_id, member_id, avatar, color, auth_id)
     values (
       'Full Name', 'email@example.com',  -- must match the Auth email from step 1
       'r5',                               -- r1 Admin, r2 Manager, r3 Accounts, r4 HR,
                                            -- r5 Sales Team, r6 Warehouse Manager, r7 Driver
       123,                                 -- members.id from step 2, or NULL if not sales/driver
       'AN', '#3b82f6', 'paste-the-auth-uid-here'
     );
     ```
     Optional (Attendance system, defaults are fine if skipped): `hq_latitude`, `hq_longitude`,
     `duty_start_time`, `allowed_deviation_m` (defaults to 20).
  They can log in immediately with the step-1 email/password once this row exists.
- Orphaned file `src/components/PickingPendingTile.jsx` — confirmed fully unused, tile inside 
  commented out as stopgap, safe to delete.
- Performance/polling issue (see Recurring Bug Patterns #5) — flagged, not fixed.
- RLS disabled across all tables — flagged multiple times pre-launch requirement.
- Google Maps migration path open — currently Leaflet+OSRM, swap = one component (`RouteMapSheet.jsx`).
- Pre-existing: `db.fetchAttendance`/`db.upsertAttendance` (old `attendance` table, `member_id`-keyed)
  — now fully superseded and orphaned by the new Attendance/Punch-In System below (2 Aug 2026
  session); left untouched rather than deleted since the underlying table's real state in Supabase
  hasn't been inspected. Safe to delete both functions + the old table once the new system is
  confirmed working.
- **Products not tagged to a warehouse** — `products` has no warehouse linkage anywhere in the
  schema today. User confirmed (2 Aug 2026) this will be added in a **later** session as its own
  piece of work. Relevant to: the upcoming Daily Stock Update feature (see below — built as a single
  global status per product for now, not per-warehouse), and worth checking against at that time
  whether anything else assumed single-warehouse stock in the meantime.

## Delivery/Transit Tracking — Phase 1 BUILT & PUSHED (1 Aug 2026 session), NOT YET BROWSER-TESTED

**Where this picks up:** `vehicle_allocations.status` today dead-ends at `loading_complete` — 
nothing built past it. Per-order `loading_stage` (`wm_loaded` → `driver_confirmed`) is only used 
during the loading phase via `LoadingScreen.jsx`. `AwaitingInvoiceTile.jsx` already lists orders at 
`allocation.status='loading_complete'` with no invoice, but ungrouped (one order at a time).

**User's ask, condensed:** invoice creation should be grouped/worked through per vehicle allocation 
(all loads in one allocation back-to-back) → driver sees per-load invoice-done status → once ALL 
orders in the allocation are invoiced, driver confirms 3 items (Collected Invoice / Collected 
Waybill / Informed to Distributor, all Yes) → unlocks **Start Journey** → shows route map 
(stop 1, 2, 3...) → order status shows "in transit" with vehicle+driver details to all roles → 
Admin sees live vehicle position via websocket with idle alerts (>30 min not moving) → driver 
presses **Arrived** at each stop (est. vs actual time shown) → all roles see "arrived at 
distributor" with timestamp on order status.

### Phase 1 — invoice-gated checklist + route + arrival — BUILT, committed & pushed (commit
`6ab5c06`), NOT YET verified in a real browser session (no chromium-cli/Playwright available in
this Windows dev environment — only `vite build` + `eslint` were run clean)

**Built:**
1. **Grouped invoice creation by allocation** — `AwaitingInvoiceTile.jsx` groups awaiting-invoice
   orders by `allocation_id`, one section per Load (vehicle number as header). `db.js`'s
   `fetchOrdersAwaitingInvoice()` extended to join `allocation.vehicle`.
2. **New `AllocationJourneyTile.jsx`** (driver, rendered on `AssignedLoads.jsx` next to
   `DriverOrderConfirmTile`) — for allocations at `status='loading_complete'`: per-order
   Invoiced/Not badge (new `db.fetchInvoicesForOrders(orderIds)`, counts any invoice status). Once
   all orders invoiced: 3-item checkbox checklist (Collected Invoice/Waybill/Informed to
   Distributor) persisted live via new `db.updateAllocationChecklist(allocationId, updates)`. Once
   all 3 checked: **Start Journey** button.
3. **Start Journey → route plan** — opens `RouteMapSheet.jsx` (now accepts optional
   `onRouteReady`/`footer` props, backward-compatible with its existing caller in
   `LoadCreatedList.jsx`) which computes the OSRM `/trip/` route and reports
   `{ stops: [{order_id, distributor_name, leg_duration_min, cum_eta_min}], total_duration_min,
   total_distance_km }` back up. A footer "Confirm Route & Start Journey" button calls new
   `db.startJourney(allocationId, routePlan)` → sets `status='in_transit'`,
   `journey_started_at=now()`, stores `route_plan`.
4. **Per-stop arrival** — same tile, for allocations at `status='in_transit'`: shows current stop
   (`route_plan.stops[delivery_stop_index]`), est. (`cum_eta_min`) vs elapsed (ticks every 30s via
   `now` state — avoid calling `Date.now()` directly in render, React Compiler's
   `react-hooks/purity` lint rule flags it). "Arrived" button → new
   `db.confirmArrival(orderId, allocationId, newStopIndex, isLastStop)` sets
   `distributor_orders.arrived_at`, increments `delivery_stop_index`, and on the last stop flips
   `status='completed'` + `journey_completed_at`.
5. **Cross-role order status** — `orderStageLabel.js` (`getOrderStageLabel`/`getOrderStageColor`),
   `OrderTimeline.jsx`, and `OrderFullDetail.jsx` (shared by `OrderStatus.jsx` across
   Admin/Manager/Accounts/Team) now show "In Transit" / "Arrived at Distributor — {timestamp}"
   stages and a Delivery card with vehicle number + driver name. Required extending
   `db.fetchAllOrdersWithItems()` to join `allocation.vehicle`/`allocation.driver`/`route_plan`/etc
   — it didn't have that join before.

**Phase 1 schema — already applied** (confirmed via a read-only REST probe against
`vehicle_allocations`/`distributor_orders` before building, not just asked):
```sql
alter table vehicle_allocations
  add column collected_invoice boolean not null default false,
  add column collected_waybill boolean not null default false,
  add column informed_distributor boolean not null default false,
  add column journey_started_at timestamptz,
  add column journey_completed_at timestamptz,
  add column route_plan jsonb,
  add column delivery_stop_index integer not null default 0;

alter table distributor_orders
  add column arrived_at timestamptz;
```

**Still open / not done yet:**
- ~~Browser verification~~ — done, user confirmed working in the browser (2 Aug 2026).
- ~~Driver role DB menus still only has `assignedLoads`~~ — done, user confirmed the two new boxes
  (`driverLoadingConfirm`, `driverJourney`) are checked in Settings → Driver role → Menu access
  (2 Aug 2026). Phase 1 + driver bottom-nav split are both fully wired up end to end now.
- Pre-existing lint errors (not introduced this session, left as-is): `RouteMapSheet.jsx`
  `setState`-in-effect + unused `e`, `AssignedLoads.jsx` unused `confirmingParkId`/`e`,
  `OrderFullDetail.jsx` exhaustive-deps warning, `WebApp.jsx` `SideContent` static-component warning
  + unused `Btn` import, `Settings.jsx` unused `Inp` import.

### Phase 2 — live GPS tracking, websocket admin map, idle alerts — BUILT & PUSHED (2 Aug 2026
session, commit `d5e98a1`). User confirmed everything EXCEPT the actual live-position ping is
working — the geolocation-driven movement/idle-detection part still needs a real moving device to
verify and is explicitly deferred ("will check the live tracker later with a moving device").

**Real constraint, not a choice:** live position only works while the driver keeps a dedicated 
Journey screen open/foregrounded (`navigator.geolocation.watchPosition`) — no native app or PWA 
background service worker exists. Same precedent as `LoadingScreen.jsx` (explicitly "NOT globally 
persistent across navigation").

**Built:**
1. **`vehicle_locations` table** (ping history, schema below) — append-only, nothing prunes it
   (see "Still open" — retention explicitly deferred by user).
2. **Driver side** (`AllocationJourneyTile.jsx`): while an allocation is `in_transit` and the
   Journey tab is mounted, `watchPosition` throttled to ~1 ping/45s per allocation →
   `db.recordVehicleLocation(allocationId, lat, lng)`. Geolocation errors are swallowed silently
   (`() => {}`) — if a driver denies the location permission prompt there's currently no visible
   feedback, just no pings. Requires a secure context (HTTPS or localhost); Vercel prod is fine.
3. **Admin side:** new `VehicleLiveMap.jsx` (menu id `vehicleLiveMap`, label "Live Tracking", under
   Distributor Functions section — mirrored into `Settings.jsx` per Recurring Bug Pattern #6).
   Leaflet map (same CDN-loader pattern as `RouteMapSheet.jsx`) + new `db.subscribeVehicleLocations()`
   wrapping a real Supabase Realtime `postgres_changes` INSERT subscription (actual WebSocket, not
   polling — kept inside `db.js` rather than importing `supabase` directly in the page, per the
   architecture rule). Idle detection computed client-side (no Edge Functions exist yet — same gap
   as `createUser()`): tracks last-significant-movement (>50m, via new `geo.js` `haversineMeters`)
   per allocation; idle >30min while `in_transit` → red badge + one `notifications` row to `['r1']`
   per continuous idle episode (cleared once movement resumes), reuses `NotificationBell.jsx`.
4. **ETA vs actual**, shown per-vehicle in the list above the map: current leg's `route_plan`
   estimate vs elapsed time since the previous stop's `arrived_at` (or `journey_started_at` for leg
   1), flagged "running Xm late" past a 10min threshold.

**Schema — user must apply manually, not yet confirmed done:**
```sql
create table vehicle_locations (
  id bigserial primary key,
  allocation_id text not null references vehicle_allocations(id),
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

create index vehicle_locations_allocation_recorded_idx
  on vehicle_locations(allocation_id, recorded_at desc);
```
Plus: Supabase Dashboard → Database → Replication → toggle `vehicle_locations` on, Insert event
(manual step, can't be done from code).

**Still open / not done yet:**
- **Live-position ping itself not yet verified** (2 Aug 2026) — everything else in Phase 2 the user
  confirmed working; only the `watchPosition` → `vehicle_locations` → Realtime → map-marker chain
  needs a real moving device, which the user will test later and report back. If it turns out
  broken when tested, check in order: SQL/Replication steps actually applied? Admin's
  `vehicleLiveMap` menu box checked in Settings (+ re-login)? Allocation actually `in_transit` (not
  still at `loading_complete`)? Driver actually on the Journey tab? Location permission granted?
- **Retention on `vehicle_locations` explicitly deferred by user** (2 Aug 2026): grows forever,
  nothing deletes old ping rows (cheap for now — ~20MB/year at moderate volume, not urgent). User
  confirmed they want cleanup eventually but parked it. Cheapest fix when picked back up: delete an
  allocation's rows once `status='completed'` inside `confirmArrival` — no Edge Function needed,
  unlike the `createUser()` gap.
- **Members/driver master has no create/edit UI at all** — `createMember`/`updateMember`/
  `deleteMember` in `db.js` are unused; `members` rows are apparently created directly in Supabase.
  Surfaced because user asked whether a driver phone number field was needed (it's not — login is
  email/password only, no phone/OTP anywhere). Building a proper Members master screen (with phone
  as a field) explicitly deferred by user ("we will update it later").

### Phase 3 — per-stop delivery workflow (unloading → complete) + driver lock-out — BUILT & PUSHED
(1 Aug 2026 session, commit `1ca39ef`), NOT YET BROWSER-TESTED. POD photo upload deferred (see below).

**Built:**
1. **Per-stop lifecycle replaces the old single-shot Arrived**: `db.confirmArrival` (which used to
   stamp `arrived_at` AND auto-advance `delivery_stop_index`/auto-complete the allocation in one
   call) is removed, replaced by five focused `db.js` functions: `markArrived`, `startUnloading`,
   `completeDelivery` (also captures GPS via one-shot `getCurrentPosition`, same pattern as
   `AssignedLoads.jsx`'s transit-time calculator — falls back to "Complete Without Location" if
   permission denied/errors, doesn't hard-block), `advanceDeliveryStop` (the new explicit "Next
   Stop" action), `startReturnToBase` (status → `returning_to_base`, only offered on the last stop
   once its delivery is complete).
2. **`AllocationJourneyTile.jsx`'s in-transit branch** rebuilt as a state machine keyed off the
   current stop's order fields: `!arrived_at` → Arrived button; `arrived_at && !unloading_started_at`
   → Start Unloading; `unloading_started_at && !delivered_at` → Delivery Complete; `delivered_at` set
   → Next Stop (not last stop) or Return to Base (last stop).
3. **Return-to-base checklist** — new `returning_to_base` allocation-status branch in the same tile:
   3 checkboxes (Vehicle Parked / Keys Handover / POD Handover — columns `return_vehicle_parked`/
   `return_keys_handover`/`return_pod_handover`, deliberately NOT reusing the loading-phase
   `vehicle_parked`/`vehicle_parked_at` naming, which means something different) reusing
   `db.updateAllocationChecklist` as-is (already generic). All 3 checked → **Submit Journey
   Complete** → `db.submitJourneyComplete` sets `status='pending_journey_approval'`, fires a
   `notifications` row to `['r1']` (same pattern as `LoadingScreen.jsx`'s `loading_complete`
   notification). Tile then shows a read-only "Waiting for Admin Approval" card.
4. **New `JourneyApprovals.jsx`** (`src/pages/admin/`, standalone menu page per user's explicit
   choice — not a WMDashboard tile, not folded into Invoices.jsx) — lists
   `db.fetchPendingJourneyApprovals()`, shows each order's arrived/unloading/delivered timestamps
   and the 3 checklist flags, **Approve** button → `db.approveJourneyComplete(id, approvedBy)` sets
   `status='completed'` (this is now the *only* path to `completed` — the old
   auto-complete-on-last-arrival is gone) + `journey_complete_approved_at`/`_by`. New menu id
   `journeyApprovals` added to both `WebApp.jsx`'s `ALL_MENUS`/`PAGE_MAP` and Settings.jsx's
   separate copy in the same commit (Recurring Bug Pattern #6).
5. **Driver lock-out** — new `db.fetchDriversWithLockStatus()`: a driver is locked iff they have any
   `vehicle_allocations` row with `status != 'completed'` (no new boolean — derived from the status
   column alone, since `deallocateVehicle` already hard-deletes the row on deallocation, so this one
   check covers the whole "assigned but not yet admin-approved-done" span). `LoadCreatedList.jsx`'s
   Allocate Vehicle driver dropdown now calls this instead of plain `fetchDrivers` and filters out
   locked drivers entirely (same style as the existing capacity-based `suitableVehicles` filter).
6. **Cross-role stage display** extended for the two new stages: `orderStageLabel.js`
   (`getOrderStageLabel`/`getOrderStageColor` now check `delivered_at`/`unloading_started_at` before
   `arrived_at`), `OrderTimeline.jsx` (added "Unloading Started"/"Delivery Complete" entries), and
   `OrderFullDetail.jsx`'s Delivery card (status include-list extended to
   `returning_to_base`/`pending_journey_approval`/`completed`, three-way timestamp display added).

**Bug caught during this session's own build**: first draft of `AllocationJourneyTile.jsx` declared
a new `useState` (`deliveryError`) *after* the component's existing early-return
(`if (allocations.length === 0) return ...`) — a rules-of-hooks violation ESLint's
`react-hooks/rules-of-hooks` caught immediately. Fixed by moving it up with the other `useState`
calls at the top of the component, same as every other piece of state there.

**Schema — user confirmed applied (1 Aug 2026)** (same pattern as Phase 1/2):
```sql
alter table distributor_orders
  add column unloading_started_at timestamptz,
  add column delivered_at timestamptz,
  add column delivery_lat double precision,
  add column delivery_lng double precision;

alter table vehicle_allocations
  add column returning_to_base_at timestamptz,
  add column return_vehicle_parked boolean not null default false,
  add column return_keys_handover boolean not null default false,
  add column return_pod_handover boolean not null default false,
  add column journey_complete_submitted_at timestamptz,
  add column journey_complete_approved_at timestamptz,
  add column journey_complete_approved_by text;
```

**Explicitly deferred (user's call, mid-session):**
- **POD photo upload** — nothing in this codebase uses Supabase Storage yet; creating a bucket is a
  manual Dashboard step the user didn't want to do mid-session. Delivery Complete finalizes with
  just a GPS pin, no photo. When picked back up: add a `pod_url` column to `distributor_orders`,
  create a bucket (working name `pod-photos`) + policy in Supabase Dashboard → Storage, add a
  `<input type="file" accept="image/*" capture="environment">` step between Delivery Complete and
  Next Stop/Return to Base in `AllocationJourneyTile.jsx`, upload via `supabase.storage` calls added
  to `db.js` (per the architecture rule — nothing outside `db.js`/`supabase.js` touches Supabase
  directly).
- No reject/send-back path on Journey Approvals — Admin only approves (matches
  `InvoiceApprovalTile.jsx`, which also has no reject).
- No timeout/escalation if an allocation gets stuck `in_transit`/`pending_journey_approval` — no
  such handling exists anywhere else in the app.

**Still open / not done yet:**
- ~~Schema applied~~ — done, user confirmed (1 Aug 2026).
- ~~Admin's `journeyApprovals` menu box checked in Settings~~ — done, user confirmed (1 Aug 2026,
  "sql update + menu option journey tab enabled").
- **Not browser-tested** — same constraint as every phase before it (no chromium-cli/Playwright in
  this Windows dev environment). Only `vite build` + `eslint` (scoped to touched files — the
  project-wide `eslint .` run has ~66 pre-existing errors unrelated to this session, e.g.
  `WebApp.jsx`'s `SideContent`/`Settings.jsx`'s unused `Inp` already flagged in the lint-errors list
  below) were run clean. Still to verify end-to-end in a real browser: Driver walks Arrived → Start
  Unloading → Delivery Complete → Next Stop (repeat) → Return to Base → 3-item checklist → Submit
  Journey Complete; Admin sees it on the Journey Approvals page and approves; confirm the driver
  disappears from `LoadCreatedList.jsx`'s Allocate Vehicle dropdown the moment they're assigned a
  new load's allocation, and reappears only after that approval.

### Old Phase 3 spec (superseded by "Built" above — kept for the original ask in the user's words)

**User's ask, verbatim-condensed:** on **Arrived** (Phase 1's existing button), admin gets the
estimate-vs-actual arrival record (partly exists already via Phase 1's `arrived_at` + `route_plan`
— confirm what's actually surfaced today vs what's still needed). Driver then gets a **Start
Unloading** button (timestamp). Next button is **Delivery Complete** (timestamp + capture GPS
location at that moment). This prompts **POD upload** directly from the phone camera; once
uploaded and confirmed, the order's status reflects the phase — **Arrived → Unloading in Progress →
Delivery Complete**, each with its own timestamp, visible to all roles same as Phase 1's stage
labels. After a stop's delivery is complete, driver chooses **Next Stop** (if more remain) or
**Return to Base** (if this was the last stop) — same loop repeats per stop. Once back, driver runs
a **Journey Complete** step confirming 3 items: Vehicle Parked / Keys Handover / POD Handover.
**Admin must approve** this Journey Complete before the driver is available again. Explicit new
constraint (didn't exist before): **a driver stays locked out of new vehicle allocations from the
moment they're assigned a load until Admin approves their Journey Complete** — today
`LoadCreatedList.jsx`'s driver dropdown (`db.fetchDrivers()`) has no such check at all.

POD upload was descoped from this build per the user's mid-session call (see "Explicitly deferred"
above) — everything else in this ask is built.

### Phase 4 — Journey Vein-Diagram Timeline, Approved-List, Admin Remarks + PDF Export — BUILT &
PUSHED (2 Aug 2026 session, commit `42c9797`), NOT YET BROWSER-TESTED

**User's ask, condensed:** Journey Approvals page should show a full visual timeline ("vein diagram")
of every driver activity from Accept Load through Parking/Loading/Loading Complete/Start
Journey/Arrival/Delivery Complete per stop/Return to Base, each with a timestamp and the time
difference to the previous activity, plus a header/footer. Header should also show driver name,
vehicle number, per-stop town route, journey start/end + total elapsed, total qty loaded, estimated
journey time + actual-vs-estimate difference. Admin approves with a remarks field. PDF copy
downloadable. All *approved* journeys should also show up as a browsable list (not just pending
ones), clickable into the same full detail screen (a proper full-screen Sheet, not a toast). Same
list + detail screen needed on the driver's own Journey tab too.

**Built:**
1. **`src/lib/journeyTimeline.js`** (new, shared) — single source of truth for both the on-screen
   diagram and the PDF: `buildJourneyEvents(allocation, orders)` walks every stage timestamp
   (`driver_accepted_at` → `vehicle_parked_at` → `loading_started_at` → `loading_completed_at` →
   `journey_started_at` → per-stop `arrived_at`/`unloading_started_at`/`delivered_at` in
   `route_plan.stops` order → `returning_to_base_at` → `journey_complete_submitted_at` →
   `journey_complete_approved_at`), sorted chronologically. `journeySummary()` derives header stats
   (stop towns, start/end, total elapsed, estimated vs actual). `fmtTs`/`fmtDur` shared formatters,
   `CATEGORY_COLOR` per-stage color map.
2. **`JourneyVeinTimeline.jsx`** (new component) — vertical connected-node timeline: header (driver,
   vehicle, `Stop 1: Town → Stop 2: Town...` route, Journey Start/End, Total Elapsed, Total Qty
   Loaded — summed from `load_item_progress.loaded_qty` via `db.fetchLoadItemProgress`, Estimated
   Journey Time from `route_plan.total_duration_min`, Est. vs Actual delta), the diagram itself
   (each node = stage + timestamp + "+Xh Ym since previous activity", color-coded by stage), footer
   (Stops Delivered X/Y, Submitted for Approval timestamp). Used identically on both the admin and
   driver side — same component, same data shape.
3. **`src/lib/printJourney.js`** (new) — PDF export, same `window.print()`-in-new-tab pattern as the
   existing `printInvoice.js` (no library). Reuses `journeyTimeline.js` so the PDF always matches the
   on-screen diagram.
4. **`JourneyApprovals.jsx` (admin)** — timeline now renders inside each pending card; added a
   remarks `<textarea>` per allocation; `db.approveJourneyComplete(id, approvedBy, remarks)` gained a
   third param, stores it in new `journey_complete_approval_remarks` column; "⬇ PDF" button per card.
   New **"Approved Journey Completions"** list card (new `db.fetchApprovedJourneys()` — any
   allocation with `journey_complete_approved_at` set) — clicking a row lazily fetches that
   allocation's orders + loaded-qty and opens the same `JourneyVeinTimeline` in a full-screen `Sheet`
   (not a toast) with a green "✓ Approved" block (approver name resolved via `db.fetchMembers()`
   lookup on `journey_complete_approved_by`, since that column stores a member id not a name) and its
   own "⬇ PDF" button.
5. **`AllocationJourneyTile.jsx` (driver Journey tab)** — same "Completed Journeys" list + click-to-
   detail Sheet pattern, scoped to the logged-in driver only (new
   `db.fetchDriverCompletedJourneys(driverId)`). No PDF button on the driver side (wasn't asked for —
   trivial to add later, same `printJourneyReport` call as the admin side). Required removing the
   component's old `if (allocations.length === 0) return <Card>...</Card>` early return (it was
   blocking everything below it, including this new list, whenever there was no active load) — the
   empty-state placeholder now renders inline instead.

**Schema — NOT yet applied, user must run:**
```sql
alter table vehicle_allocations
  add column journey_complete_approval_remarks text;
```

**Still open / not done yet:**
- **Schema not yet applied** — Approve Journey Complete will error until the column above exists.
- **Not browser-tested** — same constraint as every phase before it (no chromium-cli/Playwright in
  this Windows dev environment). Only `vite build` + scoped `eslint` were run clean.

## Attendance / Punch-In System — BUILT, SCHEMA APPLIED, BROWSER-TESTED & CONFIRMED WORKING
(2 Aug 2026 session, commits `42c9797` → `190c1ac`)

**User's ask, condensed (evolved across the session via live testing):** every employee (all 7
roles, web + driver) must punch in before reaching the app, once per day. Distance from the
employee's headquarter lat/long is calculated; if it exceeds an approved limit — per-employee, set
in the employee master — the employee sees an explicit warning and must confirm before the punch is
accepted. Duty reporting time (also per-employee) drives a late/on-time message shown right after
punching in. All employees see their own attendance calendar. **Present now requires two separate
HR/Admin approvals per punch**: Stage 1 approves the punch-in itself, Stage 2 approves that day's
activity (shown on the same attendance detail page) — Admin can always do either stage regardless of
who did the other.

**Key design calls made without asking (flag if wrong, easy to change):**
- **Keyed by `users.id`, not `members.id`.** `member_id` on `users` is only populated for Sales Team
  + drivers — most Admin/HR/Manager/Accounts/Warehouse Manager accounts have no `members` row at
  all. HQ lat/long, duty time, and deviation limit therefore all live on `users`.
- **New `attendance_punches` table**, NOT a fix to the legacy `attendance` table/`db.fetchAttendance`
  (pre-existing "queries nonexistent month/year columns" bug, see Deferred/Known Issues). Left the
  old table and its two `db.js` functions (`fetchAttendance`/`upsertAttendance`) untouched and now
  fully unused.
- **Two-stage approval is mandatory for every punch**, not just flagged ones — this replaced the
  original single-`approval_status`, flagged-only design after a follow-up ask mid-session.
  `punch_approval_status` and `activity_approval_status` both start `'pending'` on every insert; a
  day only shows green "Present" once both are `'approved'`. The location-flag notification to HR
  (`target_roles: ['r4']`) still only fires for actually-flagged punches, to avoid a notification
  per employee per day.
- **Stage 2's "activity" is rich only for drivers** (reuses `journeyTimeline.js`'s
  `buildJourneyEvents` against that driver's allocations for the day). For every other role it's an
  honest "not available yet" message — a true cross-module activity log (goal approvals, invoice
  approvals, settings changes, etc.) would mean adding action-logging across most of the app's write
  paths, and some already-existing member-linked tables (`expenses`, `distributor_visits`) store
  their date as a locale-formatted string (e.g. `"02 Aug 2026"`) rather than ISO, which would need
  cleanup before reliable date-range querying. Deliberately not attempted — flagged rather than
  shipped fragile.
- **Geolocation denial doesn't block punch-in** (soft-fail, matches every other GPS-capture point in
  this app) but IS treated as a flag needing review, same as an over-limit deviation.
- **HQ location, deviation limit, and duty time** all added as fields on the existing `Employees.jsx`
  user edit form (the real `users` CRUD screen) — NOT a new page, and NOT the full `members`-master
  screen that's separately deferred above.
- **`Dashboard.jsx`'s `MemberDetailSheet`** (Manager's team-member popup) still reads the OLD legacy
  `attendance` array — intentionally not rewired, out of scope.
- No leave/holiday calendar exists anywhere in this app — "Absent" simply means "no punch recorded
  for a past calendar day," weekends included.

**Built:**
1. **`PunchInGate.jsx`** — full-screen gate wrapping the routes in `App.jsx`, above both `WebApp` and
   `TeamApp`. Flow: get location → compute distance from `currentUser.hq_latitude/longitude` → if it
   exceeds that employee's `allowed_deviation_m` (default 20), show "⚠️ Outside Approved Range — away
   by Xm, limit Ym" with Confirm & Punch In / Cancel before accepting (flagged either way, employee
   must explicitly confirm) → on success, compute duty status against `currentUser.duty_start_time`
   and show a one-time "⏰ Late Duty — Xm late" / "✅ Duty On Time" screen with a Continue button
   before handing off to the app. Falls back to "Punch In Without Location" if geolocation is denied.
2. **`db.punchIn()`** inserts with `punch_approval_status` and `activity_approval_status` both
   `'pending'` unconditionally; `status='present'` is set immediately but no longer means the day
   counts as Present by itself. Defends the `unique(user_id, date)` constraint: a `23505` (duplicate)
   error is treated as success and returns the existing row instead of erroring — covers double-taps
   and duplicate tabs.
3. **`MyAttendanceCalendar.jsx`** (self-view — `Attendance.jsx` for non-HR/Admin roles, and
   `TeamApp.jsx`'s dashboard card + `myAttendance` tab, replacing the old broken `member_id`-keyed
   26/27-day logic) — Present/Pending/Absent/Rate tiles + `AttCal`. Day codes: green `P` (both stages
   approved), purple `X` (punched, one or both stages still pending — new color added to the shared
   `AttCal` in `ui.jsx`), red `A` (no punch).
4. **`Attendance.jsx`'s HR/Admin view** (`role.id` `r4` or `r1`) — three cards: **Stage 1 — Punch-In
   Approvals** (`db.fetchPendingPunchApprovals()`/`db.approvePunchStage1()`, every pending punch, not
   just flagged ones — location flag shown inline for triage), **Stage 2 — Activity Approvals**
   (`db.fetchPendingActivityApprovals()`, only once stage 1 is approved), and the **Attendance
   Roster** (all `users`, P/X/A calendar per employee, click any day-cell to open the detail Sheet —
   `onDayClick` prop added to the shared `AttCal`). The detail Sheet shows both stages with their own
   Approve button plus the activity feed, reachable from a day-cell or directly from either queue.
5. **`Employees.jsx`** — user edit form gained HQ latitude/longitude + "📍 Use my current location",
   **Approved Deviation Limit (metres)** (default 20), and **Duty Reporting Time** (`time` input).

**Real bugs found via live testing this session, all fixed:**
- `todayStr()`/`dateOf()` used `toISOString()`'s UTC date instead of local calendar date — for IST
  (UTC+5:30), any punch between 12:00–5:29am local time landed on the *previous* day's `date` column.
  Fixed to compute local date parts directly.
- HR's roster/pending-approval queries embedded `user:users(...)` without naming which of
  `attendance_punches`' **two** FKs to `users` (`user_id` and `approved_by`) to use — PostgREST
  rejected it as ambiguous. This is CLAUDE.md's own documented **Recurring Bug Pattern #3**, hit
  again by this session's own new table. Fixed with explicit
  `user:users!attendance_punches_user_id_fkey(...)`. This turned out to be the actual cause of "HR
  shows absent even though the employee punched in" — the punch was saved fine the whole time, only
  the query to *display* it was silently failing.
- Roster's client-side `p.user_id === userId` comparison could silently never match if Supabase
  returns one side as a string (bigint columns) and the other as a number (int4 columns) — switched
  to `String(a) === String(b)`.
- `db.punchIn()`'s error was never checked — a failed insert still showed a "success" confirmation
  and let the user into the app, but nothing was saved, so next login it asked again and HR never saw
  it either. Now surfaced as a visible error on the punch-in screen.
- The day-detail Sheet held its own local snapshot of the `punch` row; approving Stage 1 from inside
  the Sheet didn't refresh it, so Stage 2 kept showing "Complete Stage 1 first" until the Sheet was
  closed and reopened. Fixed by writing the freshly-approved row (already returned by
  `approvePunchStage1`/`approveActivityStage2` via `.select().single()`) back into the Sheet's state.
- Approval-failure error messages were rendered on a state var displayed in the page *behind* the
  Sheet — invisible while the full-screen modal (`zIndex: 300`) was open, so a failed approve looked
  like nothing happened. Now shown inline inside the Sheet itself.

**Schema — this is the FINAL shape, confirmed applied across this session's iterations:**
```sql
alter table users
  add column hq_latitude double precision,
  add column hq_longitude double precision,
  add column duty_start_time time,
  add column allowed_deviation_m integer not null default 20;

create table attendance_punches (
  id bigserial primary key,
  user_id bigint not null references users(id),
  date date not null,
  punch_in_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  distance_from_hq_m double precision,
  location_flag boolean not null default false,
  flag_reason text,
  duty_status text,
  minutes_late integer not null default 0,
  punch_approval_status text not null default 'pending',
  activity_approval_status text not null default 'pending',
  approved_by bigint references users(id),
  approved_at timestamptz,
  activity_approved_by bigint references users(id),
  activity_approved_at timestamptz,
  status text not null default 'present',
  unique(user_id, date)
);

create index attendance_punches_user_date_idx on attendance_punches(user_id, date);
```
(If setting this up fresh rather than following the session's incremental `alter`s: run this once
instead of hunting through the conversation for each intermediate step.)

**Confirmed working live in the browser this session:** punch-in gate, once-per-day enforcement,
deviation-limit confirm screen, duty late/on-time message, Stage 1 approval, Stage 2 approval,
roster P/X/A states, HR/Admin day-detail Sheet.

**Still open:**
- `Dashboard.jsx`'s `MemberDetailSheet` still reads the old legacy `attendance` array (unrelated,
  out of scope, see design-calls note above).
- Stage 2 activity content is driver-only for now (see design-calls note above) — every other role's
  Stage 2 is a manual judgment call by HR/Admin with no auto-populated activity feed.
- No leave/holiday calendar — Absent is purely "no punch on a past calendar day."

## Daily Stock Update — Warehouse Manager — BUILT (1 Aug 2026 session), SCHEMA NOT YET APPLIED,
NOT YET BROWSER-TESTED

**User's ask, verbatim-condensed:** new menu for Warehouse Manager: a page listing all products,
grouped category-wise. For each item, WM marks one of three statuses: **Available**, **Unavailable**,
or **Wait**. WM can change any item's status at any time (not locked/one-shot). Each status change is
timestamped. This status then affects the **order-creation screen** (`DistributorOrder.jsx`, Sales
Team): Available/Wait/Unavailable items are visually distinguished, and only Unavailable items are
selection-disabled.

**Important distinction from what already exists:** this is a separate concept from
`distributor_order_items.availability` (see Distributor Order → Picking → Load → Delivery Pipeline
above), which is set per **order item** during the **Picking** phase, after an order already exists.
This feature is per **product**, set **proactively/daily** independent of any order, to guide Sales
Team *before* they create an order. Two unrelated fields on two different tables — not a reuse of the
picking `availability` column.

**Resolved before build (2 Aug 2026, asked via AskUserQuestion at start of this session):**
- **Persistent, not daily-reset** — single current-status column on `products`, no per-day history
  table. Status stays whatever WM last set until changed again; "daily" only describes how often WM
  is expected to use the page.
- **Third color for Wait** — Available=green, Wait=amber (still selectable, flagged), Unavailable=red
  (selection-disabled). Not the collapsed red/red originally described.
- Status is **global per product, not per-warehouse** (resolved 2 Aug 2026, unchanged from before) —
  products will be tagged to a specific warehouse in a **later**, separate session.

**Built:**
1. **`src/pages/shared/StockUpdate.jsx`** (new, WM-only page) — products grouped by category (via
   the existing `categories` state from `useData()`), one table per category. Each row: product name,
   a `<select>` (Available/Wait/Unavailable) that saves immediately on change (no separate save
   button — matches the "can change any item's status at any time" ask), and a "Last Updated"
   timestamp column. Row background color mirrors `PickingEditSheet.jsx`'s existing
   Available/Wait/Unavailable color convention (`#dcfce7`/`#ffedd5`/`#fee2e2`) for visual consistency
   with the picking screens WM already uses.
2. **`db.updateProductStockStatus(id, status, updatedBy)`** (new, in `db.js` under PRODUCTS) — updates
   `stock_status`/`stock_status_updated_at`/`stock_status_updated_by`, `updatedBy` is
   `currentUser.id` (the `users.id`, same convention as the Attendance system's `approved_by`).
3. **Menu wiring** — new menu id `stockUpdate` ("Daily Stock Update", 📦, `Overview` section,
   alongside WM's existing `wmDashboard`/`picking`) added to both `WebApp.jsx`'s `ALL_MENUS`+
   `PAGE_MAP` and `Settings.jsx`'s separate copy, per Recurring Bug Pattern #6 — Admin must still
   check the box under Settings → Warehouse Manager role → Menu access before WM can see it.
4. **`DistributorOrder.jsx`'s item picker is the original native `<select>` dropdown** ("Select
   product..." + "+ Add" button, `pickProduct` state + `addItem()`) — first draft of this session
   replaced it with a clickable colored row list instead (reasoning: `<option>` background-color
   isn't reliable cross-browser), but the user explicitly asked for the dropdown pattern back
   (1 Aug 2026, follow-up). Reverted to the dropdown; the only change from the pre-existing version
   is that each `<option>` now carries an inline `style={{ background, color }}` per `stock_status`
   (green/amber/red, same palette as `StockUpdate.jsx`) and Unavailable options get the native
   `disabled` attribute (browser renders them non-selectable and greyed). Option label also appends
   `(Wait)`/`(Unavailable)` as a text fallback since inline `<option>` coloring support varies by
   browser/OS. `addItem()` still hard-guards against submitting an Unavailable product even if
   somehow selected. Products with no `stock_status` set yet (all pre-existing products, until WM
   touches them) default to `'Available'` — matches the fully-open behavior that existed before this
   feature.

**Schema — NOT yet applied, user must run:**
```sql
alter table products
  add column stock_status text not null default 'Available',
  add column stock_status_updated_at timestamptz,
  add column stock_status_updated_by bigint references users(id);
```

**Still open / not done yet:**
- **Schema not yet applied** — `StockUpdate.jsx` will show every product as "Available" (the column
  default) until the migration above runs; `db.updateProductStockStatus` will error until then.
- **Admin's `stockUpdate` menu box not yet checked** in Settings → Warehouse Manager role.
- **Not browser-tested** — same constraint as every other recent phase (no chromium-cli/Playwright in
  this Windows dev environment). Only `vite build` + scoped `eslint` (StockUpdate.jsx, db.js,
  DistributorOrder.jsx clean; WebApp.jsx/Settings.jsx errors are pre-existing, unrelated to this
  change) were run.
- **`Products.jsx` (admin master screen) does not surface `stock_status`** — not asked for, only the
  new WM page and the order-creation screen show/use it. Revisit only if the user wants Admin to see
  current stock status from the master list too.

## Production Issues (3M — Material/Machinery/Manpower) — BUILT (1 Aug 2026 session, same session as
Daily Stock Update above), SCHEMA NOT YET APPLIED, NOT YET BROWSER-TESTED

**User's ask, verbatim-condensed:** when a product can't be fully produced/packed, WM needs to tick
which specific reason(s) apply across 3 fixed categories — **Material**: Main Ingredient RM
Unavailable, Packing Materials Unavailable; **Machinery**: Production Breakdown, Packing Breakdown;
**Manpower**: Section Head Absent, Section Labourer Absent. Itemwise issues show in a new "Production
Issues" menu for both Admin and Warehouse Manager, flippable to an issuewise view (grouped by reason
instead of by product). Manpower-related issues also need to show under the HR menu.

**Resolved via AskUserQuestion at the start of this session:**
- **Independent of `stock_status`** — the 3M checklist does NOT drive the Available/Wait/Unavailable
  dropdown built earlier in this same session. It's a separate annotation; ticking a reason does not
  auto-flip status, and the status dropdown is unchanged.
- **Multi-select** — any combination of the 6 reasons can be ticked on the same product at once.
- **Ticked from `StockUpdate.jsx`** (Daily Stock Update page), not from the Production Issues page
  itself — Production Issues is a read/report view only (itemwise ↔ issuewise toggle).

**Built:**
1. **`src/lib/productionIssues.js`** (new, shared) — single source of truth for the 3 categories × 2
   reasons each, each reason mapped to one boolean column on `products`. Exports
   `ISSUE_CATEGORIES`, `ALL_ISSUE_FIELDS`, `hasAnyIssue(product)`, `MANPOWER_FIELDS`,
   `hasManpowerIssue(product)`. Used by `StockUpdate.jsx`, `ProductionIssues.jsx`, and
   `Attendance.jsx`.
2. **`db.updateProductIssues(id, fieldUpdates, updatedBy)`** (new, in `db.js`) — takes a partial
   `{ [field]: bool }` update (one checkbox toggle at a time), stamps
   `issue_updated_at`/`issue_updated_by`.
3. **`StockUpdate.jsx` gained an "Issues" column** — a button per product ("Add Issue" / "⚠ Issues"
   once any are ticked) opens a Sheet with the 3 categories and their checkboxes; each checkbox
   toggles and saves immediately (no separate save step, matching the status dropdown's auto-save
   UX). Does not touch `stock_status`.
4. **New `src/pages/shared/ProductionIssues.jsx`** — menu id `productionIssues` ("Production
   Issues", ⚠️, `Overview` section, same placement pattern as `stockUpdate`/`wmDashboard`), wired
   into both `WebApp.jsx` and `Settings.jsx` per Recurring Bug Pattern #6. Itemwise/Issuewise toggle
   (plain tab buttons, same style as `WMDashboard.jsx`'s Today/Monthly tabs): Itemwise lists every
   flagged product as a card with its ticked reason chips; Issuewise lists the 3 categories, each
   reason showing its affected-product count and names.
5. **`Attendance.jsx`'s HR/Admin view (`AttendanceHR`)** gained a "Manpower Production Issues" card
   at the top, listing only products with `issue_section_head_absent`/`issue_section_labourer_absent`
   ticked (via `hasManpowerIssue`) — same chip style as the Production Issues page, scoped to just
   the Manpower category since that's what's relevant to HR.

**Schema — NOT yet applied, user must run (can be combined with the Daily Stock Update migration
above in one script):**
```sql
alter table products
  add column issue_rm_unavailable boolean not null default false,
  add column issue_packing_material_unavailable boolean not null default false,
  add column issue_production_breakdown boolean not null default false,
  add column issue_packing_breakdown boolean not null default false,
  add column issue_section_head_absent boolean not null default false,
  add column issue_section_labourer_absent boolean not null default false,
  add column issue_updated_at timestamptz,
  add column issue_updated_by bigint references users(id);
```

**Auto-resolve + resolution history (added same session, right after the above was first built):**
User's follow-up ask: once a product's status flips back from Unavailable to Available, its 3M
issues should auto-resolve, and a timestamp should be shown against each resolved issue.
- **`StockUpdate.jsx`'s `setStatus`** — whenever the new status is `'Available'` (covers both
  Unavailable→Available and Wait→Available; a product marked Available shouldn't still carry a
  stale issue flag regardless of what it came from), any currently-active issue fields on that
  product are auto-cleared via the new `db.resolveProductIssues()`.
- **Manual untick also resolves** — `toggleIssue` in `StockUpdate.jsx` now calls
  `db.resolveProductIssues()` (not the plain field-setter) when a checkbox goes from ticked to
  unticked, so both the automatic and manual paths log the same way.
- **`db.resolveProductIssues(productId, fields, resolvedBy, labels)`** (new) — clears the given
  boolean field(s) back to `false` on `products` AND inserts one row per field into a new
  `product_issue_resolutions` log table (append-only, same pattern as the existing
  `vehicle_locations`/`notifications` tables) — this is what makes a resolved-at timestamp
  available per specific issue, which a bare boolean column can't represent once it flips back to
  false.
- **`db.fetchProductIssueResolutions(limit=50)`** (new) — joins product name + resolver name for
  display.
- **`ProductionIssues.jsx` gained a third "Resolved" tab** (alongside Itemwise/Issuewise) — lists
  recent resolutions with product, reason, resolved-at timestamp, and who resolved it. Fetched via
  `useEffect` on first switching to that tab (deliberately NOT the `if (!loaded) fetchX()`
  render-time pattern flagged in Recurring Bug Pattern #5 — this is new code, no reason to repeat a
  known-bad pattern).
- **`src/lib/productionIssues.js` gained `activeIssueFields(product)` and `labelForField(field)`**
  helpers to support the above without duplicating the category/reason lookup logic.

**Schema — NOT yet applied, user must run (in addition to the two migrations already listed for
Daily Stock Update and the 3M boolean columns above):**
```sql
create table product_issue_resolutions (
  id bigserial primary key,
  product_id text not null references products(id),
  field text not null,
  reason_label text not null,
  resolved_at timestamptz not null default now(),
  resolved_by bigint references users(id)
);
create index product_issue_resolutions_product_idx on product_issue_resolutions(product_id, resolved_at desc);
```

**Still open / not done yet:**
- **All three schema migrations for this session (stock_status columns, 3M boolean columns,
  product_issue_resolutions table) not yet applied** — nothing in this session's work is live until
  they run. `db.updateProductIssues`/`db.resolveProductIssues` will error until then.
- **Admin's `productionIssues` menu box not yet checked** for either Admin or Warehouse Manager role
  in Settings.
- **Not browser-tested** — `vite build` + scoped `eslint` clean (only pre-existing errors elsewhere:
  `WebApp.jsx`'s `SideContent`/unused `Btn`, `Settings.jsx`'s unused `Inp`, and a pre-existing
  `Attendance.jsx` exhaustive-deps warning on `month`/`year`, none introduced this session).
- **HR's Attendance page's Manpower card shows only currently-active issues, no resolved history**
  — deliberately kept simple; the Resolved tab with full timestamps lives on the Production Issues
  page (Admin + WM only, not HR's menu). Revisit only if HR specifically asks to see resolved
  manpower issues too.

## Monthly Goals + Org→Manager→Member Dashboard — BUILT (2 Aug 2026 session), SCHEMA APPLIED,
VISUAL REDESIGN + Z-INDEX BUG FIX APPLIED SAME SESSION, NOT YET FULLY BROWSER-CONFIRMED

**User's ask, condensed:** goals must be calculated monthly (the full Manager-sets-scope →
Sales-Team-submits → Manager-approves cycle repeats every month, not once ever). New dashboard
showing goal vs. achievement per parameter with **Today / Monthly / Custom-period** tabs, drillable
**Organization → Manager → Sales Team Member**, each level a real full-screen screen (not a toast),
using different charts per parameter. Full plan approved via plan-mode before building (see chat for
the approved plan text) — this was a large change to a module CLAUDE.md previously called "stable."

**Resolved via AskUserQuestion before building:**
- Monthly = **full re-architecture**, not just achievement re-bucketed — the scope-setting step
  (which parameters/products/categories/customers a member tracks) also repeats every month, along
  with goal values and the submit→approve cycle.
- "Today" tab = **pace check**: month-to-date achievement vs. a *prorated* slice of the monthly
  target (target × elapsed-days ÷ days-in-month), not just a raw daily number.
- No charting library existed (only a CSS progress bar in `ui.jsx`) — added **Recharts**.
- Drill-down = full-screen `Sheet` modals (the pattern already used everywhere in this app), not new
  routed/deep-linkable pages.

**Two structural gaps fixed as part of this change:**
1. **No Manager→Sales-Team-member reporting link existed anywhere** — `members` had no `manager_id`.
   Without it there was no way to group Sales Team members under "their" Manager for the drill-down.
   Fixed: new `manager_id` column on `members`, assignable via a small dropdown added to
   `Parameters.jsx`'s existing per-member row (not a full members-master rebuild — that stays
   deferred per the note under Deferred/Known Issues).
2. **`computeAchievements` had a real pre-existing bug**, found while wiring this up: it gated *all*
   achievement tracking on the goal's *overall* status (`goal.status === 'approved'`), but every
   consumer (`TeamApp.jsx`, the old `Dashboard.jsx`/`Targets.jsx`) already displayed achievement
   *per field* (`fg?.status === 'approved'`). For a `partial` goal (some fields approved, some
   rejected), approved fields were silently showing zero achieved. Fixed: gating moved to be
   per-field internally (value/products/categories/customers/visits/acq each check their own
   `_status` field) — matches what every UI already assumed. Also fixed a second real gap: **visits
   achievement was never computed at all** (`visits_goal` existed as a settable goal field but no
   `ach.visits` was ever produced anywhere) — added.

**Schema — NOT yet applied, user must run:**
```sql
alter table members add column manager_id bigint references users(id);

alter table parameters add column period text not null default to_char(now(), 'YYYY-MM');
alter table parameters drop constraint if exists parameters_member_id_key;
alter table parameters add constraint parameters_member_period_key unique (member_id, period);

alter table goals add column period text not null default to_char(now(), 'YYYY-MM');
alter table goals drop constraint if exists goals_member_id_key;
alter table goals add constraint goals_member_period_key unique (member_id, period);
```
The `drop constraint if exists` names are a best guess at Postgres's default single-column
unique-constraint naming. If the drop is a no-op (name doesn't match), the `add constraint` line
will fail with a duplicate-constraint error — check the actual name via the Supabase table editor's
constraints tab if that happens.

**Built:**
1. **`src/lib/period.js`** (new, pure, no DB) — `getCurrentPeriod()` (local-date `YYYY-MM`, same
   IST-boundary lesson as `db.js`'s `todayStr()`), `formatPeriodLabel()`, `monthRangeForPeriod()`,
   `monthElapsedRatio()` (today's fraction through the month — doubles as the "Today" tab's
   aggregation weight), `resolvePeriodsInRange()` (splits a custom date range into
   `[{period, weight}]` for prorating goals across months a custom range partially covers),
   `listRecentPeriods()`.
2. **`db.js`** — `fetchParameters`/`upsertParameter`/`fetchGoals`/`upsertGoal` all now take a
   `period` argument (`onConflict: 'member_id,period'`). Removed the unused, now-incompatible
   `fetchGoalByMember` (assumed one row per member — broken once goals became period-scoped, and had
   zero call sites). No new function needed for the manager hierarchy — reused the existing generic
   `updateMember(id, payload)`.
3. **`useData.jsx`** — added `currentPeriod` (computed once, exposed in context). `loadAll()` now
   fetches `parameters`/`goals` scoped to `currentPeriod` — every existing consumer
   (`Parameters.jsx`, `TeamApp.jsx`, `GoalApprovals.jsx`) keeps its same flat `{member_id: row}` map
   shape and needed minimal changes. The `achievements` memo now scopes to the current month's date
   range (via `monthRangeForPeriod`) and passes `visits` through — **this changes dashboard numbers
   from all-time-cumulative to month-to-date**, an intentional behavior change matching "goals must
   be monthly."
4. **`achievementEngine.js`** — see the two bug fixes above; `computeAchievements` signature gained
   `visits` and an optional `dateRange` (`{from, to}`) that filters invoices/visits/distributor
   acquisitions when provided (omitted = all-time, kept backward-compatible).
5. **`Parameters.jsx`** — header now shows "Setting scope for: {month label}"; save calls pass
   `currentPeriod`; new per-row Manager-assignment `<select>` (options = `role_id === 'r2'` users)
   calling `db.updateMember(id, {manager_id})`.
6. **`TeamApp.jsx`**'s `GoalEntrySheet` — sheet subtitle shows which month is being set; submit
   passes `currentPeriod` through to `db.upsertGoal`. No new locking logic needed — `canEnter`'s
   existing draft/rejected check already naturally re-locks each new month's goal once submitted,
   since goals are now period-scoped rows.
7. **`GoalApprovals.jsx`** — pending list is implicitly scoped to `currentPeriod` (since `goals` in
   context already only holds the current month's rows); added a "Reviewing goals for {month}" label
   and passed `currentPeriod` through to the approve/reject `upsertGoal` call.
8. **`src/lib/goalAggregation.js`** (new, pure, no DB) — `aggregateForMembers(memberIds, slices,
   products, categories, customers)`, the single aggregation function reused at all three drill
   levels (just called with a different `memberIds` scope). A **slice** = one period's data:
   `{ goalsMap, paramsMap, achievementsMap, weight }`. Today/Monthly views pass one slice
   (`weight=1`, or `monthElapsedRatio` for Today). Custom ranges spanning multiple months pass one
   slice per overlapping month (from `resolvePeriodsInRange`) — achievement values are summed as-is
   across slices (each already reflects an exact date sub-range), goal target values are summed as
   `goal × weight` (this is how a goal gets prorated for a partial-month custom range).
9. **`src/components/charts/GoalBarChart.jsx`** (new) — Recharts-based `GoalVsAchievedBar` (single
   goal-vs-achieved pair, for Value/Visits/Acquisition) and `GoalVsAchievedBreakdown` (multi-row
   horizontal bars, one per product/category/customer). Colors reuse this app's own existing
   semantic convention (`#2563eb` blue = target/goal, `#10b981` green = achieved — the same colors
   Dashboard's tiles already used), validated CVD-safe via the dataviz skill's
   `validate_palette.js` (PASS; the one contrast WARN is mitigated with an always-on legend + direct
   value labels on bars, not color alone). Also exports `ChartSection`, a shared card wrapper.
10. **`src/components/MemberGoalDetail.jsx`** (new) — the single member-level drill-down
    implementation, replacing THREE previous divergent ones (`Dashboard.jsx`'s old
    `MemberDetailSheet`, `Targets.jsx`'s own `DrillSheet`, which had a **live crash bug** — line 14
    referenced `customers`, never destructured from `useData()`, so opening any member's drill-down
    on the Targets page threw `ReferenceError`). Takes `slices` (same shape as above) and renders one
    `ChartSection` per active parameter via `aggregateForMembers([member.id], ...)`.
11. **`Dashboard.jsx` rework** — existing non-goal tiles (pending approvals, expenses, invoices, New
    Customer Visits funnel) are untouched. New: Today/Monthly/Custom tab bar; Monthly has a
    period-picker (`listRecentPeriods(12)`) to view past months (fetches that period's goals/params
    on demand and caches them in local `historicalCache` state — not pushed into global `useData`,
    since only the current month is the "live" one everywhere else in the app); Custom has two date
    inputs. Below the tabs: **Organization-level** charts (`aggregateForMembers` over *all*
    `members`), then a **Managers** list (grouped via the new `manager_id`, with an "Unassigned"
    bucket for members nobody's claimed yet) — tapping a manager opens `ManagerLevelSheet` (new,
    local to this file) showing that team's aggregate charts + a member list — tapping a member opens
    `MemberGoalDetail`.
12. **`Targets.jsx`** — fixed the crash bug above by switching to `MemberGoalDetail`; now correctly
    labeled "This month" since `goals`/`achievements` from context are period-scoped.

**Still open / not done yet (at first build, before the redesign below):**
- ~~Schema not yet applied~~ — done, user confirmed all 3 `alter table` blocks ran successfully
  (2 Aug 2026; `members.manager_id` had actually already existed pre-session and was skipped safely).
- **Historical months have no data yet** — since goals only just became monthly, the Monthly tab's
  period-picker and any Custom range touching a past month will show "no approved goals" until at
  least one full monthly cycle has actually run.
- **Custom-period goal comparison uses each overlapping month's own approved goal**, prorated by day
  overlap — deliberately NOT a simplified "always use current month's goal" shortcut, since the
  approved plan specifically called for per-period reconciliation. Verify this reads sensibly once
  there's real multi-month data.
- **`recharts` added as a new dependency** (`npm install recharts`, ~90kb gzipped) — first chart
  library in this app; bundle grew from ~753kB to ~1.16MB gzipped-194kB→312kB. Pre-existing
  `chunkSizeWarningLimit` warning (present before this session too) is now more prominent; not
  addressed (code-splitting) since out of scope for this change.
- **`npm audit` flags a high-severity `react-router`/`react-router-dom` advisory** — unrelated,
  pre-existing (surfaced by the `npm install`, not introduced by it), not touched — `--force` would
  be a breaking change to routing, out of scope.

### Post-build fixes: Sheet z-index nesting bug + full visual redesign (same 2 Aug 2026 session)

User feedback after the schema went live: "drill down is not happening," and the charts looked bad
— repetitive bar charts that duplicated what the top tiles already showed, wanted "a mix of pie
charts, bar charts, meter and other charts."

**Root cause of "drill down is not happening" — a real bug, not just a UX complaint:** `ui.jsx`'s
shared `Sheet` component hardcoded `zIndex: 300`. `Dashboard.jsx` mounts `MemberGoalDetail` and
`ManagerLevelSheet` simultaneously once you drill Manager → Member (clicking a team member inside
`ManagerLevelSheet` sets `selectedMember` but does NOT clear `selectedManagerId`, by design — closing
the member sheet should return you to the still-open manager sheet). Both Sheets shared the exact
same z-index, so the later-mounted-in-DOM one (`ManagerLevelSheet`, since it's declared after
`MemberGoalDetail` in `Dashboard.jsx`) silently rendered on top and fully covered the newly-opened
member sheet. Clicking a team member visibly did nothing. **Fixed:** `Sheet` now takes an optional
`zIndex` prop (default 300, unchanged everywhere else in the app). `MemberGoalDetail` passes it
through; `Dashboard.jsx` opens it at `zIndex={320}` so it always stacks above a Manager-level sheet
it might be nested inside.

**Visual redesign — replaced the repetitive bar-chart-everywhere approach with a real mix:**
1. **`GoalVsAchievedBar` deleted entirely** (was the single Goal-vs-Achieved 2-bar comparison used
   for every scalar parameter at every level — the main source of visual repetition). Confirmed
   unused anywhere else before removing.
2. **New `MeterGauge`** (`GoalBarChart.jsx`) — compact Recharts `RadialBarChart` progress ring per
   scalar parameter (Sales Value / Outlet Visits / Distributor Creation), showing `{percent}%` in the
   center. Color reuses this app's existing red/amber/green status convention (`ui.jsx`'s `barColor`
   thresholds: ≥75% green, ≥50% amber, else red) rather than a new ramp.
3. **New `ContributionDonut`** (`GoalBarChart.jsx`) — Recharts `PieChart` donut showing "share of
   achieved value" across a set of people (Managers at Org level, Team Members at Manager level).
   This is genuinely new information the tiles/meters don't show ("who's actually driving the
   number"), which is why it was added rather than just restyling the old bar chart. Slice colors
   reuse each person's own existing avatar `color` field (the same one their `Av` bubble already uses
   elsewhere in the app) for visual continuity, falling back to a validated categorical palette
   (`dataviz` skill's `scripts/validate_palette.js` — 8-color fallback set, PASS) when a color isn't set.
4. **`GoalVsAchievedBreakdown` (multi-row horizontal bars) kept as-is** for Products/Categories/
   Customers — this is the one place a bar chart is actually the right form (comparing several named
   items' goal vs. achieved), per the `dataviz` skill's form heuristic.
5. **Organization level no longer shows a Sales Value chart at all** — it exactly duplicated the
   existing "Approved targets"/"Achieved" tiles at the top of the page (same numbers, same
   comparison, just a different shape). Replaced with: Visits/Acquisition meters (parameters with NO
   existing tile anywhere) + the Manager-contribution donut + Products/Categories breakdown bars.
6. **Manager level** (`ManagerLevelSheet`, inside `Dashboard.jsx`) — 3 meters (Value/Visits/
   Acquisition, no tile-duplication concern at this nested level) + Member-contribution donut +
   Products/Categories bars.
7. **Member level** (`MemberGoalDetail.jsx`) — 3 meters instead of 3 stacked bar-comparison cards;
   Products/Categories/Customers breakdown bars kept.

**Still open:**
- **Not yet browser-confirmed after this redesign** — `vite build` and scoped `eslint` clean (`ui.jsx`
  has 2 pre-existing `react-refresh/only-export-components` errors, confirmed identical before this
  session's changes — unrelated). User should re-check the same drill-down path that was broken:
  Organization → tap a Manager → tap a Team Member, confirm the member sheet now visibly opens on top.
- **`GoalVsAchievedBar` is gone** — if a future ask wants a direct goal-vs-achieved bar comparison
  again (as opposed to a meter), it'd need to be re-added; not resurrected speculatively here.

### Bigger picture: role-specific dashboards + Admin rollup — ALL 4 DOMAINS BUILT (2 Aug 2026
session), NOT YET BROWSER-TESTED

**User's ask, condensed:** every role gets its own dashboard (Sales Team, Warehouse Manager, Driver,
HR), and Admin's dashboard becomes a single page with one section per domain — each section shows
that domain's totals and drills down into the same detail its own role would see. Confirmed via
AskUserQuestion: Admin's page is **one long page with 4 stacked sections** (not separate tabs), and
Warehouse/Driver "totals" should show **both today's activity AND open/ongoing work** (not just
today). Build order: **Sales first** (since the Goals/Achievement work above already started it),
then Warehouse, Driver, HR — not yet begun.

**Existing per-role content inventoried before starting** (so future sessions don't have to
re-derive this):
- **Sales Team** — `TeamApp.jsx`'s Home tab (now rebuilt, see below) + the Goals system above.
- **Warehouse Manager** — `WMDashboard.jsx` already has substantial dashboard content (Orders Ready
  to Pick, Pending Picking, Picking Complete, Load List, Vehicle Parked, Loading In Progress,
  category/distributor breakdowns) — likely needs reorganizing into the new pattern rather than
  building from scratch.
- **Driver** — no unified dashboard exists; 3 separate tabs (`AssignedLoads.jsx`,
  `DriverOrderConfirmTile.jsx`, `AllocationJourneyTile.jsx`) with no home/summary view tying them
  together. Clean slate.
- **HR** — `Attendance.jsx`'s `AttendanceHR` component is dashboard-like (Stage 1/2 approval queues,
  roster, Manpower Production Issues card) but tangled together with the approval actions themselves
  — needs untangling into "dashboard view" vs "approval workflow" if it's going to have a rollup
  section on Admin's page.

**Sales piece — both halves now built (2 Aug 2026 session):**
1. **Sales Team's own dashboard** (`TeamApp.jsx` Home tab, "My Goals" card) — replaced the old flat
   4-tile row (My target/Achieved/Progress/Goal status) + single `Bar` with: a Today/Monthly toggle
   (reusing `monthElapsedRatio` from `period.js` for the Today pace-check, no Custom-range option at
   this individual level — that's an Admin-only concept), then the same `MeterGauge`/
   `GoalVsAchievedBreakdown` components the Admin dashboard uses, scoped to just this one member via
   `aggregateForMembers([mid], [oneSlice], ...)` — same pure aggregation function, just a
   single-member, single-slice call. The New Customer Visits funnel and attendance snapshot stay
   exactly where they were (kept, per user's explicit confirmation that the funnel belongs bundled
   with Sales content, not split out separately). `approvedVal`/`valPct` (the old tile-row's derived
   values) were deleted as dead code once nothing referenced them anymore.
2. **Admin's "Sales" section** — this is functionally already what `Dashboard.jsx` (the shared
   Admin/Manager dashboard) contains today: Today/Monthly/Custom tabs, Org-level totals, Manager →
   Member drill-down, New Customer Visits funnel. It hasn't been physically restructured into a
   "section within a bigger multi-domain page" yet — that restructuring makes more sense to do once
   Warehouse/Driver/HR sections actually exist to stack alongside it, rather than building an empty
   4-section shell now. Treat `Dashboard.jsx`'s current content as "the Sales section, pending its
   siblings."

**Warehouse/Driver/HR sections — built same session, right after Sales, per "let's complete the
dashboard for all in admin page":**

Rather than re-implementing every nested drill-down each role's own page already has (WMDashboard.jsx
alone has ~6 tiles each with their own Sheet), each new section is a **condensed summary + drill-one-
level-down + a "View full X Dashboard" link** (via the existing `onNavigate` prop) that jumps to the
already-built rich page for deeper interaction. All three are `role?.id === 'r1'` (Admin-only) —
Manager doesn't see them, matching "Admin's dashboard becomes a rollup," not Manager's.

1. **`WarehouseSection`** (new, local component in `Dashboard.jsx`) — fetches
   `fetchPickingOrders`/`fetchLoads`/`fetchParkedAllocations`/`fetchInProgressAllocations` on mount
   (same pattern `WMDashboard.jsx` already uses locally, nothing added to `useData`'s global
   context). Tiles: Ready to Pick, Pending Picking, Picking Complete, Loads Created Today, Vehicle
   Parked, Loading In Progress — same six `WMDashboard.jsx` shows. Tap a tile → Sheet listing those
   orders/allocations (row rendering branches on `!!r.vehicle` since allocations and orders have
   different shapes). "View full Warehouse Dashboard" → `onNavigate('wmDashboard')`.
2. **`DriverSection`** (new) — fetches `fetchDriversWithLockStatus`/`fetchAllocations`. Tiles: Active
   Drivers (locked), Available Drivers, Loads In Transit, Awaiting Journey Approval (taps straight
   through to `journeyApprovals`, since that's already the exact right screen for that number). Tap
   Active/Available → Sheet listing each driver with their current allocation's vehicle number +
   status (cross-referencing `allocations` by `driver_id === member.member_id`) — this is the
   "drill down to individual" for Driver, since there's no manager-style hierarchy here.
3. **`HRSection`** (new) — fetches `fetchPendingPunchApprovals`/`fetchPendingActivityApprovals`.
   Tiles: Total Employees, Fully Approved Today (`total - punch pending - activity pending`),
   Punch-In Approvals Pending, Activity Approvals Pending, **Expenses Pending** (added in a same-day
   follow-up, see below). Tap a pending-approvals tile → Sheet listing those employees. "View full
   Attendance Dashboard" → `onNavigate('attendance')`.
4. **`SectionHeader`** (new, tiny local component) — `icon` + `title` divider used above each of the
   sections (💼 Sales, 🏭 Warehouse, 🚚 Driver, 📅 HR, 💰 Accounts) so the single-page-multi-section
   structure the user confirmed is visually legible without yet doing any real design pass.

**5th section added same session, follow-up ask ("add one accounts dashboard and move expenses to
both hr and accounts and invoice to accounts"):**
- **New `AccountsSection`** — Total Invoices, Invoices Pending Approval, Invoices Approved, Expenses
  Pending. Unlike Warehouse/Driver/HR this needed no new fetches at all — `invoices`/`expenses` were
  already loaded globally by `useData`, just never surfaced past the old flat top-of-page tiles. "View
  full Invoices" → `onNavigate('invoices')`, "View Expense Approvals" → `onNavigate('expApprovals')`.
- **Expenses now shown in BOTH `HRSection` and `AccountsSection`** (user's explicit ask — not a
  mistake if it looks duplicated) — each computes `pendingExpenses` independently from the same
  `expenses` prop, since HR and Accounts may both care about the same pending-expense queue for
  different reasons (HR: employee-relations angle; Accounts: the money angle).
- **Removed the old generic "Expenses pending" / "Invoices" tiles from the top-of-page row** (the
  ungrouped row above the Sales section) — that content now lives exclusively inside the HR/Accounts
  sections instead of also floating at the top redundantly. The top row now only has Approved
  targets / Achieved / Goals pending (all Sales-goal-related, left alone).
- **New shared `ApprovalDrillRow`** component — one row renderer reused by both `HRSection`'s and
  `AccountsSection`'s drill Sheets, since punch/activity rows (`r.user`), expense rows (`r.member`),
  and invoice rows (no join, detected via `r.lines`/`r.invoice_lines` presence, amount computed from
  line items same as `Invoices.jsx` does) all carry their "who"/amount under different shapes.

**Still open / not started:**
- **Not yet browser-tested** — `vite build` and `eslint` clean on `Dashboard.jsx` (zero errors, not
  even pre-existing ones) across both the initial 4-section build and this Accounts follow-up. Still
  needs a real check: do the Warehouse/Driver/HR/Accounts tile counts match what
  `WMDashboard.jsx`/`Attendance.jsx`/`Invoices.jsx` show for the same data, and do the drill Sheets
  and "View full X" links go to the right place.
- **Visual design pass is still deferred** — user asked to finalize content/flow first (itself in
  response to being shown a polished third-party dashboard screenshot as visual inspiration — Jira's
  marketing "Reports and insights" page: greeting header, stat tiles, a donut card with legend, a
  workload-style horizontal-bar card). Content/flow for all 4 domains is now built end-to-end; next
  ask for this area will likely be the design pass. Treat that screenshot as a layout/spacing/polish
  reference only (card styling, legend placement, typography rhythm) — not a literal Jira clone.
- **Warehouse/Driver/HR sections are summaries, not full parity with Sales' 3-level drill** — Sales
  got a real Org→Manager→Member hierarchy because that structure already existed (via the new
  `manager_id` field). Warehouse/Driver/HR don't have an equivalent natural hierarchy (no
  per-warehouse WM assignment, no manager-of-drivers concept), so they intentionally drill only one
  level before handing off to the existing full page. Revisit only if the user specifically wants
  deeper native drill-down instead of the "View full X" handoff.

### Sales section replaced with a dark "SalesSnapshot" widget (2 Aug 2026 session, same day as the
5-section build above) — first real design-pass work, BUILT, NOT YET BROWSER-TESTED

**User's ask, condensed:** shown a Geckoboard sales-dashboard screenshot (dark cards: revenue trend
line, big revenue numbers, a deals leaderboard, a deals feed, pipeline stage bars, stale-deal
alerts) and asked for something similar, including "orders under process," occupying the top 1/3 of
the Admin dashboard screen. Confirmed via AskUserQuestion: **replace** the old tabbed Sales section
entirely (not add alongside it), **dark card theme** matching the reference, and "orders under
process" as a **simple total count + value** (not a stage-by-stage pipeline breakdown).

**What got removed:** the entire Today/Monthly/Custom tab system (`tab`/`monthlyPeriod`/
`customFrom`/`customTo`/`historicalCache`/`loadingSlices`/`fetchPeriodBundle`, the big `useEffect`
that built `slices` from them), the org-level `ChartSection`s (Visits/Acquisition meters, the old
`ContributionDonut` "Achieved Value by Manager", Products/Categories breakdown bars), the standalone
"Managers" list `Card`, and the top-of-page "Approved targets"/"Achieved"/generic tile row. `slices`
is now just a fixed one-item array for the current month (`[{goalsMap: goals, paramsMap: params,
achievementsMap: achievements, weight: 1}]`) — no more historical period fetching at the Admin
top-level. Manager/Member drill-down (via `ManagerLevelSheet`/`MemberGoalDetail`, still fully
intact) is now always "this month," with no picker — a real capability reduction from before,
flagged here in case that's wanted back later.

**What got built — new `src/components/SalesSnapshot.jsx`:**
1. **Revenue This Month** — Recharts `LineChart`, cumulative daily revenue trend built by grouping
   `invoices` (already global via `useData`) by day-of-month and running-summing line totals. Dark
   axes/tooltip styling.
2. **Revenue** panel — big number (this month = `totalAch`, reused from Dashboard.jsx) + this
   week's revenue (invoices in the last 7 days).
3. **Manager Leaderboard** — this is the OLD `managerContribution` computation (per-manager achieved
   value, star for #1) rendered as a ranked list instead of a donut chart — same data, new shape.
   Each row is clickable (`onSelectManager`) and opens the exact same `ManagerLevelSheet` as before
   (including the synthetic `'unassigned'` id for members with no manager) — drill-down capability
   fully preserved, just reached from the leaderboard now instead of a separate "Managers" card.
   `managerContribution` gained an `id` field (`u.id` or `'unassigned'`) for this wiring and is now
   pre-sorted descending.
4. **Recent Orders** — last 5 rows from `db.fetchAllOrdersWithItems()` (new local fetch inside
   `SalesSnapshot`, same self-contained pattern as `WarehouseSection`/etc — nothing added to
   `useData`'s global context), showing member · distributor — value, relative time.
5. **Stats panel** — Orders Under Process (count + value: any order whose `allocation?.status !==
   'completed'`, i.e. hasn't reached final delivery — simple total, not staged, per the confirmed
   answer), Stale Orders (>3 days old and still under process, red-flagged like the reference's
   "stale deals"), Target Achievement % (reused `pct(totalAch, totalTarget)`), Avg Order Value,
   Goals Pending Review.
6. **React Compiler purity fixes needed during this build** (worth remembering for any future
   Recharts/date-math component): `Date.now()` can't be called directly during render — capture one
   `const now = new Date()` / `now.getTime()` up front and derive everything from that single value.
   Building a running-cumulative array with a mutated `let running` inside `Array.from`'s callback
   also isn't allowed — rewrote as an immutable `.reduce()` that reads the previous array entry
   instead of closing over a mutable outer variable.

**Still open / not done yet:**
- **Not yet browser-tested** — `vite build` and `eslint` clean on `Dashboard.jsx` and the new
  `SalesSnapshot.jsx`. Needs a real check: does the revenue trend line look sane, does the
  leaderboard still correctly open `ManagerLevelSheet`/`MemberGoalDetail` on tap (this was the exact
  z-index bug fixed earlier this session — worth re-confirming it still holds after this rework),
  and do the Orders Under Process / Stale Orders counts look right against real order data.
- **Period-picking is gone from the Admin top-level view** — see "What got removed" above. If the
  user wants to look at a past month's Sales performance again, that capability needs to be
  reconsidered/rebuilt (it's not simply commented out — the whole tab/fetch system was deleted).
- **Products/Categories breakdown by organization is no longer shown anywhere at the top level** —
  still viewable one level down (inside `ManagerLevelSheet`/`MemberGoalDetail`), just not at the
  Org/SalesSnapshot level anymore. Revisit only if the user wants it back at a glance.
- ~~Warehouse/Driver/HR/Accounts sections still plain light-card style~~ — done same session, see
  below.

### Design pass extended to Warehouse/Driver/HR/Accounts (same 2 Aug 2026 session, immediately
after SalesSnapshot) — BUILT, NOT YET BROWSER-TESTED

User said "continue" right after the SalesSnapshot build — extended the same dark-panel visual
language to the other four rollup sections so the whole Admin page reads as one system instead of
one dark widget followed by plain light `Tile`/`Card` sections.

**New shared primitives in `Dashboard.jsx`** (module-level, above `Dashboard()`):
- `darkContainer` — the `{background:'#0f172a', borderRadius:16, padding:16}` wrapper, same as
  `SalesSnapshot`'s outer panel.
- `DarkStat` — replaces `Tile` inside these sections: dark `#1e293b` card, uppercase gray label,
  big bold number (colored per-stat, same semantic colors as before just lightened for dark-bg
  contrast — e.g. `#2563eb`→`#60a5fa`, `#f59e0b`→`#fbbf24`, `#10b981`→`#34d399`, `#dc2626`→`#f87171`),
  optional `sub` line, click-to-drill unchanged.
- `DarkFooterLinks` — replaces the old light `Card` containing "View full X →" buttons: a row of
  cyan (`#38bdf8`) links under a subtle top border, inside the same dark container as the stats
  (previously the link lived in its own separate white `Card` below the tile grid).
- `DarkLoading` — replaces the light "Loading..." `Card` fallback shown before each section's first
  fetch resolves.

**What did NOT change:** the drill-down `Sheet`s (`ApprovalDrillRow`, the Warehouse/Driver custom
row rendering) are still the app's standard light theme — only the dashboard-level summary panels
went dark, matching how `SalesSnapshot` itself already worked (its own Manager/Member drill-down
still opens light `Sheet`s). No data-fetching or business logic changed in any of the four sections,
purely a visual reskin. `Tile` import removed from `Dashboard.jsx` (no longer used anywhere in the
file); `Card` import kept (still used by the New Customer Visits funnel, `StageLeadListSheet`,
`LeadDetailSheetAdmin`, `ManagerLevelSheet`).

**Still open (at the time of the design pass above):**
- ~~Not yet browser-tested~~ / ~~New Customer Visits funnel still light~~ — both addressed in the
  same-day follow-up below.

### SalesSnapshot follow-up: Today/Month/Year tabs, bar chart fix, Top 10 panels, funnel goes dark
(2 Aug 2026 session, immediately after the design pass above) — BUILT, NOT YET BROWSER-TESTED

User feedback after seeing the first `SalesSnapshot` build: wanted Today/This Month/This Year tabs
back (defaulting to This Month) rather than no time control at all; the revenue trend line looked
like an artificial straight diagonal (sparse invoice data + a smoothly-interpolated `Line` chart —
see below); wanted the New Customer Visits funnel converted to the same dark design (closing the
"dark→light→dark" inconsistency flagged in the previous entry); and wanted Top 10 Customers / Top
10 Products added to the snapshot.

**`src/components/SalesSnapshot.jsx` changes:**
1. **`TABS = [today, month, year]`**, default `'month'`, rendered as pill buttons at the very top of
   the widget (cyan `#38bdf8` when active, matching the widget's existing accent color).
   `rangeForTab(tab, now)` computes the `{from, to}` window. Scoped by the active tab: the revenue
   trend chart, the "Revenue" big number, and Top 10 Customers/Products. **Deliberately NOT
   tab-scoped:** the Manager Leaderboard (goals are inherently monthly — see the Monthly Goals
   architecture — there's no meaningful "today" or "this year" goal-vs-achievement to show, so it
   always reads "this month" regardless of the tab, labeled accordingly) and the Orders Under
   Process/Stale/Avg Order Value/Goals Pending stats (live current-state snapshots, not historical
   ranges).
2. **Line chart → Bar chart, root-caused, not just re-skinned.** The old chart used Recharts' `Line`
   with `type="monotone"` over a *cumulative* daily sum — with only a handful of real invoices, a
   smoothly-interpolated cumulative line inevitably looks like a straight ramp between the few real
   data points, reading as fake/artificial. Switched to `BarChart`/`Bar` over **non-cumulative**
   per-bucket revenue (`buildTrend(tab, invoices, now)`): daily bars for Today (last 7 days, since a
   single day has no sub-daily breakdown in this data) and This Month, monthly bars (Jan..current)
   for This Year. Bars show real gaps/spikes honestly instead of interpolating a line through them —
   the right chart-type fix for sparse data, not just a cosmetic change.
3. **New `topEntities(invoices, range, customers)`** — aggregates invoice value by `distributor_id`
   (customer name resolved via the `customers` prop, now passed into `SalesSnapshot` from
   `Dashboard.jsx` — `invoices` has no distributor join from `fetchInvoices()`, so this does the
   lookup client-side against the already-loaded distributors array) and by `product_id` (name
   already available via each line's joined `product.name`). Rendered via new shared `RankedList`
   component (same visual pattern as the Manager Leaderboard — numbered rows, name + value) as **Top
   10 Customers** and **Top 10 Products** panels, both re-titled with the active tab's label.
4. **Old "This week" revenue sub-stat removed** — superseded by the Today tab, which covers the same
   need more precisely (an explicit day rather than a rolling 7-day window that didn't match any of
   the new tabs' semantics).

**`src/pages/shared/Dashboard.jsx` changes:**
- `<SalesSnapshot>` now also receives `customers={customers}` (needed for the Top Customers lookup
  above).
- **New Customer Visits funnel rebuilt using the same `darkContainer`/`DarkStat` primitives** as the
  Warehouse/Driver/HR/Accounts sections (previously a light `Card`+`CH`) — same 5 stage counts
  (Total Visited/Interested/Not Interested/Final/Distributor Created), same click-to-drill into
  `StageLeadListSheet`, just visually converted. This was the specific fix for the
  dark→light→dark→dark→dark→dark inconsistency flagged in the previous entry — the whole Admin page
  is now dark-panel-first top to bottom with no light interruption before the drill-down `Sheet`s
  (which intentionally stay light throughout, per the established convention).

**Still open:**
- **Not yet browser-tested** — `vite build` and `eslint` clean, zero errors, across the whole
  SalesSnapshot rework + funnel conversion.
- **`invoice.date` is compared as a JS `Date` without the local-calendar-day care taken elsewhere in
  this codebase** (e.g. `db.js`'s `todayStr()`, `period.js`'s `getCurrentPeriod()` both explicitly
  avoid `toISOString()` for this exact reason) — if `invoices.date` turns out to store a bare
  date string, parsing it can land on the wrong side of a day/month boundary near midnight IST.
  Not fixed proactively since it mirrors existing sparse-data uncertainty in this new component;
  flag if Today-tab numbers look off by one day when tested with real timestamps.

### Immediate correction: back to a Line chart + colorized dark theme (same 2 Aug 2026 session,
right after the Bar-chart follow-up above) — BUILT, NOT YET BROWSER-TESTED

User pushed back on two specifics right after seeing the Bar-chart version: wanted a **line** graph
back (not bars), explicitly "date vs value"; and said the dark panels looked "dull because of all
white" and asked for color matching the theme.

1. **`BarChart`/`Bar` → `LineChart`/`Line`, but keeping the non-cumulative per-bucket `buildTrend`
   data from the previous entry** (day-by-day or month-by-month real figures, not a running total).
   This is the actual fix for the original "looks like a straight line" complaint from two entries
   ago — the problem was never line-vs-bar, it was *cumulative* data making any chart type look like
   a ramp. A line over real per-period values reads as a proper "date vs value" trend with real ups
   and downs. Added visible dots (`dot={{r:3}}`, `activeDot={{r:5}}`) so individual date points read
   clearly, matching "date vs value" literally.
2. **Colorized every primary value in `SalesSnapshot.jsx`** that was hardcoded `#fff` (the muted
   gray labels like `#94a3b8`/`#64748b` were left alone — those are intentional secondary-text
   hierarchy, not the "dull" complaint): Revenue big number → cyan `#38bdf8` (matches the chart
   line), Manager Leaderboard values → amber `#fbbf24` (matches the leaderboard's own ★ color),
   Recent Orders value → green `#34d399` (split out of what used to be one plain-gray compound
   line), Top 10 Customers values → purple `#a78bfa`, Top 10 Products values → blue `#60a5fa`
   (`RankedList` gained a `valueColor` prop for this), Stats panel → one accent color per stat
   (Orders Under Process=blue, Stale=red *[unchanged conditional]*, Target Achievement=green, Avg
   Order Value=amber, Goals Pending=purple). All colors reuse the same accent palette already
   established for `DarkStat` across the Warehouse/Driver/HR/Accounts sections — no new colors
   invented, just applied more consistently here too.

**Still open:**
- **Not yet browser-tested** — `vite build`/`eslint` clean, zero errors.

### Top 10 lists gain a share bar + percentage (same 2 Aug 2026 session, right after the line-chart
correction) — BUILT, NOT YET BROWSER-TESTED

**User's ask:** each Top 10 Customers/Products row should show a small colored bar for that row's
value against the total, plus the percentage share in brackets.

`RankedList` (`SalesSnapshot.jsx`) gained a `totalValue` prop — the denominator is the whole period's
`rangeRevenue` (all revenue in the active tab's range), **not** the sum of just the 10 rows shown, so
"42%" reads as "42% of all revenue this period," the more meaningful number. The value text gained a
`(NN%)` suffix in muted gray. Both `<RankedList>` call sites pass `totalValue={rangeRevenue}`.

**Immediate follow-up in the same breath — bar moved inline + made dual-colored:** user clarified the
bar should sit beside the name in the same row (not on its own line below), and be dual-colored —
"this row's value" vs "the rest of the total." Row layout is now one flex line: rank → name
(truncates) → a flexible-width bar → value `(NN%)`. The bar itself is two-tone: a translucent tint of
the list's `valueColor` (`color + '33'`, ~20% alpha) as the full-width track representing the total,
with a solid `valueColor` fill inside it at `width: {share}%` representing this row's slice — same
hue for both tones so it reads as one coherent bar, not two clashing colors.

**Still open:**
- **Not yet browser-tested** — `vite build`/`eslint` clean, zero errors. Sanity check once real data
  is in: do the bar widths/percentages look right, does the inline layout hold up with long
  customer/product names (relies on `flexShrink`/`text-overflow: ellipsis` truncating the name before
  it pushes the bar+value off), and does `rangeRevenue` ever come out `0` in a way that makes every
  bar 0% (e.g. a tab with orders but no invoices yet) — expected behavior, not a bug, but worth
  confirming it reads sensibly rather than looking broken.

**One more same-breath follow-up — bar recolored independent of the value font:** user wanted the
bar's colors distinct from the value text color, and the "remaining" segment to read as a real color
rather than a near-blank gap (it had been a 20%-alpha tint of the same hue, which read as too
subtle). Introduced fixed `BAR_ACHIEVED` (`#34d399` green) / `BAR_REMAINING` (`#475569` slate)
constants, used for every `RankedList` row's bar regardless of list — so the bar is now a consistent
achieved/remaining language across both Top Customers and Top Products, while the value font keeps
its own per-list identity color (purple/blue) as before. Three visually distinct colors per row now:
name (light gray), bar (green/slate), value (purple or blue).

## Monthly Goals schema — CONFIRMED FULLY APPLIED, migration bugs found & fixed (3 Aug 2026 session)

**Ran the outstanding SQL from the previous session's handoff.** Verified via direct
`information_schema`/`pg_constraint` queries (not just "ran it, assume it worked") that everything
was already in place: `members.manager_id` pre-existed, `parameters`/`goals` `.period` columns +
their `unique(member_id, period)` constraints were both already applied and correctly named
(`parameters_member_period_key`, `goals_member_period_key`), Daily Stock Update's `stock_status*`
columns, Production Issues' 6 boolean columns + `product_issue_resolutions` table were all already
live from the prior session. Only `vehicle_allocations.journey_complete_approval_remarks` (Journey
Phase 4) was actually missing — user ran that one `alter table` this session.

**Real migration bug found via live testing:** `alter table parameters/goals add column period ...
default to_char(now(), 'YYYY-MM')` back-filled **every pre-existing row** (the old single-row,
pre-monthly scope/goal data) with the month the migration happened to run in — August 2026, which is
also the live current month. So opening Set Parameters showed old legacy scope/goal selections as if
they were freshly set for August, and Sales Team members whose old goal had been approved under the
old system couldn't re-enter goals for August (the system saw an already-approved row). Fixed by
`update parameters/goals set period = '2026-07' where period = '2026-08'` — moves all pre-existing
rows to July, leaving August genuinely empty for the first real monthly cycle. **Not a code bug** —
purely a one-time `DEFAULT`-backfill side effect; flag this same risk if `period`-style columns are
ever added to another table via a dated default in the future.

**Two real code bugs found via live testing, fixed:**
1. `Parameters.jsx`'s `save()` sent `exp_budget: draft.expBudget` straight through — if the field
   was left untouched, `draft.expBudget` was still the string `''` from its `useState` initializer
   (`p.exp_budget || ''`), and Postgres rejected `''` into a `numeric` column
   (`22P02 invalid input syntax for type numeric`). The toast only ever showed a generic "Error
   saving parameters" with the real Postgres error swallowed — fixed by logging `console.error`
   inline for future debugging, then fixed the actual bug: `exp_budget` is now coerced to `null` or
   `Number(...)` at the save boundary.
2. `db.fetchNotifications`'s `.contains('target_roles', [roleId])` — `target_roles` is `jsonb`, but
   supabase-js's `.contains()` serializes a plain JS array using **Postgres array-literal** syntax
   (`cs.{r1}`), which isn't valid JSON and 400'd against a jsonb column every 30s poll. Fixed by
   passing `JSON.stringify([roleId])` instead — a string argument makes supabase-js insert it as-is,
   producing valid JSON (`cs.["r1"]`). Same underlying gotcha as CLAUDE.md's documented **Recurring
   Bug Pattern #3** (ambiguous-FK class of "the ORM's convenience method doesn't match this exact
   column's Postgres type") — worth checking any other `.contains()`/`.overlaps()` call against a
   `jsonb` (not native array) column if this resurfaces elsewhere.

## Sales Team member dashboard — rebuilt twice this session, light "CRM dashboard" style is final

**First build (dark, Geckoboard-style):** `TeamApp.jsx`'s Home tab (previously a light "My New
Customer Visits" tile row + a light "My Goals" card/meters/breakdown-bars) was replaced with a new
`src/components/TeamSnapshot.jsx`, matching `SalesSnapshot.jsx`'s dark navy theme — Today/Month/Year
tabs, revenue trend, 3 goal meters, Top Customers, New Customer Visits tiles, Products/Categories/
Customers breakdown. `GoalBarChart.jsx`'s `MeterGauge`/`GoalVsAchievedBreakdown` gained an optional
`dark` prop for this (default `false`, zero effect on Admin's existing light drill-down Sheets). The
separate "Goals" tab (`tab==='myGoals'`) was stripped down to **entry status only** — goal value +
`GBadge` status + rejection note + Set/Revise button, no achieved amounts or progress bars (those all
moved to the new Home dashboard) — this part of the change is unchanged by the rebuild below and
still stands.

**Second build, same session, immediately after — full re-theme to light (Coupler.io/Power BI "CRM
dashboard" reference), Team-dashboard-only:** user showed a second reference image and asked for a
white-background, colorful-stat-tile, donut-chart style instead. `TeamSnapshot.jsx` was rewritten
(not incrementally patched) to:
- **5 stat tiles** (solid color blocks): Total Sales (tab-scoped), Won, Win Rate, Open Leads, Avg
  Open Lead Age. Reference panels with no real data equivalent were deliberately omitted rather than
  approximated: Avg Days to Close, Pipeline/Weighted Value (leads have no assigned value before
  conversion), Deal Loss Reasons (only free-text visit notes exist, no structured reason field),
  Deals Projection (no forecasting data), and the multi-owner filter sidebar (Deal Owner/Stage/
  Pipeline/Label — not applicable to a single member's own already-scoped view; the existing
  Today/Month/Year tabs serve as the date control instead).
- **My Pipeline donut** (`ContributionDonut`, already existed in `GoalBarChart.jsx`) + **My Top
  Customers** ranked list side by side — the Top Customers panel fills the visual slot where "Deal
  Loss Reasons" would have gone, rather than leaving it blank.
- **Won Deals & Revenue — Last 12 Months**: new `last12MonthsTrend()` helper, a fixed trailing
  12-month window **independent of** the Today/Month/Year tabs (dual-axis line chart: monthly
  revenue + monthly won-lead count).
- Goal Progress meters + Products/Categories/Customers breakdown kept, just re-themed light (dropped
  the `dark` prop — meaning **`GoalBarChart.jsx`'s `dark` prop is currently unused by anything**;
  harmless dead code, left in case a future dark-themed page wants it rather than re-adding it).
- Admin's `SalesSnapshot.jsx` and the dark Warehouse/Driver/HR/Accounts sections were explicitly
  **not** touched by this rework — confirmed via AskUserQuestion before building.

**Three follow-up bugs found via live testing, all fixed:**
1. The "Revise & resubmit" / "Goals submitted — waiting for review" banners in `TeamApp.jsx` rendered
   unconditionally (outside any `tab===` check), so they showed above the new Home dashboard too.
   Gated both to `tab === 'myGoals'` only.
2. Goals tab had no period heading — added a plain `formatPeriodLabel(currentPeriod)` heading at the
   top of the `myGoals` tab content.
3. **No validation existed** preventing a Sales Value goal smaller than the sum of its own
   customer-wise goals. `GoalEntrySheet`'s `handleSubmit` now blocks submission with an inline error
   (new local `error` state, rendered in the Sheet) if `custTotal > valueGoal` when both
   `enable_value` and `enable_customers` are on.

**Real design bug found via live testing — "pipeline figures aren't changing with Today/Month/Year",
same problem on both dashboards, all fixed:**
- `TeamSnapshot.jsx`'s Won/Win Rate/Open Leads/Avg Open Lead Age tiles and My Pipeline donut were
  receiving **pre-aggregated all-time counts** from `TeamApp.jsx` (`stageCounts`/`visitedLeadCount`/
  `openLeads`/`wonLeads`) — these never changed regardless of the active tab. Fixed by passing the
  **raw** `myVisits`/`myLeads` records down instead, and computing stage counts/visited-count/
  open-leads/avg-age *inside* `TeamSnapshot` scoped to the active tab's date range — a visit counts
  for a period by its own `visit_date`, a lead's current stage counts by `stage_updated_at` (already
  stamped on every stage change by `db.updateDistributorLeadStage`). The stage-drill `LeadListSheet`
  (opened by tapping a tile) deliberately stays all-time, unaffected — same convention as every other
  drill-down Sheet in this app.
- **Same bug on Admin's dashboard, two spots:** `SalesSnapshot.jsx`'s Orders Under Process/Stale
  Orders/Avg Order Value stats were computed from the full `orders` array, not scoped to the active
  tab — now filtered by `order_date` into the range first (Target Achievement/Goals Pending stay
  monthly-only, matching how goals have no daily/yearly granularity; Recent Orders stays an
  intentional all-time "latest activity" feed).
- **The "New Customer Visits" funnel on `Dashboard.jsx`** (Admin) is a *separate* component from
  `SalesSnapshot` with no tab control of its own — it always showed all-time totals no matter what
  tab `SalesSnapshot` was on. Fixed by **lifting the tab state up to `Dashboard.jsx`** (`SalesSnapshot`
  is now a controlled component, accepting `tab`/`setTab` as props instead of owning internal state)
  so both panels always show the same period, and scoping the funnel's visit/stage counts the same
  way as the fixes above.
- `rangeForTab()` existed as a private copy in both `SalesSnapshot.jsx` and `TeamSnapshot.jsx` —
  deduped into a single `export function rangeForTab(tab, now)` in `src/lib/period.js` (this also
  avoided a `react-refresh/only-export-components` lint error that exporting it directly from
  `SalesSnapshot.jsx` alongside its default component export would have caused).

**Still open / not yet re-verified in browser after the tab-scoping fix (this is the very next thing
to check in a new session):**
1. On the Sales Team member's Home tab, switch Today → This Month → This Year and confirm Won/Win
   Rate/Open Leads/Avg Open Lead Age/My Pipeline donut actually change numbers (they visibly didn't
   before this fix — screenshot showed identical figures across a manual page reload).
2. On Admin's Dashboard, same check: switch tabs on `SalesSnapshot` and confirm both its own stats
   AND the New Customer Visits funnel tiles below it move together.
3. Try submitting a goal where a customer-wise value exceeds the Sales Value goal — confirm the new
   inline error blocks it instead of silently accepting.
4. Confirm the Won Deals & Revenue (Last 12 Months) chart still renders sensibly (it's intentionally
   NOT tab-scoped, always trailing 12 months) — was never re-checked after being built.
5. Re-confirm Set Parameters / a fresh monthly goal cycle works cleanly now that legacy rows were
   moved off of the `2026-08` period (per the migration-bug fix above) — this was mid-verification
   when the dashboard-rebuild detour started and hasn't been explicitly closed out.

### To continue in a new chat
**Attendance / Punch-In System is fully built, schema-applied, and browser-confirmed working** as of
the 2 Aug 2026 session (commits `42c9797` → `190c1ac`). Nothing further needed to pick it back up.

**Daily Stock Update + Production Issues (3M) + auto-resolve for Warehouse Manager are all built but
not yet live** (this session) — run all three SQL migrations above (stock_status columns, 3M boolean
columns, `product_issue_resolutions` table — can combine into one script), check the `stockUpdate`
and `productionIssues` menu boxes for both the Warehouse Manager and Admin roles in Settings, then
browser-test:
1. WM marks a product Wait/Unavailable on Daily Stock Update → confirm the product's `<option>` row
   in the Sales Team's Distributor Order dropdown shows amber/red, and (for Unavailable) can't be
   selected.
2. WM ticks a 3M reason on a product (the "Issues" button/Sheet on the same page) → confirm it shows
   up on the Production Issues page for both Admin and WM (itemwise and issuewise), and that ticking
   a Manpower reason specifically also shows up on the HR/Admin Attendance page's new card.
3. WM flips that product's status back to Available → confirm the ticked issue(s) auto-clear, and
   show up with a resolved-at timestamp on the Production Issues page's new "Resolved" tab. Also
   confirm manually unticking a checkbox (without changing status) logs a resolution the same way.

**Monthly Goals + Org→Manager→Member Dashboard — schema is applied, manager-assignment walkthrough
done.** Note: the Org-level Today/Monthly/Custom tabs + meters/donut/breakdown-bars display
described earlier in this file's history no longer exists at the top level — it was superseded by
`SalesSnapshot` (see "Bigger picture" and the entries after it). Manager/Member drill-down
(`ManagerLevelSheet`/`MemberGoalDetail`, with their own meters/donut/breakdown-bars) is still fully
intact and reached via the Sales snapshot's Manager Leaderboard instead of a separate Managers list.
Browser-test in order:
1. Confirm managers are assigned (Parameters.jsx dropdown) for at least one Sales Team member, and
   that member has at least one approved goal field for the current month (needed for any chart to
   show real data — otherwise every section reads "No approved goals for this period").
2. In `SalesSnapshot`'s Manager Leaderboard, tap a manager → confirm `ManagerLevelSheet` opens with 3
   meters + the Member-contribution donut + team member list.
3. **The specific thing that was broken once already:** tap a Team Member from inside that Manager
   sheet → confirm `MemberGoalDetail` visibly opens on top (was previously hidden behind the Manager
   sheet due to a z-index bug, fixed via `Sheet`'s `zIndex` prop, Dashboard passes 320 for the member
   level) — re-confirm this still holds after all the later `SalesSnapshot` rework.
4. Confirm `Targets.jsx`'s per-member drill-down no longer crashes (the old bug) and matches
   Dashboard's Member-level numbers for the same person/period.
5. `TeamApp.jsx`'s Home tab is now the light "CRM dashboard"-style `TeamSnapshot.jsx` (see the
   session entry above this one for the full rebuild + tab-scoping fix history) — this superseded
   the old "My Goals" card described earlier in this file's history. Confirm the Goal Progress
   meters + Products/Categories/Customers breakdown still show correctly for approved goals, and
   that the attendance calendar below the snapshot still works as before.
6. **Log in as Admin specifically:** scroll down past the Sales section on
   `Dashboard.jsx` and confirm the Warehouse/Driver/HR/Accounts sections appear (Manager should NOT
   see these), tile counts look right, tapping a tile opens the right drill Sheet, and each "View
   full X" link actually navigates there. Specifically check Expenses Pending shows the same count
   in both HR and Accounts sections, and that the top-of-page row no longer shows the old standalone
   Expenses/Invoices tiles (intentionally removed, moved into the sections). See "Bigger picture:
   role-specific dashboards + Admin rollup" above for exactly what each section fetches and shows.

**The visual design pass is done for the whole Admin dashboard** — Sales/Warehouse/Driver/HR/
Accounts sections plus the New Customer Visits funnel all now use the dark-panel treatment,
colorized (not all-white) per the last entry, and `SalesSnapshot` has Today/This Month/This Year
tabs, a **line** revenue trend (date vs. value, non-cumulative), and Top 10 Customers/Products
panels, each row with a dual-toned share bar + percentage. Read the 5 entries above in order ("Sales
section replaced...", "Design pass extended...", "SalesSnapshot follow-up...", "Immediate
correction...", "Top 10 lists gain a share bar...") for the full history — NONE of it has been
browser-tested yet, this whole dashboard rework happened across one long chat without
a single real render check. Full read-through needed first: switch between all 3 tabs and confirm
the revenue line/Top 10 panels update and the line shows real per-period values (not a flat ramp);
confirm the Sales leaderboard still opens Manager/Member drill-down correctly (the z-index concern
from earlier in the session); confirm the New Customer Visits funnel's click-to-drill still works;
confirm all four Warehouse/Driver/HR/Accounts dark panels still render/drill correctly; general
visual gut-check that the colorization reads as "colorful," not garish.

Also still open from earlier in the same overall session, untouched since — unrelated to the above:
1. **Journey Phase 4** (vein-diagram timeline, admin remarks, PDF export, Approved Journeys lists) —
   `journey_complete_approval_remarks` was added to `vehicle_allocations` in the 3 Aug 2026 session
   (see the schema entry above this one); still not browser-tested.

## Browser-test round — dashboard rework CONFIRMED WORKING via headless Playwright (3 Aug 2026
session, separate from the build session). No project skill existed for running this app; installed
Playwright into the scratchpad (not the repo — reverted an accidental `npm install -D playwright`
that had dirtied `package.json`/`package-lock.json` first) and drove real logins against the live
Supabase instance as `arjun@co.com` (Sales Team) and `admin@co.com` (Admin).

**All 5 outstanding checklist items from the previous session's handoff — confirmed:**
1. Sales Team Home tab (`TeamSnapshot.jsx`): Today/This Month/This Year tabs verified to actually
   change Won/Win Rate/Open Leads/Avg Open Lead Age/My Pipeline donut — Today showed all zeros, This
   Month showed partial data, This Year showed real distinct numbers (Won=3, Win Rate=50%, Open
   Leads=2, Avg Open Lead Age=13d, 6 total visited). Confirms the earlier tab-scoping fix holds.
2. Admin `SalesSnapshot` + New Customer Visits funnel: confirmed both move together per tab (Today →
   both show zeroed/"(TODAY)"-labeled data; This Year → both show matching real numbers, e.g. funnel's
   6 total visited/1 Interested/1 Not Interested/1 Final/3 Distributor Created matches Arjun's own
   This-Year pipeline numbers exactly, since he's the only rep with data).
3. Goal-entry validation (`GoalEntrySheet`): confirmed blocking. Arjun's real August data already had
   customer-wise goals summing to ₹4,70,000 against an approved ₹3,00,000 Sales Value goal (pre-dates
   this validation), so clicking "Submit for approval" on the Revise sheet with no edits immediately
   surfaced "Sales value goal (₹3,00,000) cannot be less than the sum of customer-wise goals
   (₹4,70,000)." and did not submit — re-verified via Goal Approvals' "View details" that the rejected
   fields (Tech Mahindra Svc-NGH, Lubricants, Brake Fluids) were still sitting at `Rejected`, not
   bumped to pending.
4. "Won Deals & Revenue — Last 12 Months" line chart: renders sensibly — real per-month values with
   an actual peak (Jul 2026) and nothing else, not an artificial ramp.
5. Set Parameters + Goal Approvals: both correctly scoped to "August 2026" with no trace of the old
   July-migrated legacy rows bleeding through (confirms the `period='2026-07'` backfill fix from the
   previous session took).
6. Manager → Member drill-down (the z-index regression fixed earlier): re-confirmed live — clicking
   "Meera Iyer" in the Manager Leaderboard opens `ManagerLevelSheet`, and clicking "Arjun Nair" inside
   it opens `MemberGoalDetail` correctly on top (visibly, not hidden behind).

**New, previously-undocumented bug found while testing (not one of the 5 checklist items, surfaced
via a stray `HTTP 400` caught in the browser console):** the `notifications` table's `target_roles`
column **does not actually exist** in this Supabase instance — confirmed via a direct REST query
(`column notifications.target_roles does not exist`, code `42703`). This means `db.fetchNotifications`
has been 400ing on every 30s poll for every logged-in user since `NotificationBell.jsx` was built (1
Aug 2026 session) — the bell has never actually been able to show a notification, including the
loading-complete alert to Admin/Accounts, HR's location-flag alerts, and the journey-submitted alert
to Admin. The `.contains()` JSON-encoding fix documented in the "Monthly Goals schema" entry above
*is* correctly in place in the code (`JSON.stringify([roleId])` produces valid `cs.["r1"]` syntax) —
this is a separate, deeper problem: the column itself was apparently never applied to this database,
despite being documented as built. **Needs:** re-run (or verify) the `create table notifications (...
target_roles jsonb ...)` migration from the 1 Aug 2026 session — table exists (0 rows) but is missing
at least this column.

**Confirmed still-present, not a regression:** the legacy `attendance` table query
(`db.fetchAttendance`, called unconditionally from `useData.jsx`'s `loadAll()` on every single page
load regardless of role) still 400s (`column attendance.month does not exist`) — this is the exact
issue already flagged under Deferred/Known Issues as safe to delete once the new
`attendance_punches` system is confirmed working, which it now is. Worth actually deleting
`fetchAttendance`/`upsertAttendance` + the dead `useData.jsx` call next time this area is touched,
since it fires needlessly on literally every page load for every user.

**Not touched by this pass:** Journey Phase 4 (vein-diagram/PDF/remarks) — still not browser-tested,
unrelated to the dashboard work above.
2. **POD photo upload** (Phase 3, older, still parked) — needs a new Supabase Storage bucket.

## Admin Dashboard: Distributor Presence Map — BUILT, BROWSER-TESTED & CONFIRMED WORKING
(4 Aug 2026 session)

New Admin-only Dashboard section (`src/components/DistributorPresenceMap.jsx`, wired into
`Dashboard.jsx`'s existing `role?.id === 'r1'` block as the first section, before Warehouse): every
billable distributor (`type !== 'New Customer'`) with `confirmed_latitude`/`confirmed_longitude`
set is plotted on a Leaflet+OpenStreetMap map (same CDN-loader/no-npm-package pattern as
`RouteMapSheet.jsx`/`VehicleLiveMap.jsx`), colored by billing recency: green = billed this calendar
month, orange = billed within the last 3 months (not this one), red = not billed within 3 months or
never. Pure client-side derivation off `distributors`/`invoices`, both already in `useData()`
context — no new fetch, no new `db.js` function, no schema change. Distributors missing lat/long are
excluded from the map with a visible count rather than silently dropped. Marker click = a simple
Leaflet popup (name, type, last-billed date), no new detail Sheet.

**Real bug found and fixed in the same session, unrelated to the map itself but surfaced while
scoping "billed":** CLAUDE.md previously claimed `achievementEngine.js` gates on
`invoice.status === 'approved'`, but that guard had never actually landed in the code (confirmed via
`git log -S` — zero matching commits) — `pending_approval` invoices were silently counting toward
every achievement number `computeAchievements` feeds (Dashboard, Team/Manager goal views, etc.).
Fixed by adding the guard back at the top of the invoice loop. Zero live invoices are currently
non-`'approved'` (checked via a live REST query before/after), so this changed no numbers today —
it only closes the gap for future pending invoices. Added a regression test to
`achievementEngine.test.js` (now 4/4 passing, `node --test src/lib/achievementEngine.test.js`).

**Browser-tested via the new `run-workforce` skill** (first real use of that skill for a feature,
not just its own verification) — logged in as Admin, confirmed against live data:
- 8 distributors plotted, 5 excluded for missing location — cross-checked directly against a raw
  REST dump of the `distributors` table: exactly matches (13 billable minus 5 null-lat/long = 8).
- Bucket counts (green=1, orange=4, red=3) cross-checked against the live `invoices` table by hand,
  per-distributor — exact match, including one never-billed distributor correctly landing red.
- Marker popup content verified accurate against the DB (name, type, and last-billed date all
  correct) via a live click.
- Zero console errors (excluding the two known pre-existing 400s, see the `run-workforce` skill's
  Gotchas).

**Judgment call made without a 4th clarifying question (flag if wrong, easy to change):**
`distributors.type` has a `'Direct'` value in addition to `'Distributor'`/`'New Customer'`, meaning
undocumented elsewhere — the map includes both `'Distributor'` and `'Direct'` (excludes only
in-pipeline `'New Customer'` leads). Narrow to `type === 'Distributor'` only if `'Direct'` shouldn't
appear here.

**Follow-up same session: locked the map to Odisha's extent, not the earlier auto-fit-to-markers.**
User asked for "the state map of Odisha in country India only" — clarified via AskUserQuestion to
mean a fixed Odisha-scoped view (no boundary-outline GeoJSON, that's still explicitly out of scope),
not auto-zooming to wherever the plotted distributors happen to be. First attempt used
`map.fitBounds(ODISHA_BOUNDS)` at init, which looked wrong when actually rendered — Leaflet's
`fitBounds` picks a zoom constrained by whichever container dimension is the tighter fit, and this
component's map container is much wider than tall while Odisha's bounding box is roughly square, so
it zoomed out far enough to fit the box's height and showed a huge unwanted swath of India
(Maharashtra to Bangladesh). Fixed by using a fixed `setView([20.5, 84.5], 7)` (center + zoom tuned
by eye against the actual rendered container) instead of `fitBounds`, still with a soft
`maxBounds`-based pan restriction. The marker-sync effect's per-render `fitBounds(markerBounds)` call
was also removed entirely — the map now always shows the same Odisha-centered view regardless of
where the plotted distributors fall, rather than re-zooming on every data change.

**Second follow-up same session: moved from an inline Dashboard section to its own standalone menu,
"Geographical Business View."** User asked for this after seeing it embedded in the Admin dashboard.
`DistributorPresenceMap.jsx` moved from `src/components/` to `src/pages/shared/` and now reads
`distributors`/`invoices` directly via `useData()` instead of taking them as props (no longer nested
inside `Dashboard.jsx`, which had the funnel/customers already in scope — a standalone routed page
needs its own context access). New menu id `geoBusinessView` added to both `WebApp.jsx`'s
`ALL_MENUS`/`PAGE_MAP` and `Settings.jsx`'s separate copy, per Recurring Bug Pattern #6, placed in
the `Distributor Functions` section next to `vehicleLiveMap` ("Live Tracking"). Map height bumped
440→600 now that it has a full page instead of a cramped dashboard slot. The old Dashboard.jsx
embedding (import + `SectionHeader` + component usage inside the `role?.id === 'r1'` block) was
removed entirely.

**A confusing debugging detour, root-caused, worth remembering:** after wiring the menu, a fresh
Admin login didn't show "Geographical Business View" in the sidebar. Chased it through several dead
ends — suspected the Settings checkbox toggle wasn't persisting (it briefly wasn't: `Settings.jsx`'s
role tabs sort **alphabetically by name**, so the default-selected tab was "Accounts," not "Admin" —
toggling the checkbox without first explicitly clicking the "Admin" tab was silently editing the
wrong role; a checkbox's `checked` appearance right after a click can't be trusted either, since the
native DOM toggles before React's async-save-then-`setState` reconciles, so it *looked* saved when it
wasn't). Once the DB was confirmed correct for `r1` (verified via a direct REST read, not just the
UI), the menu STILL didn't appear on screen — turned out the sidebar item was there in the DOM the
entire time, just scrolled below the screenshot's visible area: `WebApp.jsx`'s sidebar menu list is
`overflowY: auto` with a fixed-height parent, the same class of "internally-scrolling region a
full-page screenshot can't see" issue already documented for the main content area, just a second
instance of it nobody had hit before. All three lessons (sidebar scroll, alphabetical role-tab
default, don't-trust-a-post-click-checkbox-screenshot) folded into the `run-workforce` skill's
Gotchas so they don't cost a debugging session again.

**Nothing outstanding** — schema-free, fully tested end-to-end same session (including both
follow-ups, re-verified by screenshot/DOM query after each fix).

## Distributor terminology, ungated Distributors achievement, auto "Other Distributors" target,
## Admin goal reset, and two real bugs found via live testing (4 Aug 2026 session)

**Terminology rename (display-only, no field/column renames):** this app's goal-setting feature was
built around "Customer" (`enable_customers`, `sel_custs`, `goal.customers`, `ach.custs` — all
unchanged in code) but the business vocabulary is "Distributor" (Distributors master,
`distributor_visits`, the "Distributor Created" pipeline stage). Renamed every user-facing label:
`Parameters.jsx`'s "Customer-wise value" toggle → "Distributor-wise value" (and its member-row
summary tag), `GoalApprovals.jsx`'s `"Customer: {name}"` field label → `"Distributor: {name}"`,
`TeamSnapshot.jsx`/`SalesSnapshot.jsx`'s "My/Top 10 Customers" ranked lists → "...Distributors",
`TeamSnapshot.jsx`/`MemberGoalDetail.jsx`'s "Customers" breakdown panel title → "Distributors".

**"Distributors" achievement now matches "Distributor Created" everywhere:** the Goal Progress
"Distributors" meter (`acq`) previously only counted an achievement once the manager approved that
specific field (`achievementEngine.js`/`goalAggregation.js` both gated on `goal.acq_status ===
'approved'`), while the pipeline's "Distributor Created" tile/donut counts the real event
unconditionally — same real-world event (`lead_stage === 'final_approved'`), two different numbers
on the same screen. Fixed: the **achieved** count is now ungated (target/goal number still requires
approval, unchanged for every other field) — applies everywhere `aggregateForMembers` is used
(Team dashboard, `MemberGoalDetail`, `ManagerLevelSheet`, org level), so it's one shared fix.
**Second layer of the same bug, found via live testing:** even ungated, the meter could still
disagree with the pipeline tile because Goal Progress is always calendar-month (goals only exist
per month) while the pipeline's Today/Month/Year tab can be set to something else — so
`TeamSnapshot.jsx`'s Distributors meter now computes its achieved value directly from `myLeads`
fixed to the **current calendar month regardless of the active tab**, guaranteeing exact parity with
the pipeline whenever that tab is on "This Month" (the natural comparison), rather than trusting
`myAgg.acq.achieved` (which could be scoped differently depending on what the top tab happened to be
set to). Live-tested: confirmed showing `0/5` was correct in one case (no distributor actually
created in August yet, only in earlier months) — not a residual bug.

**Auto "Other Distributors" target:** distributor-wise targets are only set for specific named
distributors (`param.sel_custs`); the overall Sales Value goal covers *all* distributors for that
member. `GoalEntrySheet.handleSubmit` (`TeamApp.jsx`) now auto-computes `Other Distributors target =
Sales Value goal − sum(named distributor targets)` on every submit (never typed by hand) and stores
it as `goal.customers.__other__` — deliberately with **no independent approval status**, it inherits
`value_status` instead (checked directly wherever needed, e.g. `achievementEngine.js`'s customer-value
loop rolls up every invoice from a distributor *not* individually named into this bucket once
`value_status === 'approved'`; `goalAggregation.js` adds the `'__other__'` row to the customer
breakdown the same way, display-named "Other Distributors" via a `toRows()` special-case).
Read-only in both the Goals tab and `GoalApprovals.jsx`'s review sheet (informational line, no
separate Approve/Reject control — "inherits Sales value's approval, no separate action needed").
**Relaxed same-session, follow-up ask:** originally only applied when `param.enable_customers` was
also on; changed so it's independent of that toggle — if a member has no named distributors at all,
`Other Distributors` becomes the **entire** Sales Value goal (nothing is named, so everything rolls
up), rather than the panel not appearing at all. This is what makes the breakdown panel
(`myAgg.customers.length > 0`) show up universally whenever a Sales Value goal exists.

**Admin goal reset:** `GoalApprovals.jsx` gained an Admin-only (`role?.id === 'r1'`) `AdminGoalReset`
section below the existing pending-review list — a period picker (`listRecentPeriods()` from
`lib/period.js`) + every member with a non-draft goal for that period + a **Reset** button (confirm
step) that calls new `db.resetGoal(memberId, period)` (upserts a fully-zeroed row: all goal
values/statuses null/0, `status: 'draft'`, `submitted_at`/`reviewed_at` cleared — the row stays
present with real zeros, not deleted). If resetting the *live* current period, also pushes the
zeroed goal into the shared `useData` context immediately so the rest of the app reflects it without
a reload.

**Two real bugs found via live testing, both fixed:**
1. **`GoalEntrySheet`'s value-tracking object wasn't actually a ref, despite its own comment
   claiming so** (`TeamApp.jsx`) — `const vals = {}` was a plain object literal recreated on every
   render. Submitting a goal that failed the Sales-Value-vs-distributor-targets validation called
   `setError(...)`, a state update that re-renders the component and silently reset `vals` back to
   `{}` — but the uncontrolled `<input defaultValue=...>` DOM elements kept showing whatever was
   typed, since their `defaultValue` prop hadn't changed. If the member then clicked Submit again
   without retyping every field (reasonably assuming the visibly-typed numbers would be used), those
   fields silently reverted to their old stored value (0, for a fresh goal) instead of what was on
   screen — this is exactly what surfaced as "Manager's review shows ₹0 for distributors I definitely
   typed values into." Fixed by switching to a real `useRef({})` that survives re-renders.
2. **`getGoalOverallStatus`'s status-precedence logic hid rejections** (`achievementEngine.js`) — it
   only returned `'partial'` when there was a mix of `approved` **and** `rejected` fields
   (`hasApproved && hasRejected`). A manager reviewing goals field-by-field commonly rejects one
   field before getting to the rest, leaving them at `'pending'` (not yet `'approved'`) — in that
   case `hasApproved` was false, so the check fell through to `if (hasPending) return 'pending'`,
   masking the rejection entirely. Since `TeamApp.jsx`'s `canEnter`/`hasRejected` (which gate whether
   the "Revise & resubmit" button even renders) only check for `'partial'`/`'rejected'`, the member
   had **no way to even open the revision screen** for a field that was, underneath, already marked
   `rejected` and individually editable. Fixed: any rejection now yields `'partial'` regardless of
   whether other fields are still pending or approved. Added a regression test in the (pre-existing,
   previously undiscovered until this session) `src/lib/achievementEngine.test.js` — run via
   `node --test src/lib/achievementEngine.test.js`, 3/3 passing.

**Still open / not yet browser-tested (this is the very next thing to check in a new session):**
1. Submit a goal with named distributor targets smaller than the Sales Value goal → confirm "Other
   Distributors" appears correctly (Goals tab, Goal Approvals review, dashboard breakdown chart) in
   both cases: distributor-wise tracking enabled with some named distributors, AND disabled entirely
   (should show the full Sales Value as "Other Distributors" in the latter case).
2. Confirm the Distributors meter's achieved count now matches "Distributor Created" when the top
   tab is on "This Month" specifically (already spot-checked once live, showing correctly).
3. Try Admin's new Reset on an approved goal for the current or a past month → confirm the member
   sees a fresh "Set my goals" prompt for that month afterward.
4. **Reject one field while leaving the rest pending** (not approving anything else) → confirm the
   member now sees "Revise & resubmit" and can edit that specific field — this was completely broken
   before the `getGoalOverallStatus` fix (silently invisible to the member).
5. Trigger the Sales-Value-vs-distributor-targets validation error, do NOT retype every field, just
   lower one number and resubmit → confirm the other, untouched fields submit with their
   visibly-typed values, not stale zeros (the `useRef` fix).
6. Spot-check the "Customer" → "Distributor" label renames read naturally everywhere they appear.

## Distributor Secondary — Beats, Retail Outlets, secondary order-taking (4 Aug 2026 session) — BUILT,
## SCHEMA NOT YET APPLIED, NOT YET BROWSER-TESTED

Brand-new feature, not discussed in any prior session (confirmed by searching CLAUDE.md and the
codebase before starting). New Sales Team menu (More → **Distributor Secondary**): a rep creates
**Beats** under a Distributor, then walks a beat's **Retail Outlets** during a field run taking
orders (or logging "no order" with a reason) through a cart-style item picker, ending in a day-end
summary with individual order PDFs and a batch ZIP download.

**Resolved via AskUserQuestion before building:**
- **Counts toward the existing "Outlet Visits" goal** — every retail-outlet visit (order or
  no-order outcome) feeds the same `ach.visits` achievement bucket the Monthly Goals system already
  tracks, additive with the existing New-Customer-Visit source (`distributor_visits`). Not otherwise
  integrated with invoicing or stock — a self-contained log beyond that one hook.
- **Coverage Days is descriptive only** — no day-of-week enforcement on starting a visit.
- **Batch download = real individual PDF files in a ZIP**, not one combined multi-page print
  document — a first for this codebase (every prior export, `printInvoice.js`/`printJourney.js`,
  uses `window.print()`, zero libraries). Added `jspdf` (PDF generation) + `jszip` (bundling) —
  flagged the same way Recharts was when it became this app's first charting dependency.
  **Bundle-size note:** `jspdf` pulls in `html2canvas` (~199kB) as a transitive dependency even
  though the PDFs here are built from pure text/line drawing calls, not HTML rendering — main chunk
  grew from ~322kB to ~486kB gzipped.
- **Sequence with jump** — checkout/no-order auto-advances to the next un-visited outlet in the
  beat's list (creation order); closing the cart sheet manually instead returns to the outlet list,
  which is always reachable to jump to any other outlet out of sequence.

**Built:**
1. **Schema** (5 new tables — see "Schema" below) — `beats`, `retail_outlets`, `secondary_orders`,
   `secondary_order_items`, `retail_visits` (the last one is the achievement source: one row per
   outlet-visit attempt regardless of order/no-order outcome).
2. **`db.js`** — `createBeat`/`fetchMyBeats` (Beat ID `BT-NNNN`, sequential, same
   count-then-pad-then-prefix pattern as `createLoad`'s `LD-DDMMYYYY-NN`), `createRetailOutlet`/
   `fetchOutletsForBeat` (Outlet ID `RO-NNNN`, same pattern, globally unique per the ask),
   `createSecondaryOrder` (Order ID `SO-DDMMYYYY-NN`, exact `createLoad`/`createDistributorOrder`
   two-step header-then-items insert pattern), `createRetailVisit`,
   `fetchRetailVisitsForDate`/`fetchSecondaryOrdersForDate` (day-end summary), `fetchRetailVisits`
   (global, dateRange-filterable — feeds the achievement hook).
3. **Achievement hook** — `achievementEngine.js`'s `computeAchievements` gained a `retailVisits`
   param (inserted before `dateRange` in the positional signature — only one call site,
   `useData.jsx`, updated alongside it) with its own loop incrementing `ach.visits` the same way the
   existing `distributor_visits` loop does (gated on `goal.visits_status === 'approved'`, filtered
   by `inRange`). `useData.jsx` fetches `retail_visits` globally (same lightweight pattern as the
   existing `visits` fetch) and exposes `retailVisits`/`setRetailVisits` in context.
4. **`src/pages/shared/DistributorSecondary.jsx`** (new) — Beats tab (list + Create Beat sheet:
   distributor select from `myDistributors`, name, Mon–Sun coverage-day toggles) → Start Retail
   Visit (outlet list per beat with today's status badge, Add Outlet sheet with the same
   promise-wrapped soft-fail `getLocation()` pattern already in `NewCustomerVisit.jsx`) → Item Order
   cart (**new UI pattern for this app** — existing `DistributorOrder.jsx` only has a dropdown+Add
   picker, not a browsable cart: category pills filtering a scrollable product list, qty steppers,
   live cart total, respects `stock_status` same as `DistributorOrder.jsx`'s dropdown does) → Day
   Summary tab (outlet-wise + product-wise rollup for today, per-order PDF download, batch ZIP
   button).
5. **`src/lib/printSecondaryOrder.js`** (new) — `buildSecondaryOrderPdf()` draws a jsPDF document
   directly via text/line calls (header/meta block + line-items table + total, same layout spirit as
   `printInvoice.js`'s HTML version) — deliberately not using jsPDF's `.html()` + `html2canvas` path,
   to keep rendering fast even though the dependency itself still gets bundled either way.
   `downloadSecondaryOrderPdf()` single-file save; `downloadSecondaryOrdersBatch()` builds every
   order's PDF as a blob, bundles via `JSZip`, triggers one ZIP download.
6. **Menu wiring** — new menu id `distributorSecondary` added to `TeamApp.jsx`'s `MORE_ITEMS` and
   mirrored into `Settings.jsx`'s separate `ALL_MENUS` copy per Recurring Bug Pattern #6.
   **Deliberately NOT added to `WebApp.jsx`'s own `ALL_MENUS`/`PAGE_MAP`** — unlike its closest
   sibling `distributorOrder` (which IS registered in both shells, giving Manager/Admin access via
   WebApp.jsx's sidebar too), this pass is Sales-Team-only per the ask ("new menu option in sales
   team apps"). Revisit only if Manager/Admin need their own visibility into beats/outlets/secondary
   orders later — the pattern to mirror is already sitting right there in `distributorOrder`.

**Schema — NOT yet applied, user must run:**
```sql
create table beats (
  id text primary key,
  distributor_id text not null references distributors(id),
  name text not null,
  coverage_days jsonb not null default '[]',
  created_by bigint references users(id),
  created_at timestamptz not null default now()
);

create table retail_outlets (
  id text primary key,
  beat_id text not null references beats(id),
  name text not null,
  number text,
  lat double precision,
  lng double precision,
  created_by bigint references users(id),
  created_at timestamptz not null default now()
);

create table secondary_orders (
  id text primary key,
  outlet_id text not null references retail_outlets(id),
  beat_id text not null references beats(id),
  distributor_id text not null references distributors(id),
  member_id bigint not null references users(id),
  order_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table secondary_order_items (
  id bigserial primary key,
  order_id text not null references secondary_orders(id),
  product_id text not null references products(id),
  category_id text references categories(id),
  qty numeric not null,
  rate numeric not null
);

create table retail_visits (
  id bigserial primary key,
  beat_id text not null references beats(id),
  outlet_id text not null references retail_outlets(id),
  member_id bigint not null references users(id),
  visit_date date not null default current_date,
  outcome text not null,
  no_order_reason text,
  order_id text references secondary_orders(id),
  created_at timestamptz not null default now()
);
create index retail_visits_member_date_idx on retail_visits(member_id, visit_date);
```

**Still open / not done yet:**
- **Schema not yet applied** — nothing in this feature works until the 5 tables above exist.
- **Admin's `distributorSecondary` menu box not yet checked** for the Sales Team role in Settings.
- **Not browser-tested** — same constraint as every other feature built this session (no
  chromium-cli/Playwright in this Windows dev environment). `vite build` + scoped `eslint` clean
  (zero new errors on the 2 new files; pre-existing error counts on touched files — `useData.jsx`'s
  1 pre-existing `react-refresh/only-export-components`, `Settings.jsx`'s 1 pre-existing unused
  `Inp` import, `TeamApp.jsx`'s 10 pre-existing errors — all confirmed identical before/after via
  `git stash` diff, nothing new introduced). Full flow to verify once schema is live: create a beat →
  add/select an outlet → build a cart order → checkout → confirm it appears in today's Day Summary
  (outlet-wise and product-wise) → try "No Order" with a reason on another outlet → download one
  order's PDF and the batch ZIP → confirm the Outlet Visits achievement number moves for both
  outlets visited (order and no-order) once that goal field is approved for the member.
- **No Admin/Manager visibility screen** — deliberate scope cut for this pass, see menu-wiring note
  above.

## Browser-test round 2 — everything from the 4 Aug 2026 session CONFIRMED WORKING (same-day
## follow-up, user tested live and reported back "all complete and ok")

All outstanding items from this session's earlier handoff are now confirmed working end to end:
- **Distributor Secondary** — schema applied, `distributorSecondary` menu enabled for Sales Team,
  full flow confirmed: create beat → add/select outlet → cart order → checkout → Day Summary
  (outlet-wise + product-wise) → No Order with reason → individual PDF + batch ZIP download →
  Outlet Visits achievement moves correctly.
- **Distributor terminology / ungated Distributors achievement / auto Other Distributors / Admin
  goal reset / two goal-workflow bug fixes** (commit `4963e57`) — all 6 checklist items confirmed:
  Other Distributors appears correctly (with and without distributor-wise tracking enabled), the
  Distributors meter matches "Distributor Created" on "This Month," Admin's Reset Goal action works,
  rejecting one field while others stay pending now correctly shows "Revise & resubmit," resubmitting
  after a validation error no longer loses untouched field values, and the Customer→Distributor
  label renames read naturally throughout.
- **Daily Stock Update / Production Issues (3M)** — menu boxes checked, full flow confirmed (status
  dropdown affects the Distributor Order product picker, 3M issue ticking/auto-resolve, Resolved tab).
- **Journey Phase 4** (vein-diagram timeline, admin remarks, PDF export, Approved Journeys lists) —
  confirmed working.
- **`notifications` table** — `target_roles` column issue resolved, notification bell working.

**Nothing outstanding from this session remains open.** Only pre-existing, explicitly-deferred items
carry forward unchanged: Journey Phase 2's live GPS ping (needs a real moving vehicle to test,
user's call to defer), and POD photo upload (needs a new Supabase Storage bucket, not started).

## Products: Lowest Unit + Alternate Unit with conversion factors (4 Aug 2026 session) — BUILT,
## SCHEMA NOT YET APPLIED, NOT YET BROWSER-TESTED

Brand-new concept, not discussed in any prior session. Products previously had exactly one `unit`
field with no conversion concept anywhere. Added a **Lowest Unit** (smallest sellable/trackable
unit, e.g. "Piece") and an **Alternate Unit** (e.g. "Pack"), each with a conversion factor relative
to the existing `unit` column (now displayed as **"Base Unit"** in the UI — label-only rename, no
column rename, matching this app's usual menu-label convention).

**Resolved via AskUserQuestion before building:**
- **Conversion model**: two factors relative to Base — "1 Base Unit = X Lowest Units" and "1 Base
  Unit = Y Alternate Units."
- **Validation**: any factor present must be `> 1`; if both present, `lowest_unit_factor >
  alt_unit_factor` — enforces Base as the largest unit, Alternate the middle, Lowest the smallest.
  A unit name and its factor must be supplied together (both or neither).
- **Scope — narrowed by a follow-up answer mid-session**: the unit picker is
  **`DistributorSecondary.jsx`'s cart only**. The primary `DistributorOrder.jsx` (Team's main order
  screen) is explicitly **untouched** — stays Base Unit only, no picker, no schema changes there.
  Picking (`OrderPickingDetail.jsx`/`PickingEditSheet.jsx`) and invoicing
  (`AwaitingInvoiceTile.jsx`/`printInvoice.js`) are also **untouched** — unit is picked once, at
  secondary-order creation, and never surfaces again downstream. Rate stays per Base Unit
  (`products.price`, unchanged). A distributor-level default secondary-order unit and per-unit rate
  overrides were flagged by the user as **future work** under a not-yet-built "distributor setup"
  menu — not part of this change.

**Built:**
1. **`src/lib/unitConversion.js`** (new, shared, pure) — `availableUnitsForProduct(p)` (Base always
   included; Lowest/Alt only if both that unit's name AND factor are set on the product),
   `toBaseQty(product, unit, qty)` (divides by the relevant factor), `unitLabel(product, unit)`.
2. **`Products.jsx`** — `unit` field/column relabeled "Base Unit"; 4 new `EntitySheet` fields
   (`lowest_unit`, `lowest_unit_factor`, `alt_unit`, `alt_unit_factor`, free-text unit names, not
   constrained to the fixed Base Unit dropdown list since real examples like "Piece"/"Pack" don't
   fit that enum) added to both the form and the `payload` whitelist in `save()` (the whitelist is
   the only thing gating persistence — confirmed via research before building, same
   passthrough-payload pattern as every other field on this form). `save()` gained the ordering/
   both-or-neither validation above, surfaced via the existing `showToast` error pattern already
   used for failed `db.*` calls in this file — no new error-display mechanism introduced.
3. **`DistributorSecondary.jsx`**'s `ItemOrderSheet` — cart state reshaped from `{ [product_id]: qty
   }` to `{ [product_id]: { qty, unit } }` (`unit` defaults `'base'`); new `setUnit(pid, unit)`
   alongside the existing `setQty`. Each product row now calls `availableUnitsForProduct(p)` — if it
   returns just Base (the common case, most products won't have Lowest/Alt configured), the row
   renders exactly as before with no selector; if 2+ units are available, a small `<select>` appears
   next to the qty stepper. Changing the unit only updates `.unit` on that cart entry, leaving the
   typed quantity number as-is — a live reinterpretation, not a reset, per the user's explicit
   instruction ("changing of units... will calculate based on the units"). `cartLines` now converts
   each entry to its Base-unit equivalent via `toBaseQty()` before computing `qty`/`cartTotal`,
   while also carrying the raw `entered_unit`/`entered_qty` through as audit fields — `cartTotal`'s
   formula itself (`qty * rate`) is unchanged, it just now operates on the converted quantity.
4. **`db.createSecondaryOrder`**'s `itemRows` mapping gained `entered_unit`/`entered_qty` (falls
   back to `'base'`/the canonical `qty` if not supplied, so nothing breaks for callers that don't
   send them) — the canonical `qty`/`rate` columns remain exactly what every downstream consumer
   (Day Summary rollups, PDF/ZIP export, the Outlet Visits achievement hook) already reads, so none
   of those needed any changes.

**Schema — NOT yet applied, user must run:**
```sql
alter table products
  add column lowest_unit text,
  add column lowest_unit_factor numeric,
  add column alt_unit text,
  add column alt_unit_factor numeric;

alter table secondary_order_items
  add column entered_unit text not null default 'base',
  add column entered_qty numeric;
```

**Browser-test round — CONFIRMED WORKING via headless Playwright (same-day follow-up).** Schema was
applied by the user, then driven end-to-end as Admin (`admin@co.com`) and a Sales Team member
(`arjun@co.com`) against the live Supabase instance — same approach as the 3 Aug 2026 "Browser-test
round" (Playwright installed into the scratchpad, not the repo).

**Confirmed:**
- "Base Unit" relabel live on both the list column header and the edit form.
- Both validation rules block save with the correct toast message: factor ≤ 1
  ("Lowest Unit factor must be greater than 1") and Lowest ≤ Alternate ("Lowest Unit factor must be
  greater than Alternate Unit factor") — sheet stays open, no partial save.
- A product saved with valid factors (Lowest "Piece" ×50, Alt "Pack" ×5) persists and displays
  correctly in the product list.
- In the Distributor Secondary cart: products with no Lowest/Alt configured show no unit selector
  (unchanged, matches every pre-existing product); a configured product shows the `<select>`.
  Picking "Piece" and tapping + to 10 produced a cart total of exactly ₹20 (₹100 base price × 10÷50
  = 0.2 base-equivalent) — the conversion math is correct. Checkout wrote a real order; Day
  Summary's product-wise rollup showed the same converted `0.2 · ₹20`, confirming the canonical
  `qty` column downstream is genuinely base-unit, untouched by which unit the rep picked.

**One real bug found and fixed by this test round** (not caught by `eslint`/`vite build`, only by
actually driving the cart): `setUnit` was a no-op when a product had no cart entry yet
(`prev[pid] ? {...} : prev` — falsy when qty was still 0), so picking a unit *before* tapping `+`
silently discarded the selection and the line saved at the Base Unit instead. This is the natural
order a rep would use the picker (pick unit, then quantity), so it wasn't an edge case. Fixed by
having both `setQty` and `setUnit` write a full `{ qty, unit }` entry unconditionally (no more
delete-at-zero), with `cartLines` now filtering to `entry.qty > 0` so a unit-only, still-zero-qty
selection never reaches the total or gets submitted as a phantom line item.

**Test data left in the live DB from this round** (harmless, same convention as prior
Playwright-driven test rounds in this project): a few `PW Unit Test *` products, a `PW Test Beat`/
existing `Cuttack-Bt1` beat gained a couple of `PW Test Outlet *` outlets with one real secondary
order each. Safe to delete via the normal UI (Products list, Distributor Secondary) whenever
convenient — not cleaned up automatically since deleting is a judgment call, not this session's to
make unprompted.

**Still open / not done yet:**
- Nothing outstanding — schema applied, full flow confirmed, the one bug found during testing is
  fixed and re-verified in the same round.

## Session handoff note (5 Aug 2026) — nothing outstanding, safe to start a new chat

Two features landed this session, both fully built, browser-tested, committed, and pushed
(`de510e5` → `acd39d7`) — see "Admin Dashboard: Distributor Presence Map" earlier in this file for
full detail:

1. **Distributor Presence Map**, now reached via its own **"Geographical Business View"** menu
   (Distributor Functions section) rather than embedded in the Admin dashboard — every billable
   distributor plotted on a fixed Odisha-centered map, colored by billing recency. Confirmed working
   end-to-end for Admin.
2. **`achievementEngine.js` invoice-status gap fixed** (a documented-but-never-shipped guard) —
   `pending_approval` invoices no longer count toward achievements. Zero live invoices were
   non-approved at the time, so no visible number changed; regression test added (4/4 passing).

The `run-workforce` skill gained several real gotchas from this session's verification detour
(alphabetically-sorted Settings role tabs, an async checkbox's unreliable post-click screenshot
state, the sidebar's own internal scrolling) — read `.claude/skills/run-workforce/SKILL.md`'s
Gotchas section before the next browser-testing pass rather than rediscovering these.

**Nothing else from this session is pending** — no schema to run, no menu box left unchecked (Admin
role's `geoBusinessView` is confirmed live in the DB), no follow-up verification queued.

## Goals Status — replaces Targets, Admin/Manager performance dashboard (5 Aug 2026 session) — BUILT,
## SCHEMA-FREE, NOT YET BROWSER-TESTED

New session, built from a Plecto "Sales Manager Dashboard" reference screenshot the user provided
(dark cards: a big Deals-Won gauge, a top-3 rep leaderboard with avatars/medals, Inbound/Outbound
Revenue %, Revenue from Upgrade, New Customers, Forecasted New Revenue, an Upcoming-Demos donut, an
Employee table, a Deals-by-Team bar chart). Resolved via AskUserQuestion before building:

- **Scope = Sales/goal performance** — this replaces `Targets.jsx` (the old flat approved-targets
  list), not a new operational/HR dashboard.
- **3 of the 9 reference tiles have no WorkForce equivalent** (Inbound/Outbound Revenue %, Revenue
  from Upgrade, Forecasted New Revenue — no lead-source, upgrade, or forecasting concept exists
  anywhere in this app) — dropped and replaced with tiles built from real goal data, same call as
  when `TeamSnapshot.jsx` was built from its own reference image and analogous no-equivalent panels
  (Avg Days to Close, Deal Loss Reasons, Deals Projection) were dropped rather than faked.
- **Manager sees own team only, Admin sees the full org** — this is genuinely new scoping logic;
  neither `Dashboard.jsx` nor the old `Targets.jsx` had ever filtered by `manager_id` before (both
  are unscoped today, confirmed via exploration before building).
- **Always "this month," no tab control** — matches the old `Targets.jsx` and the existing precedent
  that goal-vs-achievement figures are inherently monthly (`SalesSnapshot`'s own Manager Leaderboard
  already stays month-scoped regardless of its Today/Month/Year tabs, for the same reason: goals
  don't have a daily or yearly concept in this app).

**Built:**
1. **`src/pages/shared/GoalsStatus.jsx`** (new, replaces `src/pages/shared/Targets.jsx`, which was
   deleted) — dark-panel styling matching `SalesSnapshot.jsx`'s established token pair
   (`panelBase`/`labelStyle`, `#0f172a` outer / `#1e293b` card). Tile mapping from the reference:
   - **Deals Won Value vs Target → Sales Value gauge** (reuses `MeterGauge` from
     `GoalBarChart.jsx`, `dark` prop).
   - **New Revenue by Sales Rep → Top Performers podium** — top 3 members by achieved Sales Value
     this month, 🥇🥈🥉 + `Av` avatar + name + value, click opens the member drill (no medal/podium
     pattern existed anywhere else in the app — built fresh from `Av`).
   - **Inbound/Outbound Revenue % → dropped**, replaced with a **Distributors Created + Outlet
     Visits** stat pair (achieved counts, reusing `aggregateForMembers`'s `acq`/`visits` fields —
     `acq.achieved` is already ungated per the 4 Aug 2026 fix, matching "Distributor Created"
     elsewhere in the app).
   - **Revenue from Upgrade / Forecasted New Revenue → dropped**, no substitute (no natural mapping,
     unlike the pair above).
   - **Upcoming Demos donut → Visits by Rep donut** (`ContributionDonut`, one slice per member,
     colored by each member's own existing `color` field, same identity-color convention
     `managerContribution`/`memberContribution` already use elsewhere).
   - **Employee table (Won Deals/Demos) → Roster table**: Member | Sales Value | Visits |
     Distributors, sorted descending by achieved Sales Value, row click → member drill.
   - **Deals by Team bar chart → Category Breakdown bar** (`GoalVsAchievedBreakdown`, `dark` prop) —
     deliberately NOT a per-manager-team bar chart, since that would duplicate `SalesSnapshot`'s own
     Manager Leaderboard already showing exactly that breakdown elsewhere in the app.
   - Member drill-down reuses `MemberGoalDetail.jsx` as-is (same component `Targets.jsx` used),
     default Sheet z-index (300) — no nested-Sheet stacking here, unlike Dashboard.jsx's
     Manager→Member drill, so no `zIndex={320}` override needed.
2. **`ContributionDonut` (`GoalBarChart.jsx`) gained a `dark` prop** — previously the only one of
   the three chart primitives without dark styling (`MeterGauge`/`GoalVsAchievedBreakdown` already
   had it). Added dark background/border on the tooltip, dark stroke on pie slice borders, dark
   legend/empty-state text — same token values used everywhere else in this app's dark panels.
3. **Menu relabel, not a new menu id** — `WebApp.jsx`'s `ALL_MENUS`/`PAGE_MAP` and `Settings.jsx`'s
   separate copy both changed `targets`'s **label** "Targets" → "Goals Status" (icon 🎯→🏆) and
   `PAGE_MAP.targets` now points at `GoalsStatus` instead of the deleted `Targets`. The **id stays
   `'targets'`** — per CLAUDE.md's own menu convention ("internal id stable, label can be renamed
   freely without breaking `roles.menus` permission data"), so **no Settings re-check is needed**:
   any role that already had "Targets" enabled sees "Goals Status" immediately, same permission row.

**Not done / explicitly out of scope for this pass:**
- No period picker — see "Always this month" resolution above; revisit only if Admin/Manager
  specifically ask to browse past months here (the existing `listRecentPeriods()`/`historicalCache`
  pattern from Dashboard.jsx's old, now-removed tab system would be the model to follow).
- No Org→Manager drill step for Admin (unlike `SalesSnapshot`'s Leaderboard→`ManagerLevelSheet`) —
  this page's roster/podium/donut are flat across whatever scope (org for Admin, team for Manager),
  one level only, straight to `MemberGoalDetail`. That manager-level drill already exists via
  `SalesSnapshot`'s Manager Leaderboard on the main Dashboard; not duplicated here.

**Real cross-cutting bug found via live testing (first browser look at this page), fixed same
session:** `MeterGauge`'s `RadialBarChart` had no explicit angle-axis domain. Recharts auto-scales
an unset radial/angle-axis domain to `[0, max(data value)]` — with only one data point in the
gauge's `data` array, that max IS the value itself, so the arc always rendered as a **full circle**
regardless of the real percent (screenshot showed "3%" text with a solid, fully-filled red ring, no
gray "remaining" track visible at all). The percent **text** was always correct; only the ring
was wrong. This is not new-to-this-session code — `MeterGauge` is reused everywhere (Dashboard's
old drill sheets, `TeamSnapshot.jsx`, `SalesSnapshot.jsx`, `MemberGoalDetail.jsx`, and now
`GoalsStatus.jsx`), so every gauge in the app had this bug; it just took this page's low starting
percentage (3%) to make it visually obvious versus a coincidentally-near-100% value elsewhere.
Fixed by adding `<PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />`
inside the `RadialBarChart`, pinning the domain so the arc always represents true percent-of-circle.
`vite build` + scoped `eslint` clean after the fix.

**Still open / not yet browser-tested (next thing to check in a new session):**
- `vite build` and scoped `eslint` (on `GoalsStatus.jsx`, `GoalBarChart.jsx`,
  `MemberGoalDetail.jsx`, `WebApp.jsx`, `Settings.jsx`) are clean — the only 4 lint errors reported
  are pre-existing and already documented elsewhere in this file (`WebApp.jsx`'s `SideContent`
  static-component warning + unused `Btn`, `Settings.jsx`'s unused `Inp`).
- **Re-check the gauge visually after the `PolarAngleAxis` fix** — confirm the ring now shows a
  partial arc proportional to percent (e.g. a small sliver at 3%, not a full circle), with the gray
  track visible for the remaining portion, on this page AND spot-check one other page that uses
  `MeterGauge` (e.g. `TeamSnapshot.jsx`'s Home tab) to confirm the same fix holds there too.
- Sidebar shows "Goals Status" (not "Targets") for both an Admin and a Manager login without needing
  any Settings change — confirmed via screenshot for Manager (Meera Iyer), not yet for Admin.
  Admin's gauge/podium/stats/donut/breakdown/roster reflect the whole org; a Manager with team
  members assigned (via `manager_id`) sees only their own team's numbers — confirmed for one Manager
  (Meera Iyer, "My Team · August 2026" scope label rendered correctly, 1 team member "Arjun Nair"
  shown in Top Performers). A Manager with zero assigned members still needs checking (empty states,
  no crash). Clicking a podium entry or a roster row opens `MemberGoalDetail` correctly — not yet
  confirmed. Category Breakdown bar showed real category rows immediately (Snacks/Lubricants/
  Namkeens/Brake Fluids/Coolants, goal vs achieved) — confirms the aggregation wiring works
  correctly (see the chart-type change right below — the bar itself didn't survive as the final
  form, but the data feeding it was already right).

**Follow-up same session: Category Breakdown changed from a bar chart to a "fuel meter" per
category.** User's ask, after seeing the bar-chart version live. Per the `dataviz` skill's own form
guidance ("a single ratio against a limit → Meter"; several such ratios side by side → small
multiples of that Meter, not one wide bar list) — first pass swapped `GoalVsAchievedBreakdown` out
for a `flex-wrap` grid of the existing `MeterGauge` component (full-circle radial ring), one per
category.

**Immediate second follow-up, same breath — user wanted an actual needle-pointer gauge (a
semicircular "speedometer" style, per a Geckoboard reference screenshot) with a DIFFERENT color per
category, not `MeterGauge`'s single red/amber/green severity ramp reused for every category.** Built
a new component instead of trying to bend `MeterGauge` to a second visual style:
1. **`NeedleGauge`** (new, `GoalBarChart.jsx`) — hand-drawn SVG semicircle: a background track arc
   (0–180°, left-to-right over the top), a colored fill arc from 0 to the achieved percent, and a
   needle line + pivot dot pointing at that percent. `color` is a required-ish prop (falls back to
   blue) — the arc + needle carry the category's identity color; the percent/value TEXT stays
   neutral ink (`#e2e8f0`/`#374151`), per the `dataviz` skill's own rule that text wears text
   tokens, never the series color — a small colored dot next to the category name carries identity
   there instead of coloring the label itself.
2. **`src/lib/categoryColors.js`** (new) — `CATEGORY_PALETTE` (the same 8-color validated
   categorical set `ContributionDonut` already used internally, now pulled out and exported so both
   components draw from one source instead of two independently-cycling copies) and
   `colorForEntity(id, allItems)` — looks up an entity's color by its index in a **stable master
   list** (e.g. the full `categories` array from `useData()`), not its index in whatever
   sorted/filtered subset is being rendered, so a category keeps the same color on this page no
   matter how the goal-vs-achieved ranking reorders it between renders ("color follows the entity,
   never its rank" — the skill's own non-negotiable). Pulled into its own file rather than left
   inline in `GoalBarChart.jsx` because a plain constant export there triggered
   `react-refresh/only-export-components` (component files must export only components) —
   `GoalBarChart.jsx` and `GoalsStatus.jsx` both now import from this new shared module.
   `ContributionDonut`'s own fallback-color line was repointed at the same `CATEGORY_PALETTE`
   import instead of its old private copy — one less place a palette could drift.
3. **`GoalsStatus.jsx`**'s Category Breakdown panel now renders `NeedleGauge` (not `MeterGauge`) per
   category, colored via `colorForEntity(c.id, categories)`.

`vite build` + scoped `eslint` (`GoalsStatus.jsx`, `GoalBarChart.jsx`, `categoryColors.js`) clean
after both follow-ups. Net: `GoalVsAchievedBreakdown` itself is untouched and still used elsewhere
(`MemberGoalDetail.jsx`'s Products/Categories/Distributors breakdowns) — only this one panel on
this one page changed form, twice, in response to live feedback.

**Third same-session follow-up: "Outlet Visits" renamed to "Retail Visits" and re-sourced from
Distributor Secondary's raw `retail_visits` count, not the goal-gated/combined achievement figure.**
Every prior number on this page for "visits" was `aggregateForMembers(...).visits.achieved` —
`achievementEngine.js`'s `ach.visits`, which (a) sums BOTH `distributor_visits` (New Customer Visit)
and `retail_visits` (Distributor Secondary beat-outlet visits) together, and (b) only counts once the
member's Visits goal field is manager-approved for the period (`goal.visits_status === 'approved'`).
User wanted the page's visit figures to instead read as a literal "how many retail outlets were
visited" count, sourced specifically from Distributor Secondary. Fixed by computing a new,
separate, ungated count directly off the raw `retailVisits` array (already loaded globally by
`useData()`) filtered to the current period's calendar month (`monthRangeForPeriod(currentPeriod)`)
and the in-scope member ids — same root-cause pattern as the 4 Aug 2026 fix that made the
Distributors meter match "Distributor Created" everywhere by reading the raw pipeline event instead
of a differently-scoped/gated aggregate. Applied consistently to all three places "visits" appeared
on this page (not just the one stat tile asked about), since leaving them on the old mixed/gated
definition would have shown three different numbers for the same person/scope/period on one screen:
1. **Stat pair tile**: "Outlet Visits" → **"Retail Visits"**, value is now the raw scoped count
   (goal fraction dropped — the old combined Visits goal target no longer describes what this
   number measures, same reasoning the Distributors Created tile beside it already followed by
   showing a bare count with no goal fraction).
2. **Donut**: "Visits by Rep" → **"Retail Visits by Rep"**, each slice now `retailVisits` count per
   member instead of `agg.visits.achieved`.
3. **Roster table**: "Visits" column → **"Retail Visits"**, per-row value now each member's own
   scoped `retailVisits` count.

Confirmed in code before building this: `retail_visits.member_id` is filtered against `goals[mid]`
inside `achievementEngine.js`'s own retailVisits loop using the SAME key space as `members.id` (not
`users.id`, despite the column's schema comment literally saying `references users(id)` — the app
inserts each Sales Team rep's `member_id`, i.e. their `members.id`, into that column in practice), so
`String(v.member_id) === String(member.id)` is the correct, already-established matching pattern —
reused here rather than re-derived. `vite build` + scoped `eslint` clean after this change too.
The **Category Breakdown** meters and the **Sales Value** gauge/podium are untouched by this —
only the three "visits" spots above changed source.

**Fourth same-session follow-up: Distributors Created gained a target, and the Retail Visits number
moved out of the stat-pair panel into the donut panel.**
1. **Distributors Created** was a bare achieved count with no goal shown (unlike every other
   figure on this page). Changed to the same `achieved / goal` format the page uses everywhere
   else: `scopeAgg.acq.achieved` (the ungated, real "Distributor Created" pipeline count, unchanged
   from before) **`/` `scopeAgg.acq.goal`** (the manager-approved Distributor Creation goal target
   for the period — goal fraction only renders when `goal > 0`, same convention as the Sales Value
   gauge and the old pre-this-session Outlet Visits tile).
2. **The stat-pair panel that used to hold both "Distributors Created" and "Retail Visits" stacked
   together now holds only Distributors Created** (single stat, panel simplified from a two-item
   flex-column to one centered block). The Retail Visits total moved into the donut panel instead —
   that panel's header is now "Retail Visits *by rep*" with the scoped total (`scopeRetailVisits`)
   shown inline at the right of the header, the donut itself unchanged below it (same
   `retailVisits`-per-member data from the third follow-up above). Net effect: each panel now holds
   one coherent metric (Distributors Created alone; Retail Visits total + its by-rep breakdown
   together) instead of two unrelated stats sharing one box.

`vite build` + scoped `eslint` clean after this change too.

**Fifth same-session follow-up: Sales Value promoted to a hero panel — biggest size, biggest
font/graph, distinct "most attractive" color treatment, since it's this page's single most
important figure.** User asked for a literal panel-size swap between Sales Value and Retail Visits
first, then a stronger ask on top: Sales Value's graph and font should be the biggest/most prominent
of every panel on the page, with the most attractive color combination — not just matching Retail
Visits' old size.
1. **`MeterGauge` (`GoalBarChart.jsx`) gained a `size` prop** (diameter in px, default `108` —
   unchanged for every other call site: `TeamSnapshot.jsx`, `MemberGoalDetail.jsx`). Ring diameter,
   ring thickness, and all three font sizes (percent/label/sub) scale together off this one number,
   so a caller can promote one gauge to a hero figure (the `dataviz` skill's own figure contract:
   "the one number a dashboard leads with... exactly one per view") without a second component.
2. **`GoalsStatus.jsx`'s Sales Value panel** — no longer shares `panelBase`'s flat `#1e293b` with
   every other panel on the page. Own gradient background
   (`linear-gradient(135deg, #1e3a8a 0%, #4338ca 55%, #7c3aed 100%)` — blue → indigo → violet, built
   from hues already in this app's palette, not new ones invented), a soft violet glow
   (`box-shadow: 0 0 44px rgba(99,102,241,.35)`), and a bordered edge. `flex: '2 1 320px'` — the
   largest basis of any panel on the page (bigger than Top Performers' `1.4`).
3. **Retail Visits panel** took Sales Value's old size (`flex: '1 1 180px'`, back on the shared
   `panelBase` styling) — the literal swap part of the ask, alongside the hero treatment above.

**Immediate revert, same session — the `size={190}` enlarged gauge "looked odd."** User's very
next message walked back just the font/ring-size piece, keeping everything else: panel size,
gradient, and glow all stay; `MeterGauge`'s call in this panel dropped back to the default `size`
(108, same as every other gauge on the page — Top Performers/Distributors Created/etc. never used
the `size` prop to begin with). The `size` prop itself stays on `MeterGauge` (harmless, unused by
any current call site) rather than being ripped back out, in case a future ask wants it again. The
panel's larger flex-basis + distinct gradient/glow are what carry "most important" now, without
also blowing up the numeral/ring past what read well.

**Second immediate revert, same session — the gradient/glow itself was called "improper," and
Distributors Created was missing a graph.** Two more corrections in the same breath:
1. **Sales Value panel's gradient background, border, and glow all removed** — back to plain
   `panelBase` (flat `#1e293b`, no border/shadow), same as every other panel on the page. Emphasis
   now carries through size alone: `flex: '2 1 320px'` is still the largest basis on the page, just
   no longer visually distinct in color from its neighbors.
2. **Distributors Created panel gained a graph** — it was the one stat-pair panel left as bare
   text (`achieved / goal` numerals, no chart), inconsistent with Sales Value and (before this
   session's edits) the old Outlet Visits tile, which both showed a ring. Replaced the text block
   with `<MeterGauge label="Distributors Created" value={scopeAgg.acq.achieved}
   goal={scopeAgg.acq.goal} dark />` — same component, default size, same red/amber/green severity
   convention as Sales Value's own gauge right next to it, so every scalar-goal panel on this page
   now renders the same way.

Net result: the top row is back to a uniform look across all four panels (same flat dark background,
same panelBase styling), with only relative panel width — not color — signaling which one matters
most. `vite build` + scoped `eslint` clean after this change.

## Distributor Presence Map gains district + state boundary lines (5 Aug 2026 session) — BUILT,
## NOT YET BROWSER-TESTED

**User's ask:** on the existing "Geographical Business View" map (`DistributorPresenceMap.jsx`),
draw actual district-level boundaries within Odisha, plus a distinct/deeper-colored border for the
state outline itself — previously the page only had a fixed center+zoom framing a bounding box
(`ODISHA_BOUNDS`), no real boundary geometry at all (explicitly flagged as deferred when that page
was first built, see the entry above this one).

**Resolved via AskUserQuestion before building:**
- **Data source — CC BY 4.0 licensed, not the faster unlicensed option.** Two candidate sources
  were found: `udit-001/india-maps-data` (ready-to-use GeoJSON/TopoJSON, but no LICENSE file and its
  own README admits data was "curated from publicly available sources... no specific original
  sources cited" — real risk given this repo's own already-flagged public-IP concern) vs. DataMeet's
  `datameet/maps` (the standard reference for Indian open geodata, explicit **CC BY 4.0** license:
  *"Unless explicitly stated, all datasets in this repository is shared under CC BY 4.0 license"* —
  verified verbatim from the repo's own README, not just a paraphrase). User picked DataMeet
  despite the extra conversion work it required (their data is Shapefile-only, not GeoJSON).
- **Static outlines only, no interactivity** — no click-to-filter-by-district, no hover tooltips.
  Simplest version to start; district polygons are non-interactive (`interactive: false`) so they
  never intercept clicks meant for the map/markers underneath.

**Data pipeline (one-time, offline — not part of the app's runtime or build):**
1. Downloaded `Districts/Census_2011/2011_Dist.shp` (+`.dbf`/`.shx`/`.prj`) from `datameet/maps` —
   all-India, 641 districts, ~10MB shapefile.
2. Converted to GeoJSON via the lightweight `shapefile` npm package (pure JS, no native deps —
   deliberately NOT `mapshaper`, whose install pulled in a huge unrelated dependency tree —
   `better-sqlite3` native bindings, `geopackage`, `geotiff`, `flatgeobuf`, `ol` — and repeatedly
   timed out/`ECOMPROMISED` mid-install in this environment).
3. Filtered to Odisha's 30 districts via the `ST_NM` field (all present and correctly named,
   Census-transliterated spellings e.g. "Anugul"/"Baleshwar" rather than "Angul"/"Balasore").
4. Simplified each district independently via `@turf/simplify` (Douglas-Peucker, ~800m tolerance)
   for the districts file — fine for thin individually-drawn reference lines.
5. **State outline required a different approach, found via trial and error:** dissolving the
   *simplified* districts via `@turf/union` produced a 14-fragment MultiPolygon (simplifying each
   district independently breaks shared-edge alignment at their borders, leaving thin gaps that
   don't merge cleanly). Fixed by dissolving the **raw, unsimplified** geometries first — this
   still produced 204 rings (1 real ~156,279 km² outer boundary + ~200 sub-12km² interior "holes,"
   union-seam digitization artifacts, not real geography — Odisha's actual area is ~155,700 km²,
   confirming ring 0 alone was the real boundary). Kept only the single largest ring, simplified
   *that* (1km tolerance → 540 points), dissolve-then-simplify rather than simplify-then-dissolve
   being the actual fix.
6. Output: `public/data/odisha-districts.geojson` (126KB, 30 features) and
   `public/data/odisha-state.geojson` (21KB, 1 feature) — served as static assets (Vite's
   `public/` convention), fetched at runtime via `fetch()`, NOT bundled into the JS chunk (confirmed:
   `dist/` bundle sizes unchanged before/after).
7. `public/data/ATTRIBUTION.txt` — full provenance (source repo, CC BY 4.0 link, exact processing
   applied) — satisfies the license's attribution requirement as a durable record, independent of
   the in-app attribution below.

**App changes (`DistributorPresenceMap.jsx`):**
- Map-init effect now also fetches both GeoJSON files (`Promise.all`, soft-fail like every other
  fetch in this app — if this 404s or fails to parse, the core map/markers still work fine, just
  without boundary lines) and renders them via `L.geoJSON()`: districts as subtle slate-gray hairlines
  (`#64748b`, weight 1), state outline as a **deep, saturated navy-blue** (`#0c4a6e`, weight 3,
  added after the district layer so it draws over any coincident edge segments) — user's explicit
  follow-up ask, after a first pass in a lighter sky-blue (`#38bdf8`) read as not prominent enough.
  Both layers `interactive: false` per the static-only decision above.
- **In-app attribution**: `map.attributionControl.addAttribution(...)` adds "District boundaries ©
  DataMeet (CC BY 4.0)" with a link back to `github.com/datameet/maps`, alongside the existing
  OpenStreetMap attribution — same mechanism, so it appears in the same on-map attribution control
  a user would already expect to check. **Still open**: DataMeet's suggested attribution format
  links the *specific dataset* path, not just the repo root — current link is to the repo root;
  tightening it to point at `Districts/Census_2011` specifically was flagged as a nice-to-have, not
  yet done.

**Explicitly NOT used anywhere in the shipped app:** the unlicensed `udit-001/india-maps-data`
source — it was only ever downloaded into the session's scratchpad (outside the repo) to compare
file size/structure before the licensing AskUserQuestion; nothing derived from it was written to
`public/data/` or committed.

**Still open / not done yet:**
- **Not browser-tested** — same constraint as most work this session (no chromium-cli/Playwright by
  default; the `run-workforce` skill can drive a real verification pass but needs a test Admin
  login, which wasn't available to finish this round). Need to visually confirm: the state border
  reads as clearly deeper/more prominent than the district lines, district boundaries look
  geographically sane (no spikes/self-intersections from the simplification), and distributor
  markers still render correctly on top of both boundary layers (Leaflet's marker pane is above its
  overlay pane by default, so this should hold, but hasn't been visually confirmed).
- DataMeet attribution link could point at the specific dataset path instead of the repo root (minor,
  flagged above).

`vite build` + scoped `eslint` (`GoalsStatus.jsx`, `GoalBarChart.jsx`) clean after this change.

## Distributor Secondary: Distributor is now the first-level selection (5 Aug 2026 session) — BUILT,
## NOT YET BROWSER-TESTED

**User's ask:** in `DistributorSecondary.jsx` (Sales Team's Beats/Retail Outlets flow), the rep
should pick a **Distributor first**, then see/create beats scoped to that distributor — previously
the "Beats" tab listed every beat from every assigned distributor mixed together in one flat list,
and distributor was only chosen buried inside the "Create Beat" sheet as one of three fields (name,
distributor, coverage days), with no way to filter the list itself by distributor.

**Built:** new `selectedDistributor` state in `DistributorSecondary.jsx`, persists across
`beats`/`visit`/`summary` tab switches (only the explicit "← Distributors" link clears it, so
backing out of a beat/outlet mid-visit doesn't lose your place). The "Beats" tab now has two
states:
- **No distributor selected** — a card list of `myDistributors` (unchanged eligibility filter:
  `assignedTo` includes this rep + `type === 'Distributor'`), each showing its existing beat count.
  Tap one → `setSelectedDistributor`.
- **Distributor selected** — "← Distributors" back link + the distributor's name as a header, "+
  Create Beat" (now scoped, no distributor field needed), and the beat list filtered to
  `b.distributor_id === selectedDistributor.id` (dropped the now-redundant per-row distributor name
  line, since the screen's header already establishes it).

`CreateBeatSheet` simplified to match — takes a `distributor` object (display-only, shown in the
Sheet's subtitle) instead of a `distributors` list + its own dropdown/local `distributorId` state;
`db.createBeat` is now called with `selectedDistributor.id` directly from the parent. No `db.js`
changes — `fetchMyBeats`/`createBeat` signatures unchanged, this was purely a UI restructuring.

**Still open:**
- **Not browser-tested** — `vite build` + scoped `eslint` clean, zero errors. Full flow to verify:
  Beats tab now opens on a distributor list (not beats), tapping a distributor shows only that
  distributor's beats + correct beat count on the card, "+ Create Beat" saves under the right
  distributor without asking again, "← Distributors" returns to the picker, and switching to
  Visit/Summary and back to Beats doesn't lose the selected distributor.

## Generic Activity Log + vein diagram for Attendance Stage 2 (5 Aug 2026 session) — BUILT,
## SCHEMA APPLIED (user confirmed), NOT YET BROWSER-TESTED

Closes a gap flagged as deliberate (not fragile) when the Attendance system shipped: Stage 2
("Activity Approval") was only ever rich for Drivers — every other role saw a plain placeholder,
*"Detailed activity tracking isn't available for this role yet — approve based on other context."*
Full plan approved via plan-mode before building (large cross-cutting change — new table, new
shared component, instrumentation across several screens).

**User's ask, condensed:** every meaningful action a user takes (add/edit/save/approve/reject/
etc.) should be logged with a timestamp, attributed to that user, and shown under "Activity
Details" on Attendance's Stage 2 approval screen as a **vein diagram** — connected-dot vertical
timeline, same visual language as the driver journey timeline — spanning **Punch-In → every
logged activity, in order → Last Activity of the day**.

**Resolved via AskUserQuestion before building:**
- **Non-driver roles only** (Admin/Manager/Accounts/HR/Sales Team) — Driver's existing Stage 2
  (journey-based) is completely untouched by this change, no code changes to
  `JourneyVeinTimeline.jsx`/`AllocationJourneyTile.jsx`/`JourneyApprovals.jsx`.
- **Meaningful business actions only** (create/edit/save/approve/reject/submit) — not raw UI
  interactions (opening a sheet, changing a filter).
- **Phased rollout** — build the full system, then instrument the highest-value screens first
  (Goal/Invoice/Expense approvals, Products/Distributors/Settings master-data edits). Remaining
  screens (orders, picking, other masters) are an explicit follow-up, not this pass.

**Real finding from exploration, before writing any code:** `Attendance.jsx`'s existing driver
branch does **not** actually use the `JourneyVeinTimeline.jsx` component at all — it calls
`buildJourneyEvents()` directly and renders flat text rows, no vein diagram. So this session is
the **first real vein-diagram rendering inside Attendance.jsx**, not a reuse of an existing one.
`JourneyVeinTimeline.jsx`'s own diagram-rendering loop is fused with driver-specific header/route/
footer and isn't importable as a bare renderer — rather than refactor it (touching driver code,
against the confirmed scope), a fresh small component was built instead. Some visual-pattern
duplication between the two is accepted as a result; unifying them into one shared renderer is a
reasonable follow-up, not attempted now.

**Built:**
1. **`activity_log` table** (schema below) — `user_id` is explicitly `users.id` (matching
   `currentUser.id`), **not** `members.id`. Exploration found `approved_by`-style columns are
   genuinely inconsistent across this app already (invoices/journey approvals store `members.id`;
   punches/product-issue-resolution store `users.id`, with no naming convention distinguishing
   them) — `users.id` is right here because it's always available regardless of whether the actor
   has a `members` row (Manager/Accounts/HR approving something often don't), and matches
   `attendance_punches.user_id` itself, the table this log directly feeds into. A plain `date`
   column (not just `occurred_at`) mirrors `attendance_punches` exactly, populated via `db.js`'s
   existing `todayStr()` — the same already-battle-tested local-calendar-date helper (fixed once
   before for an IST/UTC-midnight bug) — so fetching by day is a plain `.eq('date', ...)`, not
   timezone-sensitive range math on a `timestamptz` column.
2. **`db.logActivity(userId, action, entity, label, entityId)`** (new, `db.js`) — soft-fail,
   non-blocking by design: called *after* the real write already succeeded, wrapped in try/catch,
   its own failure only `console.error`'d, never surfacing to the user or reading as if the actual
   action failed — matching this app's established convention for auxiliary writes (notifications,
   geolocation). **`db.fetchActivityLog(userId, date)`** (new) — mirrors `fetchTodayPunch`/
   `fetchMyAttendance`'s exact pattern. **Not** added to `useData.jsx`'s global `loadAll()`
   deliberately — exploration confirmed every existing ever-growing/per-event table in this app
   (`notifications`, `vehicle_locations`, `attendance_punches` itself) is fetched on-demand, scoped
   by user + date, never globally preloaded; this follows the same convention.
3. **`src/lib/activityTimeline.js`** (new) — `buildActivityEvents(punch, logRows)`: prepends a
   `{ label: 'Punched In', ts: punch.punch_in_at, category: 'punch_in' }` node, maps each
   `activity_log` row to `{ label, ts: occurred_at, category: entity }`, sorts ascending — same
   shape/sort convention as `journeyTimeline.js`'s `buildJourneyEvents`. Re-exports `fmtTs`/
   `fmtDur` from there rather than duplicating formatters (already source-agnostic).
4. **`journeyTimeline.js`'s exported `CATEGORY_COLOR`** gained new keys (`punch_in`, `create`,
   `update`, `approve`, `reject`, `submit`) — purely additive, every existing driver key/value
   unchanged; the shared color-lookup table both timelines now draw from one source instead of
   forking a duplicate map.
5. **`src/components/VeinTimeline.jsx`** (new) — the actual vein-diagram renderer: takes
   `{ events: {label, ts, category, tag}[] }`, renders the connected-dot vertical timeline (dot +
   line + label + "+Xh Ym since previous activity"). A fresh, independent component (see the
   exploration finding above for why), not extracted from `JourneyVeinTimeline.jsx`.
6. **`Attendance.jsx`'s `DayDetailSheet`** — the existing `isDriver` branch point
   (`user.role_id === 'r7'`) gained a sibling: non-driver users fetch
   `db.fetchActivityLog(user.id, date)` in the same `useEffect` shape the driver branch already
   uses, build events via `buildActivityEvents(punch, logRows)`, and render
   `<VeinTimeline events={activityEvents} />` in place of the old placeholder text. A user with
   zero logged activity still shows the one "Punched In" node — an honest result, not a
   placeholder message anymore.
7. **Phase 1 instrumentation** — one-line `db.logActivity(...)` call added right after each site's
   real write already succeeds:
   - `InvoiceApprovalTile.jsx`'s approve handler (built first, as the reference implementation —
     `currentUser` was already in scope there).
   - `GoalApprovals.jsx`'s `handleAction` (per-field approve/reject review) — needed `currentUser`
     added to its `useAuth()` destructure (previously only pulled `can`/`role`). Logs one activity
     per review submission (a review can approve/reject several fields at once), action is
     `'reject'` if any field was rejected else `'approve'`, label includes the approved/rejected
     counts.
   - `ExpApprovals.jsx`'s `action` handler — same `currentUser` gap, fixed. Refactored to take the
     whole expense row (not just its id) since the log label needs member/amount/category context
     that wasn't otherwise in scope at the call site.
   - `Products.jsx` and `Distributors.jsx` — their existing `save()` handlers, both the create and
     update branches (two log calls each, distinct action `'create'`/`'update'`).
   - `Settings.jsx` — `togMenu`/`togAction` (every menu/action-permission checkbox toggle already
     persists immediately, so each toggle is its own logged activity), plus `saveRole`/`delRole`.

**Schema — NOT yet applied, user must run:**
```sql
create table activity_log (
  id bigserial primary key,
  user_id bigint not null references users(id),
  date date not null,
  action text not null,        -- 'create' | 'update' | 'approve' | 'reject' | 'submit'
  entity text not null,        -- 'goal' | 'invoice' | 'expense' | 'product' | 'distributor' | 'settings' | ...
  label text not null,         -- human-readable, shown directly on the vein diagram
  entity_id text,
  occurred_at timestamptz not null default now()
);
create index activity_log_user_date_idx on activity_log(user_id, date);
```

**Still open / not done yet:**
- ~~Schema not yet applied~~ — done, user confirmed the `activity_log` table + index ran
  successfully (5 Aug 2026, same session).
- **Not browser-tested** — `vite build` clean; scoped `eslint` on every touched/new file shows only
  4 pre-existing issues, confirmed via `git stash` diff to be byte-identical before/after this
  session's changes (`InvoiceApprovalTile.jsx`'s pre-existing `set-state-in-effect` on its
  unrelated `loadData` effect, `Settings.jsx`'s unused `Inp` import, `Attendance.jsx`'s
  `month`/`year` exhaustive-deps warning, `ExpApprovals.jsx`'s unused `SBadge` import) — zero new
  issues introduced.
- ~~Follow-up rollout, explicitly deferred~~ — order creation/picking/allocation actions were
  instrumented in the same-day Phase 2 follow-up below. Master screens beyond Products/
  Distributors/Settings (Vehicles, Warehouses, Categories, Employees) remain unstarted.
- Full flow to verify now that schema is applied: perform a couple of instrumented actions (approve a
  goal, approve an invoice, save a product) as a non-driver user, then as HR/Admin open that user's
  Stage 2 queue item and confirm the vein diagram shows Punched In followed by each action in the
  right order with correct time deltas; confirm a user with zero non-punch activity still renders
  cleanly (just the one node); confirm Driver's Stage 2 view is pixel-identical to before.

### Activity Log Phase 2 — orders/picking/allocation instrumentation (5 Aug 2026 session, same day
### follow-up, "continue next phase") — BUILT, same schema as Phase 1, SCHEMA APPLIED, NOT YET
### BROWSER-TESTED

Closes the explicit Phase 1 follow-up: order creation/approval/picking/allocation actions are now
logged via `db.logActivity(...)`, same one-line-after-successful-write pattern as Phase 1, no
architecture changes — the log table, `VeinTimeline`, and Attendance wiring already exist. Master
screens beyond Products/Distributors/Settings (Vehicles, Warehouses, Categories, Employees) remain
unstarted, a further follow-up if wanted.

**Instrumented, one call per meaningful action (not every keystroke/tap):**
- `DistributorOrder.jsx` — order submit (`'submit'`) and edit (`'update'`) for Sales Team.
- `OrderApproval.jsx` — `managerApprove` (`'approve'`), `adminConfirmOrder` (`'approve'`), and
  `advanceToPicking` (`'update'`, sends to Warehouse).
- `OrderPickingDetail.jsx` — `confirmAndSend` ("Confirm & Send to Warehouse"). Needed adding
  `useAuth`/`currentUser` — this component didn't have it in scope at all before (it's handed
  everything via props, no hook usage previously).
- `PickingEditSheet.jsx` — `submitPicking`. Same `useAuth` gap, same fix.
- `LoadCreatedList.jsx` — `confirmAllocate`/`deallocate` (vehicle allocation lifecycle). Same
  `useAuth` gap, same fix.
- `LoadingScreen.jsx` — **only** the `markLoadingComplete` milestone inside the driver-confirmation
  polling loop, not the per-item Lift Stack button taps or pause/resume — those are exactly the
  "raw UI interaction" class this session's own granularity decision excludes, logging them would
  flood the vein diagram with noise instead of showing meaningful stops. Same `useAuth` gap, same
  fix.
- `JourneyApprovals.jsx` — `approve` (Admin approving Journey Complete). `currentUser` was already
  in scope here (used for `approveJourneyComplete`'s own `approved_by` param, which passes
  `member_id` — `logActivity` still uses `currentUser?.id`, the two are intentionally different
  columns with different id conventions, per the Phase 1 design note).
- `AwaitingInvoiceTile.jsx` — `submit` ("Create Invoice From Load").

**Same landmine handled the same way as Phase 1**: several of these call sites pass
`currentUser?.member_id` to their own domain-specific `approved_by`/`created_by` column (invoices,
journey approvals) while `logActivity` always uses `currentUser?.id` — intentional, not a copy-paste
slip, per Phase 1's documented reasoning (`activity_log.user_id` must always resolve even for
actors with no `members` row).

**Verification same as Phase 1:** `vite build` clean. Scoped `eslint` on all 8 touched files shows
only pre-existing issues, confirmed via `git stash` diff — `LoadingScreen.jsx`'s unused `Inp`
import and two pre-existing `exhaustive-deps` warnings (one of which now additionally lists
`currentUser?.id` as a missing dep, a natural side effect of using it inside that already-flagged
effect — not a new distinct warning), `OrderPickingDetail.jsx`'s unused `categories`/`onChanged`
props. Zero new lint errors.

**Still open:** ~~schema not yet applied~~ — done, user confirmed (5 Aug 2026, same session as
Phase 1's confirmation — one single `activity_log` table serves both phases). Not yet
browser-tested. Vehicles/Warehouses/Categories/Employees master screens and any other remaining
write paths are an explicit further follow-up, not done this pass.

## Distributor Secondary goal category + dashboard entries (5 Aug 2026 session) — BUILT, SCHEMA
## CONFIRMED APPLIED (verified via live REST probe, 8 Aug 2026), NOT YET BROWSER-TESTED

**User's ask, condensed:** a dashboard entry for Distributor Secondary showing Outlets Created,
Outlets Visited (framed as a real goal), and Secondary Value. Clarified via AskUserQuestion into a
much bigger scope than a single tile: a whole new **"Distributor Secondary" goal category** — four
scalar fields (**New Outlets**, **Productive Outlets**, **Total No. of Orders**, **Value**), each
following the exact scope→submit→approve handshake every existing scalar field (Sales Value/
Visits/Distributor Acquisition) already goes through — plus renaming the general "Visits" goal to
**"New Customer Visits"** and reverting its achievement to `distributor_visits`-only (the
`retail_visits` contribution added in the 4 Aug 2026 session is removed, since Distributor
Secondary now has its own dedicated fields instead of sharing the general one). Full plan approved
via plan-mode before building — comparable in scope to the original Monthly Goals architecture.

**Resolved via AskUserQuestion + follow-up clarification before building:**
- Dashboard placement: **both** Admin's `Dashboard.jsx` (org-wide, new section alongside Warehouse/
  Driver/HR/Accounts) and each Sales Team member's own `TeamSnapshot.jsx`.
- Time scope: **Today/Month/Year tabs** for raw activity counts — but the goal-vs-achieved figures
  stay **always "this month"** regardless of the tab, same reasoning every other goal figure in
  this app already follows (SalesSnapshot's Manager Leaderboard, GoalsStatus's Sales Value gauge).
- The "outlets visited... is a goal" framing resolved into: **Productive Outlets** (outlets with a
  real order) gets a genuine goal field, same as the other three — not a raw count, and not folded
  into the general Visits goal.

**Field naming** (matches this app's exact existing `{field}_goal`/`_status`/`_note` +
`enable_{field}` convention):

| Field key | Label | Achievement source |
|---|---|---|
| `new_outlets` | New Outlets | count of `retail_outlets` created in period, attributed via `created_by` (stores `members.id`) |
| `productive_outlets` | Productive Outlets | distinct `outlet_id` with ≥1 `retail_visits` row where `outcome='order'` in period |
| `secondary_orders` | Total No. of Orders | count of `retail_visits` rows where `outcome='order'` in period — derived from data already available, no new source needed (1:1 with a real `secondary_orders` row) |
| `secondary_value` | Value | sum of `secondary_order_items.qty * rate` for that period's orders |

**Built:**
1. **`db.js`** — `fetchRetailOutlets(dateRange)` / `fetchSecondaryOrders(dateRange)` (with joined
   `items`), both mirroring `fetchRetailVisits`'s exact existing global/optional-range pattern.
2. **`useData.jsx`** — `retailOutlets`/`secondaryOrders` added to global context, fetched
   unfiltered in `loadAll()`'s existing `Promise.all` (same as `retailVisits`), threaded into
   `computeAchievements(...)`'s call site.
3. **`achievementEngine.js`** — removed the `retailVisits.forEach` loop that added to `ach.visits`
   (the un-mixing described above); `computeAchievements` gained `retailOutlets`/`secondaryOrders`
   params; `result[mid]` init gained the 4 new fields; 4 new gated loops (New Outlets from
   `retailOutlets`, Productive Outlets as a per-member `Set` of order-outcome outlet ids from
   `retailVisits`, Total No. of Orders as a count of the same order-outcome `retailVisits` rows,
   Value summed from `secondaryOrders`' joined items) — each independently gated on its own
   `goal.<field>_status === 'approved'`, same convention as every other field.
   `getGoalOverallStatus` gained 4 more `enableX`/status-push lines.
4. **`goalAggregation.js`** — 4 new `emptyTotal()` totals + gating blocks (`param.enable_x &&
   goal.x_status === 'approved'`), included in `aggregateForMembers`'s returned object — this is
   what makes the 4 new fields "just work" everywhere `aggregateForMembers` is already called
   (`Dashboard.jsx`, `MemberGoalDetail.jsx`, `TeamApp.jsx`'s `myAgg`) without those call sites
   needing any change themselves.
5. **The 3-way handshake**, one new "Distributor Secondary" section in each:
   - **`Parameters.jsx`** (Manager scopes) — 4 new `<Toggle>`s, 4 new `enable_*` keys in `save()`'s
     `upsertParameter` payload and the summary-chip list.
   - **`TeamApp.jsx`'s `GoalEntrySheet`** (member sets value + submits) — 4 new `<StableInp>`s
     (gated on `param.enable_x`), 4 new lines in `handleSubmit`'s `draft` object and `submitGoal`'s
     `updated` object (the `Number(draft.x?.goal) || existing.x_goal` + status-diff pattern, copied
     from the existing `visits_goal` lines). The read-only "My Goals" status tab gained 4 more
     status `<Card>`s, same shape as the existing Distributor Created/Visits ones.
   - **`GoalApprovals.jsx`** (Manager approves) — 4 new `<FieldRow>`s, 4 new
     `if (decisions['x']) {...}` blocks in `handleAction`.
6. **"Visits" → "New Customer Visits" label rename** (display-only, `visits_goal`/`visits_status`/
   `enable_visits` field names all unchanged) across `TeamSnapshot.jsx`, `MemberGoalDetail.jsx`,
   `Dashboard.jsx` (both `ManagerLevelSheet` and the module-level gauge rows), `TeamApp.jsx` (status
   card + `StableInp` label), `Parameters.jsx` (`Toggle` label), `GoalApprovals.jsx` (`FieldRow`
   label).
7. **`MemberGoalDetail.jsx` and `Dashboard.jsx`'s `ManagerLevelSheet`** — both gained 4 more
   `MeterGauge`s (New Outlets/Productive Outlets/Total Orders/Value) in their existing goal-meter
   row, and their `hasMeters`/`hasAny` checks were extended so a member/team with ONLY Distributor
   Secondary goals approved (no Value/Visits/Acq) still renders the meters instead of showing "No
   approved goals."
8. **`Dashboard.jsx`'s new `DistributorSecondarySection`** — Admin-only (`role?.id === 'r1'`),
   placed first in the rollup block (before Warehouse). Unlike Warehouse/Driver/HR/Accounts (which
   self-fetch locally), this section consumes `retailOutlets`/`secondaryOrders`/`retailVisits`
   directly from `useData()` context (already globally loaded per the `useData.jsx` change above —
   no duplicate fetch). Two blocks: a Today/Month/Year tab row of raw `DarkStat` counts (own local
   tab state, `rangeForTab`), and a fixed "This Month" `MeterGauge` row (goal vs achieved, via
   `aggregateForMembers` over all members) — same tab-scoped-raw-numbers + always-monthly-goal
   duality established elsewhere in this app (e.g. `GoalsStatus.jsx`).
9. **`TeamSnapshot.jsx`'s new panel** — same duality, scoped to one member: a
   `StatTile` row of raw Today/Month/Year counts (reusing the file's own existing `tab`/`range`
   state) plus the 4 new `MeterGauge`s already added to the existing always-monthly Goal Progress
   block (point 7). `TeamApp.jsx` threads `myOutlets`/`mySecondaryOrders`/`myRetailVisits` down as
   new props, mirroring exactly how `myVisits`/`myLeads` are already threaded.

**Schema — NOT yet applied, user must run:**
```sql
alter table parameters
  add column enable_new_outlets boolean not null default false,
  add column enable_productive_outlets boolean not null default false,
  add column enable_secondary_orders boolean not null default false,
  add column enable_secondary_value boolean not null default false;

alter table goals
  add column new_outlets_goal numeric,
  add column new_outlets_status text,
  add column new_outlets_note text,
  add column productive_outlets_goal numeric,
  add column productive_outlets_status text,
  add column productive_outlets_note text,
  add column secondary_orders_goal numeric,
  add column secondary_orders_status text,
  add column secondary_orders_note text,
  add column secondary_value_goal numeric,
  add column secondary_value_status text,
  add column secondary_value_note text;
```

**Verification done this session:** `vite build` clean. Scoped `eslint` across all 10 touched/new
files — confirmed via `git stash` diff that only 3 files had any pre-existing lint issues at all
(`useData.jsx`, `Parameters.jsx`, `TeamApp.jsx`), same rule categories before/after, zero new files
picked up issues; the only count change is `react-hooks/static-components` going from 12→20 (+8),
exactly matching the 8 new `<Toggle>`/`<StableInp>` lines added — these reuse an already-broken
pre-existing inline-component-in-render pattern (`Toggle` in `Parameters.jsx`, `StableInp` in
`TeamApp.jsx`, both defined inside their parent's render function long before this session), not a
new bug introduced now.

**Still open / not done yet:**
- ~~Schema not yet applied~~ — confirmed applied via a live REST probe against `parameters`/`goals`
  (8 Aug 2026): all 4 `enable_*` columns and all 12 goal-field columns exist and return real rows.
- **Not browser-tested** — same constraint as most work this session. Full flow to verify now that
  schema is live: enable the 4 toggles in Parameters for a Sales Team member → submit goal values
  as that member → approve as Manager → create beats/outlets/orders via the existing Distributor
  Secondary flow → confirm achievement numbers move on both `TeamSnapshot.jsx` and
  `Dashboard.jsx`'s new section, and that the "New Customer Visits" rename reads correctly
  everywhere with its achievement no longer including retail-visit activity.

**Same-day follow-up: Manager also gets the Distributor Secondary section, scoped to their own
team.** The section was originally Admin-only (org-wide, all members). Added a sibling
`role?.id === 'r2'` block right after the Admin block — same `DistributorSecondarySection`
component, reused as-is, just given a different `memberIds` scope:
`membersByManager(currentUser?.id)` (the same helper `ManagerLevelSheet`'s drill-down already uses
elsewhere in this file) instead of every member. Header relabeled "Distributor Secondary — My Team"
for this branch to distinguish it from Admin's org-wide version. `useAuth()`'s destructure in
`Dashboard()` gained `currentUser` (previously only pulled `role`). The component already handles
an empty `memberIds` array gracefully (all-zero stats, "No approved goals" message) — relevant for
a Manager with no team members assigned yet, no new empty-state code needed.

`vite build` + scoped `eslint` (`Dashboard.jsx`) clean after this change.

**Real bug found via live testing, fixed same day: `Parameters.jsx`'s `save()` wrote the wrong
shape into local `params` state.** After a successful `db.upsertParameter(...)` call, `save()` did
`setParams(prev => ({...prev, [memberId]: {...draft, member_id, period}}))` — but `draft` is the
`ParamSheet`'s local camelCase form state (`enableValue`, `enableNewOutlets`, ...), not the
snake_case DB row shape (`enable_value`, `enable_new_outlets`, ...) every consumer actually reads
(`GoalEntrySheet`'s `param.enable_x` gates, `GoalApprovals.jsx`, `achievementEngine.js`,
`goalAggregation.js`). So immediately after clicking "Save parameters," the in-memory `params`
entry had zero snake_case keys — every `param.enable_x` check anywhere in the app read
undefined/falsy until the next full page reload re-fetched the real row from Supabase
(`fetchParameters` does `select('*')`, which is correct — the bug was purely in what `save()` wrote
locally, not the DB round-trip). This is a **pre-existing bug affecting every toggle field**, not
specific to the 4 new Distributor Secondary ones — it surfaced now because testing the new fields
happened to hit the no-reload-in-between case that earlier testing of the older fields apparently
never had. Fixed by using the actual `data` row `db.upsertParameter` already returns (real
snake_case columns, `.select().single()`) instead of reconstructing from `draft`. Bonus: this also
resolved a pre-existing `no-unused-vars` lint error on `data` (it's genuinely used now). `vite
build` + scoped `eslint` clean — remaining 13 `Parameters.jsx` lint errors are all the same
pre-existing `Toggle`/`Chips` inline-component-in-render pattern, unrelated to this fix.

**Two more real bugs found via live testing (same day), both fixed — diagnosed via a direct
read-only REST probe against the live `goals`/`parameters`/`users` tables (same technique used
elsewhere in this app's history for exactly this kind of "what does the DB actually have" check),
not guessing from the UI alone:**

1. **The actual blocker for "new parameters not showing in goal screen": `TeamApp.jsx`'s
   `hasNewParam` check was never updated for the 4 new fields.** `hasNewParam` is what unlocks the
   "Set/Revise goals" button when a Manager enables a field the member hasn't addressed yet for a
   goal that's already been submitted this month (`canEnter = overallStatus === 'draft' ||
   hasRejected || hasNewParam`). Since it only checked `enable_value`/`enable_visits`/`enable_acq`
   (+ the per-item fields), a member whose overall status was already `'pending'`/`'approved'` had
   **no way to even open the entry screen** to see the 4 new Distributor Secondary fields, even
   though `enable_new_outlets` etc. were correctly `true` in the database. Fixed by adding the same
   `p.enable_x && !g.x_status` check for all 4 new fields.
2. **A separate, more consequential pre-existing bug, found while investigating why one test
   member's overall goal status showed "Pending" despite every visible field reading Approved**:
   the read-only status card list only renders a field's card when `goal > 0`
   (`{p.enable_visits && g.visits_goal > 0 && <Card>...}`), but `getGoalOverallStatus` counts a
   field toward overall status based on `status` truthiness alone, with no `goal > 0` requirement —
   so a field sitting at `goal: 0, status: 'pending'` contributes an invisible, un-explainable
   "pending" to the badge/banner. Root cause: `submitGoal`'s scalar-field status diff used
   `Number(draft.x?.goal) !== Number(existing.x_goal)` directly — when a field is left untouched in
   the entry sheet, `draft.x?.goal` is `undefined`, `Number(undefined)` is `NaN`, and `NaN !==`
   anything is **always true** in JS, so resubmitting the form (even just to touch a *different*
   field) silently reset every OTHER untouched scalar field's status back to `'pending'`, wiping
   out its real approval — not limited to zero-value fields; any untouched field with a real
   existing value got the same treatment. A correct, NaN-safe version of this exact comparison
   already existed in the same function (`mergeFieldStatus`, used for the per-item
   customers/products/categories fields) — the scalar fields (`value`/`visits`/`acq`) just never
   used it, and the 4 new Distributor Secondary fields I added this session copied the broken inline
   pattern instead of the correct helper. Fixed by extracting a `scalarStatus(newGoal, existingGoal,
   existingStatus)` helper (same NaN-safe shape as `mergeFieldStatus`) and using it for all 7 scalar
   fields — the 3 pre-existing ones and the 4 new ones alike, so the bug doesn't linger for
   whichever fields didn't get fixed.
   - **Not fixed (a data cleanup, not a code fix):** the already-corrupted `visits_status: 'pending'`
     row sitting in the live DB for the member tested (Arjun Nair, `goals.id=3`, period `2026-08`)
     stays stuck until a Manager explicitly reviews that specific field via Goal Approvals (approve
     or reject it) — the code fix prevents this from happening again, it doesn't retroactively
     un-corrupt data already written before the fix. Flagged rather than silently patched via a
     direct DB write.

`vite build` + scoped `eslint` (`TeamApp.jsx`) clean after both fixes — the only count change is
`react-hooks/static-components` going from 3→7 (+4), matching the 4 new `<StableInp>` lines added
this session, same pre-existing broken inline-component pattern as `Parameters.jsx`'s `Toggle`.

**Same-day follow-up: split the Distributor Secondary dashboard content — goal-vs-achieved moved to
Goals Status, raw activity stays under Distributor Secondary.** User's ask: "the goal part should
move to Goals Status and other things stay under Distributor Secondary as earlier." The
`DistributorSecondarySection` on `Dashboard.jsx` (both the Admin org-wide and Manager team-scoped
instances) had grown to hold two different concepts stacked together — a Today/Month/Year raw
activity row, and a fixed "This Month" goal-vs-achieved gauge row underneath it. Split apart:
1. **`Dashboard.jsx`'s `DistributorSecondarySection`** — the goal-gauge block (and its now-unused
   `slices`/`aggregateForMembers` usage) removed entirely; the component is now purely the
   Today/Month/Year tab-scoped `DarkStat` row (New Outlets/Productive Outlets/Total No. of Orders/
   Value), same as it was before the goal-gauge block was added. Both call sites (Admin, Manager)
   dropped the now-unneeded `slices` prop.
2. **`GoalsStatus.jsx`** — new panel, same visual pattern as the existing "Category Breakdown"
   panel right above it: "Distributor Secondary — Goal vs Achieved (This Month)", 4 `MeterGauge`s
   (New Outlets/Productive Outlets/Total No. of Orders/Value) sourced from `scopeAgg` (already
   computed on this page via `aggregateForMembers`, already includes these 4 fields since
   `goalAggregation.js` was updated earlier this session — no new aggregation logic needed, purely
   a rendering addition). Same scope as everything else on this page: org-wide for Admin, own team
   for Manager. Empty state ("No approved Distributor Secondary goals for this month yet") when all
   4 goals are 0, matching the pattern the removed Dashboard.jsx block used.

`vite build` + scoped `eslint` (`Dashboard.jsx`, `GoalsStatus.jsx`) clean after this change.

## Distributor Secondary checkout rework: confirm dialog → ongoing orders → Retailing Complete lock
## (5 Aug 2026 session) — BUILT, SCHEMA NOT YET APPLIED, NOT YET BROWSER-TESTED

**User's ask, condensed:** reported checkout "not saving," plus a real multi-step flow request.
Read through `ItemOrderSheet.checkout()`/`db.createSecondaryOrder`/`db.createRetailVisit` and found
no obvious static bug — since the whole flow was being rebuilt anyway, the rebuild's real error
surfacing should resolve whatever was silently failing rather than patching the exact code path
being removed. New flow: Cart → **Checkout** → **Confirm dialog** (order id, item count, total
value; Edit or Confirm) → Confirm → **Ongoing Orders sheet** (today's not-yet-locked orders, Edit
or Cancel each) → **Retailing Complete** button → **summary dialog** (Confirm or Cancel) → Confirm
**locks every one of today's orders**, whole day, across every beat/distributor.

**Resolved via AskUserQuestion before building:**
- Ongoing Orders sheet is a **one-off popup right after each Confirm**, not a persistent
  always-visible section. Known limitation: if a rep closes it without hitting Retailing Complete,
  the only way back in today is confirming another order — flagged, not built, since the user
  explicitly picked this scope over the persistent-section alternative.
  ~~Superseded same session~~ — see the immediate follow-up entry below: the user reversed this
  specific answer right after seeing it built, asking for a persistent tab instead.
- **Cancel** on an ongoing order = **soft-cancel** (`cancelled` flag, matches this app's existing
  convention elsewhere, e.g. `distributor_order_items.cancelled`), and also reverts the outlet to
  "Not Visited" so it can be revisited/reordered same day.
- **Edit** changes items/quantities only — outlet/beat/distributor stay fixed.
- Retailing Complete's own summary dialog: **Cancel there just dismisses it, no data change** — the
  rep backs out of finalizing, nothing gets locked (clarified after an initial ambiguous answer that
  conflated it with per-order Cancel).

**Built:**
1. **Schema** — `secondary_orders` gains `locked`/`cancelled` booleans (both default `false`).
2. **`db.js`** — `updateSecondaryOrderItems(orderId, items)` (delete-then-reinsert
   `secondary_order_items`, simplest correct approach since the cart is always rebuilt fresh, no
   incremental diffing needed unlike `OrderPickingDetail.jsx`'s pattern for the primary order
   pipeline); `cancelSecondaryOrder(orderId)` (sets `cancelled=true`, deletes the matching
   `retail_visits` row by `order_id` so the outlet reverts to unvisited);
   `fetchOngoingSecondaryOrders(memberId, date)` (same shape as the existing
   `fetchSecondaryOrdersForDate`, filtered to `locked=false AND cancelled=false`);
   `lockSecondaryOrdersForDate(memberId, date)` (batch-sets `locked=true` on all that member's
   that-day non-cancelled, non-locked orders — the Retailing Complete confirm action).
   `fetchSecondaryOrdersForDate` (existing, feeds Day Summary) gained `.eq('cancelled', false)` so
   a cancelled order's value no longer pollutes Day Summary's outlet-wise/product-wise totals.
3. **`ItemOrderSheet`** — gained an `existingOrder` prop (pre-fills `cart` from its items when
   reopened via Edit) and a `savedOrderId` local-state tracker: the first successful `checkout()`
   still does the exact same `createSecondaryOrder`+`createRetailVisit` call as before, but no
   longer closes/auto-advances on success — instead shows a new inline confirm dialog (order id,
   item count, total). Re-checking-out from that dialog's "Edit" path now correctly calls the new
   `updateSecondaryOrderItems` (since `savedOrderId` is already set) instead of creating a
   duplicate order — this distinction (create vs. update) didn't exist at all before this session.
   "Confirm" in the dialog calls the existing `onDone` (unchanged auto-advance-to-next-outlet
   behavior) and a new `onConfirmed` callback that tells the parent to open the Ongoing Orders
   sheet. The "No Order" button is hidden once an order's been saved for this visit (doesn't make
   sense once a real order exists).
4. **New `OngoingOrdersSheet`** — fetches `fetchOngoingSecondaryOrders` on open, lists each
   order (outlet, item count, value) with Edit/Cancel, and a "Retailing Complete" button
   (disabled when the list is empty) that opens `RetailingCompleteDialog`. Rendered at `zIndex=340`
   — above `ItemOrderSheet`'s `320` — specifically so it still renders on top even when auto-advance
   has already reopened the sheet underneath it for the next outlet.
5. **New `RetailingCompleteDialog`** — summary (order count + total value across today's ongoing
   orders), Cancel just closes it, Confirm calls `lockSecondaryOrdersForDate` and tells the parent
   to close everything and refresh (outlet statuses + `loadAll()`).
6. **Parent `DistributorSecondary` component** — new `showOngoingOrders`/`editingOrder` state.
   Edit from the Ongoing Orders sheet derives the order's beat (looked up from the already-loaded
   `beats` list by `beat_id`) and outlet (from the order's joined `outlet` object), sets them as the
   active beat/outlet, and passes the order in as `existingOrder` — reusing the exact same
   `ItemOrderSheet` render path a fresh visit uses, just pre-filled. Known rough edge, not fixed:
   editing an order from a different beat than the one currently being walked temporarily shifts
   "the active beat" context for auto-advance purposes — minor, and the rep can just navigate back
   to Beats afterward; not worth the complexity of tracking "beat being walked" separately from
   "beat of the order being edited" for this pass.

**Schema — CONFIRMED APPLIED (verified via live REST probe, 8 Aug 2026):**
```sql
alter table secondary_orders
  add column locked boolean not null default false,
  add column cancelled boolean not null default false;
```

**Still open / not done yet:**
- ~~Schema not yet applied~~ — confirmed applied via REST probe against `secondary_orders` (8 Aug
  2026): both columns exist and return real values on live rows.
- **Not browser-tested** — same constraint as most work this session. `vite build` clean; scoped
  `eslint` (`db.js`, `DistributorSecondary.jsx`) clean — the one new lint hit
  (`react-hooks/set-state-in-effect` on `OngoingOrdersSheet`'s load-on-mount effect) is explicitly
  suppressed via `eslint-disable-next-line`, matching an already-accepted pre-existing pattern
  elsewhere in this app (e.g. `InvoiceApprovalTile.jsx`'s identical `useEffect(() => {
  loadData() }, [])` shape carries the same untouched error today).
- Full flow to verify once schema is applied: build a cart → Checkout → confirm dialog shows the
  right id/items/total → Edit → adjust qty → Checkout again → confirm it updated in place (not
  duplicated, check `secondary_orders`/`secondary_order_items` row counts) → Confirm → Ongoing
  Orders sheet appears → Cancel one order → confirm that outlet reverts to "Not Visited" in the
  beat list → confirm a second order → Retailing Complete → summary dialog → Cancel (verify nothing
  locked) → Retailing Complete again → Confirm → verify every one of today's orders is locked
  (no longer editable) and Day Summary's totals exclude the cancelled order.
- **Original "checkout not saving" report never independently reproduced** — no obvious bug found
  in the old code path via static reading; if it resurfaces after this rebuild (i.e. the NEW
  checkout also silently fails to save), that would need real browser-console error output to
  chase further, not more guessing from the code alone.

### Immediate follow-up, same session: Ongoing Orders moved from a popup to its own tab

User's very next ask reversed the earlier AskUserQuestion answer: Ongoing Orders should be a
**persistent tab, positioned right before Day Summary** (not a one-off popup shown only right
after confirming an order), listing all of today's not-yet-locked orders with Edit/Delete, plus the
one-time "Retailing Complete" button at the bottom of that same tab screen.

**Changed:**
- **`TABS`** gained `['ongoing', 'Ongoing Orders']`, inserted right before `['summary', 'Day
  Summary']` (after the beat's own `visit` tab, when one is active).
- **`OngoingOrdersSheet` → `OngoingOrdersTab`** — same Edit/Cancel/Retailing-Complete logic, but no
  longer wrapped in a `<Sheet>` popup and no longer self-fetches on mount; it now renders as plain
  tab content and receives `orders` as a prop, fetched by a new parent-level `loadOngoing()` +
  `openOngoing()` pair — exactly mirroring the existing `loadSummary`/`openSummary` pattern this
  file already used for the Day Summary tab, so switching to the tab always shows a fresh list
  rather than a stale mount-time snapshot.
- **The per-order "Cancel" button is now labeled "Delete"** (matching the user's wording) but still
  soft-cancels underneath via the same `db.cancelSecondaryOrder` — no behavior change, this session
  already confirmed soft-cancel (not hard delete) via AskUserQuestion, this is a label-only change.
- **`ItemOrderSheet`'s confirm dialog no longer opens Ongoing Orders on Confirm** — since it's a
  real tab now, Confirm just does the same auto-advance-to-next-outlet (`onDone()`) the original
  pre-rework flow already did; the rep reaches Ongoing Orders by tapping the tab whenever they want,
  not automatically. The now-unused `onConfirmed` prop was removed from `ItemOrderSheet` entirely.
- Row styling switched from plain divs to the shared `Card` component, matching every other list in
  this file (Beats/Outlets).

`vite build` + scoped `eslint` (`DistributorSecondary.jsx`) clean — zero errors, including the
`react-hooks/set-state-in-effect` suppression from the previous version (removed entirely, since
the tab no longer self-fetches in a `useEffect` at all — the parent-driven `loadOngoing()` pattern
sidesteps that lint class the same way `loadSummary`/`DaySummary` already did).

### Second immediate follow-up, same session: auto-advance replaced with a nearest-outlet suggestion

User's next report: after saving an order, the app was auto-reopening an outlet automatically
("again showing the same outlet automatically") — the old `afterVisitRecorded` picked "the next
un-visited outlet in list order" and opened it immediately with no chance to choose. Replaced
entirely with an explicit pick step: after a visit is recorded (order or no-order), show a new
**`NextOutletSheet`** listing every remaining outlet in the beat, **nearest-first by straight-line
distance** from the outlet just completed, each with a tentative on-foot ETA — tapping one opens
it for ordering; closing without picking returns to the beat's own outlet list, which stays fully
browsable ("choose any other outlet" — nothing is filtered out, only ranked).

**Built:**
- **`sortOutletsByDistance(from, outlets)`** (new, local to this file) — reuses the existing
  `haversineMeters` from `src/lib/geo.js` (already used elsewhere in this app for
  `LoadCreatedList.jsx`'s direction-conflict check) rather than adding a new distance function.
  Outlets missing `lat`/`lng` (geolocation was denied when they were added — a known soft-fail
  path already documented for `AddOutletSheet`) sort to the end with distance/ETA shown as
  "Distance unknown" rather than being dropped from the list.
- **ETA is a tentative walking estimate** (~4 km/h, straight-line distance ÷ assumed speed) — no
  real routing between retail outlets exists or was asked for, same "tentative" framing the user
  used themselves; this mirrors the existing precedent of `RouteMapSheet`'s OSRM estimate being an
  estimate, not a promise.
- **`afterVisitRecorded`** no longer auto-selects and opens the next outlet — it captures the
  just-completed outlet (`activeOutlet` at call time, before it's cleared), computes the remaining
  un-visited outlets the same way as before, and instead of picking one, sets
  `nextOutletChoice = { from, options: sortOutletsByDistance(from, remaining) }`, which renders the
  new sheet. If zero outlets remain, the existing "All outlets in this beat are done for today"
  toast still fires, unchanged.

`vite build` + scoped `eslint` (`DistributorSecondary.jsx`) clean, zero errors.

### Third same-session follow-up: "Ongoing Orders rendering blank" — a real date bug, not a UI bug

**Diagnosed via a direct read-only REST probe against the live `secondary_orders` table** (same
technique used earlier this session for the goal-parameters bug) rather than guessing from the
code. Confirmed the schema (`locked`/`cancelled`) was already applied and the query itself was
correct — the bug was upstream: **`db.createSecondaryOrder` stamped `order_date` using
`today.toISOString().slice(0, 10)` (UTC) while the order's own `id` prefix on the very same line
above it used local date components** (`today.getDate()`/`getMonth()`/`getFullYear()`) — for IST
(UTC+5:30), any order placed between ~12:00–5:29am local time got an `order_date` one day behind
its own ID's date, and behind every query that filters "today" via this file's local `todayStr()`.
Same bug class already fixed elsewhere in this app (`attendance_punches`, `period.js`) — this call
site had never been touched by those fixes. Live evidence: 10 orders existed with real IDs like
`SO-08082026-12` (correctly local-dated) but `order_date: "2026-08-07"` — one day off, invisible
to any "today" query despite being real, valid, unlocked orders.

**Fixed:**
- `db.createSecondaryOrder` — `order_date` now built from the same local `yyyy`/`mm`/`dd` values
  already computed for the ID prefix, not `toISOString()`.
- `DistributorSecondary.jsx`'s two `db.createRetailVisit(...)` call sites (order outcome and
  no-order outcome) — both now pass `visit_date: todayStr()` explicitly instead of relying on the
  `retail_visits` table's `default current_date`, which resolves in the database session's own
  timezone (commonly UTC) and carries the identical risk.
- **User ran a one-time data fix** (`update secondary_orders set order_date = '2026-08-08' where
  order_date = '2026-08-07'`) to correct the 14 already-mis-dated rows — re-verified via REST
  afterward: all 14 now read `order_date: "2026-08-08"`, unlocked, uncancelled, so Ongoing Orders
  should show them all now.

`vite build` + scoped `eslint` (`db.js`, `DistributorSecondary.jsx`) clean after this fix.

**Nothing else outstanding from this session's Distributor Secondary checkout rework** — schema
applied, the date bug is fixed going forward and the existing data corrected, Ongoing Orders/Day
Summary should now show real data for "today" reliably. Still not driven through a full browser
session end-to-end (create → edit → delete → Retailing Complete → lock verified) — worth a real
pass next time this area comes up.

## Day Summary record + PDF download, created on Retailing Complete (5 Aug 2026 session) — BUILT,
## SCHEMA NOT YET APPLIED, NOT YET BROWSER-TESTED

**User's ask:** a real Day Summary — with its own id and timestamp, like every other entity in this
app (Beat/Outlet/Order/Load) — created specifically when Retailing Complete is confirmed, and
downloadable as a single PDF. The existing "Day Summary" tab was (and stays) a live,
always-recomputed rollup with no identity of its own; this is additive, a permanent "receipt"
stamped once retailing is actually finished for the day, not a replacement for that live view.

**Built:**
1. **Schema** — new `day_summaries` table. `id` format `DS-{memberId}-DDMMYYYY` — naturally unique
   per member+day without a count-query race (unlike `SO-DDMMYYYY-NN`'s sequence), since Retailing
   Complete only ever fires once per member per day; backstopped by a `unique(member_id,
   summary_date)` constraint.
2. **`db.js`** — `createDaySummary(memberId, date, totals)` (inserts one row: outlets visited,
   orders, value) and `fetchDaySummaryForDate(memberId, date)` (single-row lookup).
3. **`src/lib/printDaySummary.js`** (new) — same `jsPDF` text/line-call pattern as
   `printSecondaryOrder.js` (this app's established print-module shape, no library beyond jsPDF
   itself): header (Summary ID, Date, Generated timestamp), outlet-wise table (orders + no-order
   visits with reasons), product-wise table, totals footer.
4. **`RetailingCompleteDialog`** — on Confirm, after `lockSecondaryOrdersForDate` succeeds, also
   fetches today's visits (for the outlets-visited count) and calls `createDaySummary`. The dialog
   then switches to a success state showing the real id + timestamp with a "Download Summary"
   button, instead of immediately closing — the rep sees the receipt right where they completed
   the day, then taps "Done" to close everything (same `onConfirmed` callback as before).
5. **`DaySummary` tab** — the parent's existing `loadSummary()` now also fetches
   `fetchDaySummaryForDate`, and if a record exists for today, the tab shows a green "✓ Retailing
   Complete — DS-..." banner with its own re-download button, above the untouched live rollup
   content — so the receipt stays reachable later in the day too, not just in the one-off dialog.
   `onRetailingComplete`'s callback (fired from the Ongoing Orders tab) also re-fetches this record
   immediately, so switching to Day Summary right after completing shows the banner with no manual
   refresh needed.
6. **Data-consistency choice**: the PDF and the banner both read from the exact same
   `visits`/`orders`/`products` already in scope wherever they're triggered (the dialog's own
   `orders` prop + a fresh visits fetch; the tab's existing `summaryVisits`/`summaryOrders`) — no
   separate "stored summary contents," only the lightweight totals row is persisted. The full
   breakdown is always regenerated from the real underlying data, which is safe here since the
   orders are already locked by the time a summary exists.

**Schema — CONFIRMED APPLIED (verified via live REST probe, 8 Aug 2026 — table already holds at
least one real row, `DS-3-08082026`, meaning a full Retailing Complete flow has already run
successfully end-to-end):**
```sql
create table day_summaries (
  id text primary key,
  member_id bigint not null references users(id),
  summary_date date not null,
  created_at timestamptz not null default now(),
  total_outlets_visited integer not null default 0,
  total_orders integer not null default 0,
  total_value numeric not null default 0,
  unique (member_id, summary_date)
);
```

**Still open:**
- ~~Schema not yet applied~~ — confirmed applied, see above.
- **Not fully browser-verified by this session directly** — a real `day_summaries` row exists in
  the live DB, which is strong evidence the flow works, but this was discovered via a REST probe,
  not a driven browser pass. `vite build` + scoped `eslint` (`db.js`, `printDaySummary.js`,
  `DistributorSecondary.jsx`) clean, zero new errors. Full flow to verify once schema is applied:
  Retailing Complete → confirm the success dialog shows a real id/timestamp and the downloaded PDF
  matches the day's actual orders → reopen the Day Summary tab → confirm the same banner + a
  working re-download appears there too.

## Late Present Rule + Half Day Rule (Attendance) (8 Aug 2026 session) — BUILT, SCHEMA NOT YET
## APPLIED, NOT YET BROWSER-TESTED

Brand-new feature, not discussed in any prior session (confirmed via full-file exploration + a
CLAUDE.md grep before planning). Turns the existing Attendance/Punch-In system's `duty_status`/
`minutes_late` — previously a raw, zero-grace-period, purely informational signal with no threshold
and no effect on Present/Pending/Absent — into a real, governed policy: HR authors rules (which
employees, how much grace time, who reviews exceptions), Admin approves each rule once before it's
live, punches that break an approved rule auto-flag, and each flagged instance goes through its own
waiver approval before it either clears or counts toward an escalation into an extra Absent. Full
plan approved via plan-mode before building (comparable in scope to the original Monthly Goals
architecture) — see the chat for the approved plan text.

**Resolved via AskUserQuestion before building (2 rounds, 6 questions total):**
- **Two separate approval layers.** (1) Admin approves each *rule* once, before it's active — role,
  selected users, threshold, who reviews exceptions. (2) Independently, each individual auto-flagged
  Late Present/Half Day *instance* goes through its own waiver approval.
- **No reversal/override step.** Rule creation picks **Approver 1 = Manager or HR**. If Approver 1
  = Manager, **Approver 2 is automatically HR** (a required second sign-off, not an override — just
  the other party in the pair). If Approver 1 = HR, there's **no Approver 2 at all** — HR's single
  approval is final. Approvals are one-directional, matching this app's existing precedent (Invoice/
  Journey approvals also have no reject-after-approve path).
- **"Admin sets maximum late present allowed by HR/Manager" = a count cap** (waivers HR/Manager may
  each grant a given employee per month), not a grace-period ceiling.
- **Half Day supersedes Late Present** when a single arrival crosses both thresholds — confirms Half
  Day is the same lateness signal as Late Present, just a larger cutoff, not a separate mechanism.
- **Manager scoping needed a real, pre-existing gap closed**: no general employee→Manager
  relationship existed (`members.manager_id` only ever covered Sales Team, via a different table,
  for the Goals system). Added a new **`users.manager_id`** column, generalizing
  `Parameters.jsx`'s existing manager-assignment pattern onto `Employees.jsx` for any role.
- **Escalation ("N unapproved = 1 Absent") is a derived, live-computed extra count** — folded into
  the existing Present/Pending/Absent/Rate stats, not tied to any calendar cell (no natural date to
  assign a "floating" absence to; matches how every other stat in this app is computed live, never
  a stored running counter).

**Built:**
1. **`src/lib/attendanceRules.js`** (new, pure, no DB) — `resolveRuleClassification(user,
   approvedRules, minutesLate)` (Half Day evaluated first per the supersedes rule, largest-threshold-
   wins if multiple rules of the same type match), `deriveApprover2Role`, `isUnapprovedInstance`,
   `isFullyApprovedPunch`, `eligibleForWaiverStage` (Admin always eligible; Manager only for their
   own team's Manager-first stage-1 items; HR for HR-first stage-1 and always for stage-2), and
   **`computeAttendanceStats(punches, today, daysInMonth, ruleSettings)`** — the single source of
   truth for Present/Pending/Absent/Rate/AttCal-days/AttCal-flags/unapproved-Late-count/unapproved-
   Half-Day-count/effective-Absent, now shared by both the HR roster and self-view calendar, which
   previously hand-copied this same formula independently (a real, pre-existing duplication this
   session closed as a side effect of needing to add the new fields to both places anyway).
2. **`useData.jsx`** — new `approvedAttendanceRules` in global context (fetched once via
   `db.fetchAttendanceRules()`, filtered to `status==='approved'` client-side), same "load reference
   data once globally" convention as `roles`/`categories`.
3. **`db.js`** — `fetchAttendanceRules`, `createAttendanceRule` (auto-derives `approver2_role`),
   `approveAttendanceRule`, `fetchAttendanceRuleSettings`/`upsertAttendanceRuleSettings`,
   `fetchPendingWaiverApprovals` (fetch-broad; HR/Admin use it unfiltered, Manager scopes it
   client-side to `user.manager_id === currentUser.id`), `approveWaiverStage1`/`approveWaiverStage2`
   (each counts this employee's this-month waivers already granted by that approver role before
   writing, blocking with an inline error if `attendance_rule_settings`' cap would be exceeded; both
   call `db.logActivity` on success, per this session's established Activity Log convention).
   `punchIn(...)` gained `ruleType`/`ruleId` params, writing the new `rule_status`/`rule_id`/
   `rule_waiver_status` columns — the existing `duty_status`/`minutes_late` write is completely
   untouched. `fetchAllAttendanceForMonth`/`fetchPendingPunchApprovals`/
   `fetchPendingActivityApprovals` all gained `manager_id` on the embedded user join + a new
   `rule:attendance_rules(*)` join, so `DayDetailSheet` has consistent rule data regardless of which
   entry point opened it.
4. **`PunchInGate.jsx`** — alongside the existing `dutyStatusFor()` call, now also calls
   `resolveRuleClassification(currentUser, approvedAttendanceRules, duty.minutesLate)` (needed
   adding `useData()` to this component, which previously only used `useAuth()`) and passes the
   result into `db.punchIn(...)`. No UI change to the punch-in flow itself — the existing one-time
   Late/On-Time screen is unchanged; the new classification surfaces later, in Attendance/roster/
   self-view, not at punch time. Users not covered by any approved rule keep exactly today's
   behavior (informational message only, no flag, no workflow, no count).
5. **`ui.jsx`'s `AttCal`** — new optional `flags` prop (parallel array to `days`, `null | 'late' |
   'half_day'`), rendered as a small colored corner dot **without changing the existing P/X/A/W
   background color** — attendance-legitimacy and arrival-time-rule-compliance are independent axes
   that can co-occur on the same day. A waived instance has no dot (matches "removed from the late
   present column").
6. **`Employees.jsx`** — new "Reporting Manager" `<select>` in `UserForm` (options = `role_id==='r2'`
   users, same filter Parameters.jsx already uses), writing `manager_id` on save.
7. **`Attendance.jsx`** — the biggest change:
   - Router gains a third branch: Manager (`role?.id==='r2'`) now gets `AttendanceManagerView` (new)
     instead of falling through to the plain self-view — Manager previously had **zero presence** in
     this file at all.
   - `AttendanceHR()` gained 3 new cards: **Attendance Rules** (list + status badge + "+ Create
     Rule" Sheet + Admin-only "Approve Rule" button), **Attendance Rule Settings** (Admin-only, 4
     number inputs for the waiver caps + escalation thresholds), **Pending Waiver Approvals** (queue
     with inline Waive/Approve-Stage-2 button shown only when `eligibleForWaiverStage` says the
     viewer can act on that row; ineligible rows show "Not yours" instead).
   - **`AttendanceManagerView`** (new) — `MyAttendanceCalendar` (Manager punches in like anyone
     else) plus a "Team Waiver Approvals" card scoped to their own team via the new `manager_id`.
   - **`CreateRuleSheet`** (new) — Rule Type radio, Role select, a Chips-style multi-select user
     picker (adapted from `Parameters.jsx`'s existing `Chips` component shape), grace-period-minutes
     input, Approver 1 radio with Approver 2 shown read-only/auto.
   - **`DayDetailSheet`** gained a new block (alongside the existing `duty_status` line): if
     `punch.rule_status` is set, shows a Late Present/Half Day badge + waiver status, and — gated by
     `eligibleForWaiverStage` — a Waive/Approve-(Stage 2) button, reusing the Sheet's existing
     `runApprove` pattern.
   - Roster rows gained Late/Half Day count badges (unapproved instances only) and now pass
     `computeAttendanceStats`'s `flags` into `AttCal`; the roster's "A" tile now shows
     `effectiveAbsent`, not the raw punch-less-day count.
8. **`MyAttendanceCalendar.jsx`** (self-view) — same `computeAttendanceStats` call, same Late/Half
   Day badges + `effectiveAbsent`-in-place-of-raw-Absent + `AttCal` flags, so "user attendance will
   show same" holds for every role, not just the HR roster.

**Schema — NOT yet applied, user must run:**
```sql
-- General employee -> Manager relationship (new; only Sales Team had this before, via members)
alter table users add column manager_id bigint references users(id);

-- HR-authored, Admin-approved rules. One row per rule; rule_type distinguishes Late Present vs Half Day.
create table attendance_rules (
  id bigserial primary key,
  rule_type text not null,                  -- 'late_present' | 'half_day'
  name text,
  role_id text not null references roles(id),
  user_ids jsonb not null default '[]',     -- users.id values covered by this rule (all share role_id)
  threshold_minutes integer not null,       -- grace period past duty_start_time before this rule fires
  approver1_role text not null,             -- 'manager' | 'hr'
  approver2_role text,                      -- 'hr' when approver1_role='manager', else null (no stage 2)
  status text not null default 'pending',   -- 'pending' | 'approved'  (Admin's one-time approval of the RULE)
  created_by bigint not null references users(id),
  created_at timestamptz not null default now(),
  approved_by bigint references users(id),
  approved_at timestamptz
);

-- Per-punch rule outcome + its own (up to 2-stage) waiver approval, independent of the existing
-- punch_approval_status/activity_approval_status columns, which stay exactly as-is.
alter table attendance_punches
  add column rule_status text,                    -- 'late_present' | 'half_day' | null
  add column rule_id bigint references attendance_rules(id),
  add column rule_waiver_status text not null default 'not_applicable',
    -- 'not_applicable' | 'pending' | 'stage1_approved' | 'approved'
  add column rule_approver1_by bigint references users(id),
  add column rule_approver1_at timestamptz,
  add column rule_approver2_by bigint references users(id),
  add column rule_approver2_at timestamptz;

-- Admin-only global policy: waiver caps + escalation thresholds. Singleton row.
create table attendance_rule_settings (
  id integer primary key default 1,
  max_waivers_manager integer,            -- per employee per month; null = unlimited
  max_waivers_hr integer,                 -- per employee per month; null = unlimited
  unapproved_late_to_absent integer,      -- N unapproved Late Present = 1 effective Absent; null = off
  unapproved_half_day_to_absent integer,  -- N unapproved Half Day = 1 effective Absent; null = off
  updated_by bigint references users(id),
  updated_at timestamptz
);
insert into attendance_rule_settings (id) values (1);
```

**Verification done this session:** `vite build` clean. Scoped `eslint` on every new/touched file
(`attendanceRules.js`, `db.js`, `useData.jsx`, `PunchInGate.jsx`, `ui.jsx`, `Employees.jsx`,
`Attendance.jsx`, `MyAttendanceCalendar.jsx`) — `git stash` diff confirms every pre-existing issue
(`ui.jsx`'s 2 `react-refresh/only-export-components`, `useData.jsx`'s 1 of the same + 1
exhaustive-deps warning, `Employees.jsx`'s unused `SBadge`) is byte-identical before/after. **Two
new lint errors, both accepted as-is**: `Attendance.jsx`'s two new `useEffect(() => { load() }, [])`
mount-fetch effects (in `AttendanceHR` and the new `AttendanceManagerView`) trigger
`react-hooks/set-state-in-effect` — this is the exact same already-accepted pattern class as
`InvoiceApprovalTile.jsx`'s pre-existing, left-unsuppressed `useEffect(() => { loadData() }, [])`
(confirmed identical shape via direct comparison), not a new category of problem.

**Still open / not done yet:**
- **Schema not yet applied** — nothing in this feature works until all 3 blocks above run;
  `createAttendanceRule`/`approveWaiverStage1`/etc. will error until then, and `punchIn` will simply
  keep writing `rule_status: null` (soft-fail-safe, `approvedAttendanceRules` stays empty from
  useData's fetch until the table exists).
- **Not browser-tested** — same constraint as most feature work in this project (no chromium-cli/
  Playwright by default). Full flow to verify once schema is applied, in order: as HR, create a Late
  Present rule (small threshold, 1-2 test users) → as Admin, approve the rule → as one of those
  users, punch in late → as HR/Admin, confirm the instance appears in Pending Waiver Approvals and
  the roster's Late badge/dot → approve Stage 1 (as Manager if the rule was Manager-first, confirming
  the new `AttendanceManagerView` queue is correctly scoped) → confirm Stage 2 (HR) is required and
  completes it → confirm the badge/dot clears once fully approved. Repeat briefly for a Half Day
  rule with a larger threshold, confirming it supersedes Late Present on the same punch. Set a low
  waiver cap in Attendance Rule Settings and confirm the UI blocks further waivers once hit. Set a
  low "N unapproved = absent" threshold and confirm the Effective Absent stat increments correctly
  on both the HR roster and self-view.
- **`Employees.jsx`'s Reporting Manager field has no cycle guard** — nothing stops assigning a
  Manager as their own report, or a manager-chain loop; not asked for, not built. Low real-world
  risk (the dropdown only lists `role_id==='r2'` users, and a Manager assigning themselves would be
  an obvious user error, not a silent one), flagged rather than defended against.
- **No reject path on a waiver instance** — matches the confirmed "no reversal" design; an
  unwaived instance simply stays unapproved and feeds the escalation count, there's no explicit
  "Reject" button distinct from "not yet approved."