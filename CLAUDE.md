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
- **Goals/Targets**: Manager sets parameter scope → Sales Team sets goal values → lock on submit → 
  Manager approves/rejects per-field → all-approved triggers target. Achievement computed exclusively 
  from `invoices` (approved-status goal + now approved-status invoice, see Invoicing below).
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

## Daily Stock Update — Warehouse Manager (NOT YET BUILT — spec captured 2 Aug 2026, build next
session)

**User's ask, verbatim-condensed:** new menu for Warehouse Manager: a page listing all products,
grouped category-wise. For each item, WM marks one of three statuses: **Available**, **Unavailable**,
or **Wait**. WM can change any item's status at any time (not locked/one-shot). Each status change is
timestamped.

This status then affects the **order-creation screen** (`DistributorOrder.jsx`, Sales Team): rows for
Available items show green; Wait items and Unavailable items both show red, but only Unavailable
items are selection-disabled (Wait items are still selectable, just visually flagged red like
Unavailable — as literally described; worth confirming this is intentional and not meant to be a
third color, e.g. amber, for Wait specifically, since visually collapsing two different meanings into
the same color is easy to misread at a glance).

**Important distinction from what already exists:** this is a NEW concept, not a rename of something
already built. `distributor_order_items.availability` (see Distributor Order → Picking → Load →
Delivery Pipeline above) is set per **order item**, during the **Picking** phase, after an order
already exists (WM marks what's physically available while fulfilling a specific order). This new
feature is per **product**, set **proactively/daily** independent of any order, and is meant to guide
Sales Team *before* they even create an order. Don't conflate the two — likely two separate
status fields on two different tables (or a new table), not a reuse of the existing picking
`availability` column.

**Open questions to resolve at the start of next session, before writing schema:**
- Does "daily" mean the status should auto-reset each day (WM re-confirms every product every
  morning), or is it just a live/current field that persists until WM changes it again (with "daily"
  only describing how often WM is expected to *use* the page, not a scheduled reset)? Changes
  whether this needs a per-day history table (`product_stock_status` rows keyed by product+date) or
  a single current-status column on `products` (simpler, but no historical record of past days'
  stock beyond the single "last changed at" timestamp).
- Does the red/red (Wait vs Unavailable) color collapse above need a third color instead?

**Resolved (2 Aug 2026):** status is **global per product, not per-warehouse** — user confirmed
products will be tagged to a specific warehouse in a **later** session (separate piece of work, not
part of this build). Build Daily Stock Update against a single status per product for now; revisit
once warehouse-tagging exists if per-warehouse stock status turns out to be needed then.

**Likely shape (not yet built, for reference only):** add `stock_status text`, `stock_status_updated_at
timestamptz`, `stock_status_updated_by` to `products` (single global status per product, per the
resolved question above — no per-warehouse or per-day history table needed unless the "daily reset"
question above resolves to needing one). New WM-only page + menu id (mirror into both `WebApp.jsx`'s
`ALL_MENUS` and `Settings.jsx`'s copy per Recurring Bug Pattern #6). `DistributorOrder.jsx`'s
item-selection UI needs the color/disable logic added wherever it currently renders the product list.

### To continue in a new chat
**Attendance / Punch-In System is fully built, schema-applied, and browser-confirmed working** as of
the 2 Aug 2026 session (commits `42c9797` → `190c1ac`). Nothing further needed to pick it back up.

Next planned piece of work: **Daily Stock Update for Warehouse Manager** (spec above, not yet built —
say "Read CLAUDE.md, let's build the Daily Stock Update feature for Warehouse Manager" to start,
resolving the open questions above first).

Also still open from earlier in the same overall session, untouched since — unrelated to Attendance:
1. **Journey Phase 4** (vein-diagram timeline, admin remarks, PDF export, Approved Journeys lists) —
   still needs `journey_complete_approval_remarks` added to `vehicle_allocations`, and still not
   browser-tested.
2. **POD photo upload** (Phase 3, older, still parked) — needs a new Supabase Storage bucket.