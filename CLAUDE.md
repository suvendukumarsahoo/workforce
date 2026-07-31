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
- Pre-existing: `db.fetchAttendance` queries nonexistent month/year columns (very old bug, may still 
  exist).

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

### Phase 3 — per-stop delivery workflow (unloading → complete → POD) + driver lock-out — NOT
STARTED, spec'd 2 Aug 2026, to be built in a new chat

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

**First-pass technical shape (confirm/refine when actually planning in the new chat, not final):**
- Per-order additions likely needed on `distributor_orders`: `unloading_started_at`,
  `delivery_completed_at`, `delivery_lat`/`delivery_lng` (captured at Delivery Complete, same
  `navigator.geolocation` pattern as vehicle pings), `pod_url` (photo — needs Supabase Storage, not
  used anywhere in this codebase yet, so bucket/upload flow is new plumbing). Stage label likely
  derived from which timestamps are set, matching how `orderStageLabel.js` already works — probably
  extend that file rather than add a new status enum column.
- Per-allocation additions likely needed on `vehicle_allocations`: something marking
  return-to-base intent, the 3-item Journey Complete checklist (mirror the existing
  `collected_invoice`/`collected_waybill`/`informed_distributor` checklist pattern from Phase 1 —
  `vehicle_parked_confirmed`/`keys_handed_over`/`pod_handed_over` or similar), an
  admin-approval timestamp + approver (mirror `invoices.approved_by`/`approved_at`), and a
  driver-availability gate derived from "has an allocation with no admin approval yet" rather than
  a boolean flag, to avoid a second source of truth.
- Driver-lock-out check belongs in `LoadCreatedList.jsx`'s driver-selection step (`db.fetchDrivers`
  or wherever the dropdown is populated) — filter out any driver with an unapproved active
  allocation. New UI likely needed for Admin to review/approve pending Journey Completes (could live
  on `WMDashboard.jsx` as a new tile, or its own screen — not decided).
- Camera capture on mobile web = `<input type="file" accept="image/*" capture="environment">`, no
  library needed; upload target = Supabase Storage (new — nothing in this codebase currently uses
  Storage, check bucket/policy setup before assuming it's ready).
- Extend `AllocationJourneyTile.jsx`'s in-transit branch (currently just shows the Arrived button)
  to add the unloading/delivery-complete/POD/next-stop-or-return-to-base flow; extend
  `OrderFullDetail.jsx`/`orderStageLabel.js` for the new stages same as Phase 1 did.

### To continue in a new chat
Say: "Read CLAUDE.md. Phase 2 (live GPS tracking) is built and pushed; everything except the actual
moving-device location ping is confirmed working, and that part is still pending the user's test.
Start planning and building Phase 3 (per-stop delivery workflow: start unloading → delivery
complete + GPS capture → POD upload from camera → next stop or return to base → Journey Complete
checklist → Admin approval → driver unlocked for new allocation)." The new chat should read the
Phase 3 section above in full (it's a first-pass technical sketch, not a finalized schema — expect
to refine it during actual planning) plus the Driver + Loading bullet under the Distributor Order
pipeline section before starting.