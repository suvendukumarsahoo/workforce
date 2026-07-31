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

**NOT YET BUILT:**
1. Admin's Invoice Approval list/screen (approve pending_approval → approved, stamps approved_by/at)
2. Alert to Admin specifically when Driver confirms Loading Complete (currently only surfaces via the 
   Awaiting Invoice tile, not a push notification)
3. Invoice No./Amount display on Order Status screen
4. PDF download (confirmed approach: browser print-to-PDF via `window.print()`, no library)
5. Testing of the AwaitingInvoiceTile flow end-to-end was interrupted by a "forgot to paste code" 
   issue — re-verify before building Approval screen

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
  ## Session Update — 31 July 2026 (Invoicing bug fix)

**Bug found and fixed:** `AwaitingInvoiceTile.jsx`'s `createInvoiceFromLoad` header sent 
`customer_id: creating.distributor_id` — but the actual `invoices` table column is named 
`distributor_id`, not `customer_id`. This caused every "Save Invoice" attempt to fail silently with 
a 400 Bad Request (Postgres rejecting the unknown column). Fixed: header now sends 
`distributor_id: creating.distributor_id`. Confirmed member_id/date/other fields were correctly typed 
(`invoices.date` is `text`, not `date` type — string from `<input type="date">` is fine as-is).

**Lesson reinforced:** when a Supabase insert/update returns 400, check 
`information_schema.columns` for the actual table structure before assuming the payload is correct — 
column names can silently drift from what a component assumes (this table's customer-reference 
column was named `distributor_id` even though the app's domain language mostly says "distributor" 
elsewhere too, so this was an easy mismatch to miss).

## Invoicing — Status (continued from previous update)

**Now confirmed working:** `AwaitingInvoiceTile.jsx`'s full create flow — Order Items auto-populate, 
Invoice No./Date entry, ERP fields with soft-warning mismatch banner, save → `status='pending_approval'`.

**NOT YET BUILT (pick up next session):**
1. Admin's Invoice Approval list/screen (approve `pending_approval` → `approved`, stamps 
   `approved_by`/`approved_at`) — `db.approveInvoice(invoiceId, approvedBy)` function already exists 
   in db.js, just needs a UI screen
2. Alert to Admin specifically when Driver confirms Loading Complete (currently only surfaces via 
   the Awaiting Invoice tile count, not a push/toast notification)
3. Invoice No./Amount display on `OrderStatus.jsx` screen
4. PDF download — confirmed approach: browser print-to-PDF via `window.print()`, no library needed
5. Verify `achievementEngine.js`'s approval-gating fix (