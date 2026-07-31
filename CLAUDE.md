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
- `AssignedLoads.jsx`: Accept flow (in-transit toggle mutually exclusive w/ manual reporting time; 
  >30min total requires delay comment) → "Confirm Vehicle Parked" → `DriverOrderConfirmTile` 
  (per-order load-qty confirm, unlocks WM's next-stop advance).
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

## Delivery/Transit Tracking — PLANNED, NOT STARTED (spec'd 1 Aug 2026, build in a new chat)

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

### Phase 1 — invoice-gated checklist + route + arrival (build this first, no live GPS)

1. **Group invoice creation by allocation.** `db.fetchOrdersAwaitingInvoice()` returns a flat list — 
   change `AwaitingInvoiceTile.jsx` to group by `allocation_id`, one section per Load.
2. **Driver's per-load invoice status + checklist.** New tile on `AssignedLoads.jsx`, shown when 
   `allocation.status === 'loading_complete'`: per-order Invoiced/Not badge (new batched 
   `db.fetchInvoicesForOrders(orderIds)`, or reuse the `fetchInvoiceForOrder` pattern). "Invoiced" = 
   invoice row exists, any status (pending_approval counts — this is about paperwork done, not 
   approval). Once all orders in the allocation are invoiced: 3-item Yes/No confirmation (Collected 
   Invoice, Collected Waybill, Informed to Distributor) → all Yes unlocks **Start Journey**.
3. **Start Journey → route plan.** Reuse the OSRM `/trip/` call already in `RouteMapSheet.jsx` (don't 
   reinvent) to get optimized stop order + leg durations. Store as `vehicle_allocations.route_plan` 
   jsonb: `{ stops: [{order_id, distributor_name, leg_duration_min, cum_eta_min}], 
   total_duration_min, total_distance_km }`. Set `status='in_transit'`, `journey_started_at=now()`. 
   Show `RouteMapSheet.jsx` for stop order.
4. **Per-stop arrival.** New driver tile: current stop = `route_plan.stops[delivery_stop_index]`. 
   "Arrived" button → `distributor_orders.arrived_at=now()`, increment 
   `vehicle_allocations.delivery_stop_index`. Show est. (from `cum_eta_min` relative to 
   `journey_started_at`) vs actual elapsed. Last stop confirmed → `status='completed'`, 
   `journey_completed_at=now()`.
5. **Cross-role order status.** `OrderTimeline.jsx` + `OrderFullDetail.jsx` (shared by 
   `OrderStatus.jsx` across Admin/Manager/Accounts/Team): add "In Transit" and "Arrived at 
   Distributor — {timestamp}" stages, show vehicle number + driver name while in transit (check 
   whether the order-fetching query already joins `allocation.vehicle`/`allocation.driver` — extend 
   if not).

**Phase 1 schema (give user as SQL to run manually in Supabase dashboard):**
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
`status` is a plain text column (no DB enum) — new string values `'in_transit'`/`'completed'` need 
no migration.

**Phase 1 files:** `AwaitingInvoiceTile.jsx`, `AssignedLoads.jsx` (or a new tile component following 
the `DriverOrderConfirmTile.jsx` pattern), `OrderTimeline.jsx`, `OrderFullDetail.jsx`, `db.js` (new: 
`fetchInvoicesForOrders`, `updateAllocationChecklist`, `startJourney`, `confirmArrival`), reuse 
`RouteMapSheet.jsx`.

### Phase 2 — live GPS tracking, websocket admin map, idle alerts (separate follow-up, after Phase 1 is tested)

**Real constraint, not a choice:** live position only works while the driver keeps a dedicated 
Journey screen open/foregrounded (`navigator.geolocation.watchPosition`) — no native app or PWA 
background service worker exists. Same precedent as `LoadingScreen.jsx` (explicitly "NOT globally 
persistent across navigation").

1. **New table `vehicle_locations`** (ping history):
```sql
create table vehicle_locations (
  id bigserial primary key,
  allocation_id text not null references vehicle_allocations(id),
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);
```
Must also enable Realtime replication on this table via Supabase Dashboard (manual step, can't be 
done from code).
2. **Driver side:** while `status='in_transit'` and the Journey screen is open, `watchPosition` 
   throttled to ~1 ping/45s → new `db.recordVehicleLocation(allocationId, lat, lng)`. Throttle to 
   protect the Nano-tier instance (see Recurring Bug Patterns #5).
3. **Admin side:** new `VehicleLiveMap.jsx`, Supabase Realtime `postgres_changes` subscription on 
   `vehicle_locations` INSERT, Leaflet markers (reuse loader pattern from `RouteMapSheet.jsx`). Idle 
   detection computed client-side (no Edge Functions exist yet — same gap as `createUser()`): track 
   `last_moved_at` per allocation = last ping that differs from prior by >~50m; 
   `now() - last_moved_at > 30min` while `in_transit` → idle badge + push into existing 
   `notifications` table targeting `['r1']` (reuses `NotificationBell.jsx`, no new alert system).
4. **ETA vs actual on the live map:** per active leg, `route_plan` estimate vs elapsed time since 
   previous stop's `arrived_at` (or `journey_started_at` for leg 1).

### To start Phase 1 in a new chat
Say: "Read CLAUDE.md, build Phase 1 of Delivery/Transit Tracking." The new chat should read this 
section, confirm the Phase 1 SQL has been run, then implement in the order listed above (1→5), 
building and testing incrementally rather than all at once.