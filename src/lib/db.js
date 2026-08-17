/**
 * lib/db.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE DATABASE ABSTRACTION LAYER
 *
 * ALL database calls in this app go through this file only.
 * No component or page imports Supabase directly.
 *
 * To migrate from Supabase to AWS (RDS/DynamoDB/Aurora) or any other backend:
 *   1. Replace the supabase calls inside each function below with your new API calls.
 *   2. Keep the same function signatures and return shapes.
 *   3. Zero changes needed anywhere else in the app.
 *
 * Return shape convention:
 *   { data: <result>, error: <Error|null> }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase'
import { deriveApprover2Role } from './attendanceRules'

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  return { data: data?.session, error }
}

export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
  return () => subscription.unsubscribe()
}

// ─── USERS ────────────────────────────────────────────────────────────────────

export async function fetchCurrentUser(authId) {
  const { data, error } = await supabase
    .from('users')
    .select('*, role:roles(*)')
    .eq('auth_id', authId)
    .single()
  return { data, error }
}

export async function fetchUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*, role:roles(id, name, color, menus, actions)')
    .order('name')
  return { data, error }
}

export async function createUser(payload) {
  // First create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
  })
  if (authError) return { data: null, error: authError }

  const { data, error } = await supabase
    .from('users')
    .insert({ ...payload, auth_id: authData.user.id })
    .select()
    .single()
  return { data, error }
}

export async function updateUser(id, payload) {
  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function deleteUser(id) {
  const { error } = await supabase.from('users').delete().eq('id', id)
  return { error }
}

// ─── ROLES ────────────────────────────────────────────────────────────────────

export async function fetchRoles() {
  const { data, error } = await supabase.from('roles').select('*').order('name')
  return { data, error }
}

export async function createRole(payload) {
  const { data, error } = await supabase.from('roles').insert(payload).select().single()
  return { data, error }
}

export async function updateRole(id, payload) {
  const { data, error } = await supabase.from('roles').update(payload).eq('id', id).select().single()
  return { data, error }
}

export async function deleteRole(id) {
  const { error } = await supabase.from('roles').delete().eq('id', id)
  return { error }
}

// ─── MEMBERS ─────────────────────────────────────────────────────────────────

export async function fetchMembers() {
  const { data, error } = await supabase.from('members').select('*').order('name')
  return { data, error }
}

export async function createMember(payload) {
  const { data, error } = await supabase.from('members').insert(payload).select().single()
  return { data, error }
}

export async function updateMember(id, payload) {
  const { data, error } = await supabase.from('members').update(payload).eq('id', id).select().single()
  return { data, error }
}

export async function deleteMember(id) {
  const { error } = await supabase.from('members').delete().eq('id', id)
  return { error }
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

export async function fetchCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('name')
  return { data, error }
}

export async function createCategory(payload) {
  const { data, error } = await supabase.from('categories').insert(payload).select().single()
  return { data, error }
}

export async function updateCategory(id, payload) {
  const { data, error } = await supabase.from('categories').update(payload).eq('id', id).select().single()
  return { data, error }
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  return { error }
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(id, name, unit)')
    .order('name')
  return { data, error }
}

export async function createProduct(payload) {
  const { data, error } = await supabase.from('products').insert(payload).select().single()
  return { data, error }
}

export async function updateProduct(id, payload) {
  const { data, error } = await supabase.from('products').update(payload).eq('id', id).select().single()
  return { data, error }
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id)
  return { error }
}

export async function updateProductStockStatus(id, status, updatedBy) {
  const { data, error } = await supabase
    .from('products')
    .update({ stock_status: status, stock_status_updated_at: new Date().toISOString(), stock_status_updated_by: updatedBy })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function updateProductIssues(id, fieldUpdates, updatedBy) {
  const { data, error } = await supabase
    .from('products')
    .update({ ...fieldUpdates, issue_updated_at: new Date().toISOString(), issue_updated_by: updatedBy })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// Clears the given (currently-true) issue fields back to false and logs a resolution row per
// field — used both for a manual untick and for the auto-resolve-on-Available transition.
export async function resolveProductIssues(productId, fields, resolvedBy, labels) {
  if (!fields.length) return { data: null, error: null }
  const clearUpdate = Object.fromEntries(fields.map(f => [f, false]))
  const { data, error } = await supabase
    .from('products')
    .update({ ...clearUpdate, issue_updated_at: new Date().toISOString(), issue_updated_by: resolvedBy })
    .eq('id', productId)
    .select()
    .single()
  if (error) return { data: null, error }
  const logRows = fields.map((f, i) => ({ product_id: productId, field: f, reason_label: labels[i], resolved_by: resolvedBy }))
  const { error: logError } = await supabase.from('product_issue_resolutions').insert(logRows)
  return { data, error: logError || null }
}

export async function fetchProductIssueResolutions(limit = 50) {
  const { data, error } = await supabase
    .from('product_issue_resolutions')
    .select('*, product:products(id, name), resolver:users!product_issue_resolutions_resolved_by_fkey(id, name)')
    .order('resolved_at', { ascending: false })
    .limit(limit)
  return { data, error }
}
// ─── VEHICLES ─────────────────────────────────────────────────────────────────

export async function fetchVehicles() {
  const { data, error } = await supabase.from('vehicles').select('*').order('vehicle_number')
  return { data, error }
}

export async function createVehicle(payload) {
  const { data, error } = await supabase.from('vehicles').insert(payload).select().single()
  return { data, error }
}

export async function updateVehicle(id, payload) {
  const { data, error } = await supabase.from('vehicles').update(payload).eq('id', id).select().single()
  return { data, error }
}

export async function deleteVehicle(id) {
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  return { error }
}
// ─── WAREHOUSES ─────────────────────────────────────────────────────────────

export async function fetchWarehouses() {
  const { data, error } = await supabase.from('warehouses').select('*').order('name')
  return { data, error }
}

export async function createWarehouse(payload) {
  const { data, error } = await supabase.from('warehouses').insert(payload).select().single()
  return { data, error }
}

export async function updateWarehouse(id, payload) {
  const { data, error } = await supabase.from('warehouses').update(payload).eq('id', id).select().single()
  return { data, error }
}

export async function deleteWarehouse(id) {
  const { error } = await supabase.from('warehouses').delete().eq('id', id)
  return { error }
}
export async function allocateVehicle(orderIds, vehicleId, warehouseId, driverId) {
  const allocId = 'ALC' + Date.now().toString(36).toUpperCase()
  const { error: allocError } = await supabase.from('vehicle_allocations').insert({
    id: allocId, vehicle_id: vehicleId, warehouse_id: warehouseId, driver_id: driverId,
    status: 'waiting_driver_acceptance',
  })
  if (allocError) return { data: null, error: allocError }
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ allocation_id: allocId })
    .in('id', orderIds)
    .select()
  return { data, error }
}
export async function fetchLoadItemProgress(allocationId) {
  const { data, error } = await supabase
    .from('load_item_progress')
    .select('*')
    .eq('allocation_id', allocationId)
  return { data, error }
}

export async function createLoadItemProgress(allocationId, orderItemId, liftStackQty) {
  const { data, error } = await supabase
    .from('load_item_progress')
    .insert({
      allocation_id: allocationId, order_item_id: orderItemId,
      lift_stack_qty: liftStackQty, loaded_qty: 0, status: 'loading', started_at: new Date().toISOString(),
    })
    .select()
    .single()
  return { data, error }
}

export async function updateLoadItemProgress(id, updates) {
  const { data, error } = await supabase
    .from('load_item_progress')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// Advancing current_stop_index / marking loading_complete now happens inline inside
// driverConfirmOrderLoaded (see its own comment) — no standalone advanceStopIndex/
// markLoadingComplete left here to avoid a second, bypassable path to the same writes.

export async function updateAllocationChecklist(allocationId, updates) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update(updates)
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}

export async function startJourney(allocationId, routePlan) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({
      status: 'in_transit',
      journey_started_at: new Date().toISOString(),
      route_plan: routePlan,
      delivery_stop_index: 0,
    })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}

export async function markArrived(orderId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ arrived_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}

export async function startUnloading(orderId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ unloading_started_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}

export async function completeDelivery(orderId, lat, lng) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ delivered_at: new Date().toISOString(), delivery_lat: lat, delivery_lng: lng })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}

export async function advanceDeliveryStop(allocationId, newStopIndex) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({ delivery_stop_index: newStopIndex })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}

export async function startReturnToBase(allocationId) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({ status: 'returning_to_base', returning_to_base_at: new Date().toISOString() })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}

export async function submitJourneyComplete(allocationId) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({ status: 'pending_journey_approval', journey_complete_submitted_at: new Date().toISOString() })
    .eq('id', allocationId)
    .select()
    .single()
  if (error) return { data, error }
  await createNotification({
    target_roles: ['r1'],
    title: 'Journey Complete — Approval Needed',
    body: `Allocation ${allocationId} — driver submitted Journey Complete checklist`,
    type: 'journey_complete_submitted',
    ref_id: allocationId,
  })
  return { data, error }
}

export async function fetchPendingJourneyApprovals() {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .select('*, vehicle:vehicles(id, vehicle_number), warehouse:warehouses(id, name), driver:members!vehicle_allocations_driver_id_fkey(id, name)')
    .eq('status', 'pending_journey_approval')
    .order('journey_complete_submitted_at', { ascending: true })
  return { data, error }
}

export async function fetchApprovedJourneys() {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .select('*, vehicle:vehicles(id, vehicle_number), warehouse:warehouses(id, name), driver:members!vehicle_allocations_driver_id_fkey(id, name)')
    .not('journey_complete_approved_at', 'is', null)
    .order('journey_complete_approved_at', { ascending: false })
  return { data, error }
}

export async function fetchDriverCompletedJourneys(driverId) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .select('*, vehicle:vehicles(id, vehicle_number), warehouse:warehouses(id, name), driver:members!vehicle_allocations_driver_id_fkey(id, name)')
    .eq('driver_id', driverId)
    .eq('status', 'completed')
    .order('journey_complete_approved_at', { ascending: false })
  return { data, error }
}

export async function approveJourneyComplete(allocationId, approvedBy, remarks) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({
      status: 'completed',
      journey_complete_approved_at: new Date().toISOString(),
      journey_complete_approved_by: approvedBy,
      journey_complete_approval_remarks: remarks || null,
    })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}
export async function fetchDriverAllocations(driverId) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .select('*, vehicle:vehicles(id, vehicle_number), warehouse:warehouses(id, name, latitude, longitude)')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
  return { data, error }
}
export async function driverConfirmParked(allocationId) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({ status: 'vehicle_parked', vehicle_parked_at: new Date().toISOString() })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}

export async function fetchParkedAllocations() {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .select('*, vehicle:vehicles(id, vehicle_number), warehouse:warehouses(id, name), driver:members!vehicle_allocations_driver_id_fkey(id, name)')
    .eq('status', 'vehicle_parked')
    .order('vehicle_parked_at', { ascending: true })
  return { data, error }
}
export async function fetchInProgressAllocations() {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .select('*, vehicle:vehicles(id, vehicle_number), warehouse:warehouses(id, name, latitude, longitude), driver:members!vehicle_allocations_driver_id_fkey(id, name)')
    .eq('status', 'loading_in_progress')
    .order('loading_started_at', { ascending: true })
  if (error || !data?.length) return { data, error }

  // Self-heal: driverConfirmOrderLoaded is now the only place that advances/completes an
  // allocation, but one stuck 'loading_in_progress' from before that fix (every order already
  // driver_confirmed, nothing left to ever re-check it) would otherwise sit here forever — this
  // backfills it on load instead of requiring a manual DB fix.
  const results = await Promise.all(data.map(async a => {
    const { data: orders } = await supabase.from('distributor_orders').select('loading_stage').eq('allocation_id', a.id)
    const allConfirmed = (orders || []).length > 0 && orders.every(o => o.loading_stage === 'driver_confirmed')
    if (!allConfirmed) return a
    await supabase.from('vehicle_allocations').update({ status: 'loading_complete', loading_completed_at: new Date().toISOString() }).eq('id', a.id)
    return null
  }))
  return { data: results.filter(Boolean), error: null }
}


export async function driverAcceptLoad(allocationId, updates) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({ status: 'driver_accepted', driver_accepted_at: new Date().toISOString(), ...updates })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}
export async function fetchAllocations() {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .select('*, vehicle:vehicles(id, vehicle_number, weight_capacity, volume_capacity), warehouse:warehouses(id, name, latitude, longitude), driver:members!vehicle_allocations_driver_id_fkey(id, name)')
    .order('created_at', { ascending: false })
  return { data, error }
}



export async function startLoad(allocationId, supervisorName, labourerNames, stopSequence) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({
      status: 'loading_in_progress',
      load_supervisor_name: supervisorName,
      labourer_names: labourerNames,
      loading_started_at: new Date().toISOString(),
      stop_sequence: stopSequence,
      current_stop_index: 0,
    })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}

export async function fetchAllocationOrders(allocationId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .select('*, distributor:distributors(id, name, area, town, confirmed_latitude, confirmed_longitude), items:distributor_order_items(*)')
    .eq('allocation_id', allocationId)
  return { data, error }
}
    export async function fetchDrivers() {
  const { data, error } = await supabase
    .from('users')
    .select('member_id, name, member:members(id, name)')
    .eq('role_id', 'r7')
  return { data, error }
}

export async function fetchDriversWithLockStatus() {
  const { data: drivers, error } = await fetchDrivers()
  if (error) return { data: null, error }
  const { data: activeAllocs, error: allocError } = await supabase
    .from('vehicle_allocations')
    .select('driver_id')
    .neq('status', 'completed')
  if (allocError) return { data: null, error: allocError }
  const lockedIds = new Set((activeAllocs || []).map(a => a.driver_id))
  return { data: (drivers || []).map(d => ({ ...d, locked: lockedIds.has(d.member_id) })), error: null }
}

export async function deallocateVehicle(allocationId) {
  const { error: orderError } = await supabase
    .from('distributor_orders')
    .update({ allocation_id: null })
    .eq('allocation_id', allocationId)
  if (orderError) return { error: orderError }
  const { error } = await supabase.from('vehicle_allocations').delete().eq('id', allocationId)
  return { error }
}

// ─── DISTRIBUTORS (formerly CUSTOMERS) ────────────────────────────────────────

export async function fetchDistributors() {
  const { data, error } = await supabase
    .from('distributors')
    .select('*, assignments:distributor_assignments(member_id)')
    .order('name')
  return { data, error }
}

export async function createDistributor(payload, memberIds = []) {
  const { data, error } = await supabase.from('distributors').insert(payload).select().single()
  if (error || !memberIds.length) return { data, error }
  await supabase.from('distributor_assignments').insert(memberIds.map(mid => ({ distributor_id: data.id, member_id: mid })))
  return { data, error }
}

export async function updateDistributor(id, payload, memberIds = []) {
  const { data, error } = await supabase.from('distributors').update(payload).eq('id', id).select().single()
  if (error) return { data, error }
  await supabase.from('distributor_assignments').delete().eq('distributor_id', id)
  if (memberIds.length) await supabase.from('distributor_assignments').insert(memberIds.map(mid => ({ distributor_id: id, member_id: mid })))
  return { data, error }
}

export async function deleteDistributor(id) {
  await supabase.from('distributor_assignments').delete().eq('distributor_id', id)
  const { error } = await supabase.from('distributors').delete().eq('id', id)
  return { error }
}

// ─── PARAMETERS (monthly — one row per member per period, e.g. "2026-11") ──────

export async function fetchParameters(period) {
  const { data, error } = await supabase.from('parameters').select('*').eq('period', period)
  return { data, error }
}

export async function upsertParameter(memberId, period, payload) {
  const { data, error } = await supabase
    .from('parameters')
    .upsert({ member_id: memberId, period, ...payload }, { onConflict: 'member_id,period' })
    .select()
    .single()
  return { data, error }
}

// ─── GOALS (monthly — one row per member per period) ───────────────────────────

export async function fetchGoals(period) {
  const { data, error } = await supabase.from('goals').select('*').eq('period', period)
  return { data, error }
}

export async function upsertGoal(memberId, period, payload) {
  const { data, error } = await supabase
    .from('goals')
    .upsert({ member_id: memberId, period, ...payload }, { onConflict: 'member_id,period' })
    .select()
    .single()
  return { data, error }
}

// Admin-only: wipes a member's goal for a given period back to a fresh draft (every value/status
// zeroed, not deleted) so they must set and resubmit goals for that month again.
export async function resetGoal(memberId, period) {
  const { data, error } = await supabase
    .from('goals')
    .upsert({
      member_id: memberId, period,
      value_goal: 0, value_status: null, value_note: null,
      customers: {}, products: {}, categories: {},
      visits_goal: 0, visits_status: null, visits_note: null,
      acq_goal: 0, acq_status: null, acq_note: null,
      status: 'draft', submitted_at: null, reviewed_at: null,
    }, { onConflict: 'member_id,period' })
    .select()
    .single()
  return { data, error }
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────

export async function fetchInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, lines:invoice_lines(*, product:products(id, name, unit, category_id))')
    .order('date', { ascending: false })
  return { data, error }
}

export async function createInvoice(header, lines) {
  const { data: inv, error } = await supabase.from('invoices').insert(header).select().single()
  if (error) return { data: null, error }
  const lineRows = lines.map(l => ({ invoice_id: inv.id, product_id: l.product_id, qty: l.qty, rate: l.rate }))
  const { error: lineError } = await supabase.from('invoice_lines').insert(lineRows)
  return { data: inv, error: lineError }
}

export async function updateInvoice(id, header, lines) {
  const { data: inv, error } = await supabase.from('invoices').update(header).eq('id', id).select().single()
  if (error) return { data: null, error }
  await supabase.from('invoice_lines').delete().eq('invoice_id', id)
  const lineRows = lines.map(l => ({ invoice_id: id, product_id: l.product_id, qty: l.qty, rate: l.rate }))
  const { error: lineError } = await supabase.from('invoice_lines').insert(lineRows)
  return { data: inv, error: lineError }
}

export async function deleteInvoice(id) {
  await supabase.from('invoice_lines').delete().eq('invoice_id', id)
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  return { error }
}
export async function fetchOrdersAwaitingInvoice() {
  const { data, error } = await supabase
    .from('distributor_orders')
    .select('*, distributor:distributors(id, name, area, town), member:members!distributor_orders_member_id_fkey(id, name), items:distributor_order_items(*), allocation:vehicle_allocations(id, status, vehicle:vehicles(id, vehicle_number))')
    .not('allocation_id', 'is', null)
  if (error) return { data: null, error }
  const awaiting = (data || []).filter(o => o.allocation?.status === 'loading_complete')
  // exclude orders that already have an invoice
  const { data: existingInvoices } = await supabase.from('invoices').select('order_id').not('order_id', 'is', null)
  const invoicedOrderIds = new Set((existingInvoices || []).map(i => i.order_id))
  return { data: awaiting.filter(o => !invoicedOrderIds.has(o.id)), error: null }
}

export async function createInvoiceFromLoad(header, lines) {
  const { data: inv, error } = await supabase.from('invoices').insert(header).select().single()
  if (error) return { data: null, error }
  const lineRows = lines.map(l => ({ invoice_id: inv.id, product_id: l.product_id, qty: l.qty, rate: l.rate }))
  const { error: lineError } = await supabase.from('invoice_lines').insert(lineRows)
  return { data: inv, error: lineError }
}

export async function fetchPendingInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, lines:invoice_lines(*, product:products(id, name, unit, category_id)), member:members!invoices_created_by_fkey(id, name)')
    .eq('status', 'pending_approval')
    .order('date', { ascending: false })
  return { data, error }
}

export async function approveInvoice(invoiceId, approvedBy) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .select()
    .single()
  return { data, error }
}

export async function fetchInvoiceForOrder(orderId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, lines:invoice_lines(*, product:products(id, name, unit, category_id))')
    .eq('order_id', orderId)
    .maybeSingle()
  return { data, error }
}

// erp_invoice_number/erp_date/erp_amount added for OrderStatus.jsx's history table — the ERP-side
// figures, entered by whoever creates the invoice (AwaitingInvoiceTile.jsx), distinct from this
// app's own invoice id/date and from the order's own computed Value (qty × rate at whatever qty the
// order currently carries) that OrderStatus.jsx already showed. AllocationJourneyTile.jsx's own
// caller only reads order_id/id/status, so the extra columns are unused weight there, not a
// behavior change.
export async function fetchInvoicesForOrders(orderIds) {
  if (!orderIds?.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('invoices')
    .select('order_id, id, status, date, erp_invoice_number, erp_date, erp_amount')
    .in('order_id', orderIds)
  return { data, error }
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export async function createNotification({ target_roles, title, body, type, ref_id }) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ target_roles, title, body, type, ref_id })
    .select()
    .single()
  return { data, error }
}

export async function fetchNotifications(roleId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .contains('target_roles', JSON.stringify([roleId]))
    .order('created_at', { ascending: false })
    .limit(30)
  return { data, error }
}

export async function markNotificationRead(id) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ─── VEHICLE LOCATIONS (LIVE TRACKING) ─────────────────────────────────────────

export async function recordVehicleLocation(allocationId, lat, lng) {
  const { data, error } = await supabase
    .from('vehicle_locations')
    .insert({ allocation_id: allocationId, lat, lng })
    .select()
    .single()
  return { data, error }
}

export async function fetchInTransitAllocations() {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .select('*, vehicle:vehicles(id, vehicle_number), warehouse:warehouses(id, name, latitude, longitude), driver:members!vehicle_allocations_driver_id_fkey(id, name)')
    .eq('status', 'in_transit')
    .order('journey_started_at', { ascending: true })
  return { data, error }
}

export async function fetchLatestVehicleLocation(allocationId) {
  const { data, error } = await supabase
    .from('vehicle_locations')
    .select('*')
    .eq('allocation_id', allocationId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { data, error }
}

export function subscribeVehicleLocations(onInsert) {
  const channel = supabase
    .channel('vehicle-locations-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_locations' }, payload => onInsert(payload.new))
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ─── DISTRIBUTOR CELEBRATIONS (org-wide broadcast on new Distributor creation) ─────────────────
// Deliberately its own table/channel rather than the `notifications` table — that table's live
// schema doesn't match what createNotification/fetchNotifications assume (see CLAUDE.md), so every
// existing call site there has been silently failing. name/avatar/color are denormalized onto the
// row at write time since the celebrating member may not be in every receiving client's own scoped
// data, and this is a fire-once broadcast row, not something that needs to stay in sync later.

export async function createDistributorCelebration({ distributor_id, distributor_name, member_id, member_name, avatar, color }) {
  const { data, error } = await supabase
    .from('distributor_celebrations')
    .insert({ distributor_id, distributor_name, member_id, member_name, avatar, color })
    .select()
    .single()
  return { data, error }
}

export function subscribeDistributorCelebrations(onInsert) {
  const channel = supabase
    .channel('distributor-celebrations-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'distributor_celebrations' }, payload => onInsert(payload.new))
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Catch-up path for whoever wasn't logged in at the moment a celebration fired live (the Realtime
// subscription above only reaches sessions already open at that instant). Called once per login
// with the user's own last-seen watermark — see CelebrationOverlay.jsx.
export async function fetchDistributorCelebrationsSince(sinceISO) {
  const { data, error } = await supabase
    .from('distributor_celebrations')
    .select('*')
    .gt('created_at', sinceISO)
    .order('created_at', { ascending: true })
  return { data, error }
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

export async function fetchExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, member:members(id, name, avatar, color)')
    .order('date', { ascending: false })
  return { data, error }
}

export async function createExpense(payload) {
  const { data, error } = await supabase.from('expenses').insert(payload).select().single()
  return { data, error }
}

export async function updateExpense(id, payload) {
  const { data, error } = await supabase.from('expenses').update(payload).eq('id', id).select().single()
  return { data, error }
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  return { error }
}

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────

export async function fetchAttendance(month, year) {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('month', month)
    .eq('year', year)
  return { data, error }
}

export async function upsertAttendance(payload) {
  const { data, error } = await supabase
    .from('attendance')
    .upsert(payload, { onConflict: 'member_id,date' })
    .select()
  return { data, error }
}

// ─── ATTENDANCE PUNCH-IN ────────────────────────────────────────────────────

// Local calendar date, NOT toISOString()'s UTC date — for IST (UTC+5:30), any punch between
// 12:00 AM and 5:29 AM local time would otherwise land on the previous day's date column.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function fetchTodayPunch(userId) {
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('*')
    .eq('user_id', userId)
    .eq('date', todayStr())
    .maybeSingle()
  return { data, error }
}

export async function punchIn(userId, { lat, lng, distanceM, locationFlag, flagReason, dutyStatus, minutesLate, ruleType, ruleId }) {
  const { data, error } = await supabase
    .from('attendance_punches')
    .insert({
      user_id: userId, date: todayStr(), lat, lng,
      distance_from_hq_m: distanceM, location_flag: locationFlag, flag_reason: flagReason || null,
      duty_status: dutyStatus || null, minutes_late: minutesLate || 0,
      // Two-stage approval: punching in no longer auto-marks Present. HR must approve the
      // punch-in itself (stage 1) AND the day's activity (stage 2) before it counts as Present.
      punch_approval_status: 'pending',
      activity_approval_status: 'pending',
      status: 'present',
      // Late Present / Half Day rule classification (independent of the two-stage approval above)
      // — only set when an Admin-approved rule actually covers this user and their arrival broke
      // its threshold; otherwise both stay null/'not_applicable', unchanged from today's behavior.
      rule_status: ruleType || null,
      rule_id: ruleId || null,
      rule_waiver_status: ruleType ? 'pending' : 'not_applicable',
    })
    .select()
    .single()

  // unique(user_id, date) — a double-tap or duplicate tab landed here after someone already
  // punched in today; treat it as success and hand back the existing row instead of erroring.
  if (error?.code === '23505') return await fetchTodayPunch(userId)

  if (!error && locationFlag) {
    await createNotification({
      target_roles: ['r4'],
      title: 'Attendance Location Flagged',
      body: `${data?.date} — punch-in needs review (${flagReason || 'location deviation'})`,
      type: 'attendance_flagged',
      ref_id: String(data?.id),
    })
  }
  return { data, error }
}

export async function fetchMyAttendance(userId, month, year) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('*')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
    .order('date')
  return { data, error }
}

export async function fetchAllAttendanceForMonth(month, year) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('*, user:users!attendance_punches_user_id_fkey(id, name, avatar, color, role_id, manager_id), rule:attendance_rules(*)')
    .gte('date', from)
    .lte('date', to)
    .order('date')
  return { data, error }
}

// Stage 1 — HR reviews and approves the punch-in itself (location/timing) for every employee,
// not just flagged ones.
export async function fetchPendingPunchApprovals() {
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('*, user:users!attendance_punches_user_id_fkey(id, name, avatar, color, role_id, manager_id), rule:attendance_rules(*)')
    .eq('punch_approval_status', 'pending')
    .order('date', { ascending: false })
  return { data, error }
}

export async function approvePunchStage1(id, approvedBy) {
  const { data, error } = await supabase
    .from('attendance_punches')
    .update({ punch_approval_status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// Stage 2 — only actionable once stage 1 is approved: HR reviews the employee's activity for
// that day and approves it. Only after both stages are approved does the day count as Present.
export async function fetchPendingActivityApprovals() {
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('*, user:users!attendance_punches_user_id_fkey(id, name, avatar, color, role_id, manager_id), rule:attendance_rules(*)')
    .eq('punch_approval_status', 'approved')
    .eq('activity_approval_status', 'pending')
    .order('date', { ascending: false })
  return { data, error }
}

export async function approveActivityStage2(id, approvedBy) {
  const { data, error } = await supabase
    .from('attendance_punches')
    .update({ activity_approval_status: 'approved', activity_approved_by: approvedBy, activity_approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ─── ATTENDANCE RULES (Late Present / Half Day) ────────────────────────────────
// HR authors a rule (role + selected users + grace-period minutes + who reviews exceptions);
// Admin approves the rule once before it's live. Each punch that then crosses an approved rule's
// threshold gets its own independent, up-to-2-stage waiver approval (rule_waiver_status) — entirely
// separate from the existing punch_approval_status/activity_approval_status columns above, which
// keep meaning exactly what they always have.

// A rule is a pure setting (role/type/threshold/approver chain) — WHO it applies to is a separate
// mapping (attendance_rule_users), embedded here as `mapped` so both the mapping-editor UI and
// resolveRuleClassification (attendanceRules.js) get everything from this one fetch.
export async function fetchAttendanceRules() {
  // attendance_rule_users has two FKs to users (user_id, added_by) — PostgREST can't disambiguate
  // an embed without naming the constraint (Recurring Bug Pattern #3, this app's own documented
  // gotcha; caught live via the exact "more than one relationship was found" error it always
  // produces).
  const { data, error } = await supabase
    .from('attendance_rules')
    .select('*, role:roles(id, name), mapped:attendance_rule_users(user_id, user:users!attendance_rule_users_user_id_fkey(id, name, avatar, color))')
    .order('created_at', { ascending: false })
  return { data, error }
}

// Late Present/Half Day rules pass threshold_minutes + approver1_role (approver2_role auto-
// derived). Punch Deviation/Early Punch rules pass threshold_meters or threshold_minutes + action
// instead — no approver chain, since there's no waiver-approval workflow for a real-time gate.
export async function createAttendanceRule(payload) {
  const { data, error } = await supabase
    .from('attendance_rules')
    .insert({
      rule_type: payload.rule_type,
      name: payload.name || null,
      role_id: payload.role_id,
      threshold_minutes: payload.threshold_minutes ?? null,
      threshold_meters: payload.threshold_meters ?? null,
      action: payload.action ?? null,
      approver1_role: payload.approver1_role ?? null,
      approver2_role: payload.approver1_role ? deriveApprover2Role(payload.approver1_role) : null,
      status: 'pending',
      created_by: payload.created_by,
    })
    .select()
    .single()
  return { data, error }
}

export async function approveAttendanceRule(id, approvedBy) {
  const { data, error } = await supabase
    .from('attendance_rules')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// Mapping — decoupled from the rule setting itself, editable any time once the setting is
// approved, no further Admin sign-off needed for mapping changes.
export async function addRuleUser(ruleId, userId, addedBy) {
  const { data, error } = await supabase
    .from('attendance_rule_users')
    .insert({ rule_id: ruleId, user_id: userId, added_by: addedBy })
    .select()
    .single()
  // unique(rule_id, user_id) — already mapped, treat as success (same defensive pattern as punchIn).
  if (error?.code === '23505') return { data: null, error: null }
  return { data, error }
}

export async function removeRuleUser(ruleId, userId) {
  const { error } = await supabase
    .from('attendance_rule_users')
    .delete()
    .eq('rule_id', ruleId)
    .eq('user_id', userId)
  return { error }
}

export async function fetchAttendanceRuleSettings() {
  const { data, error } = await supabase
    .from('attendance_rule_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  return { data, error }
}

export async function upsertAttendanceRuleSettings(payload, updatedBy) {
  const { data, error } = await supabase
    .from('attendance_rule_settings')
    .upsert({ id: 1, ...payload, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single()
  return { data, error }
}

// Waiver queue — instances that crossed an approved rule and aren't fully waived yet. HR/Admin use
// this unfiltered; Manager's view filters client-side to user.manager_id === currentUser.id (same
// fetch-broad-scope-client-side convention as the rest of this app).
export async function fetchPendingWaiverApprovals() {
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('*, user:users!attendance_punches_user_id_fkey(id, name, avatar, color, role_id, manager_id), rule:attendance_rules(*)')
    .not('rule_status', 'is', null)
    .in('rule_waiver_status', ['pending', 'stage1_approved'])
    .order('date', { ascending: false })
  return { data, error }
}

function monthBoundsStrings() {
  const d = new Date()
  const y = d.getFullYear(), m = d.getMonth() + 1
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// How many waivers has this approver role already granted this employee this month? Manager count
// = stage-1 waivers on rules where approver1_role='manager'. HR count = either a direct single-stage
// approval (approver1_role='hr') or a stage-2 sign-off (rule_approver2_by set) — HR is "involved"
// either way. Fetch-broad-filter-client-side, matching this app's established pattern.
async function countMonthlyWaivers(userId, approverRole) {
  const { from, to } = monthBoundsStrings()
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('id, rule_approver1_by, rule_approver2_by, rule:attendance_rules(approver1_role)')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
  if (error) return 0
  return (data || []).filter(p => {
    if (approverRole === 'manager') return !!p.rule_approver1_by && p.rule?.approver1_role === 'manager'
    return (p.rule?.approver1_role === 'hr' && !!p.rule_approver1_by) || !!p.rule_approver2_by
  }).length
}

export async function approveWaiverStage1(punchId, approverUserId, approverRole) {
  const { data: settings } = await fetchAttendanceRuleSettings()
  const { data: punch } = await supabase.from('attendance_punches').select('*, rule:attendance_rules(*)').eq('id', punchId).single()
  if (!punch) return { data: null, error: { message: 'Punch not found' } }

  const cap = approverRole === 'manager' ? settings?.max_waivers_manager : settings?.max_waivers_hr
  if (cap != null) {
    const used = await countMonthlyWaivers(punch.user_id, approverRole)
    if (used >= cap) {
      return { data: null, error: { message: `${approverRole === 'manager' ? 'Manager' : 'HR'} waiver limit (${cap}/month) already reached for this employee.` } }
    }
  }

  const goesStraightToApproved = !punch.rule?.approver2_role
  const { data, error } = await supabase
    .from('attendance_punches')
    .update({
      rule_waiver_status: goesStraightToApproved ? 'approved' : 'stage1_approved',
      rule_approver1_by: approverUserId,
      rule_approver1_at: new Date().toISOString(),
    })
    .eq('id', punchId)
    .select()
    .single()
  if (!error) await logActivity(approverUserId, 'approve', 'attendance_rule', `Waived ${punch.rule_status === 'half_day' ? 'Half Day' : 'Late Present'} for ${punch.date}`, punchId)
  return { data, error }
}

export async function approveWaiverStage2(punchId, approverUserId) {
  const { data: settings } = await fetchAttendanceRuleSettings()
  const { data: punch } = await supabase.from('attendance_punches').select('*, rule:attendance_rules(*)').eq('id', punchId).single()
  if (!punch) return { data: null, error: { message: 'Punch not found' } }

  const cap = settings?.max_waivers_hr
  if (cap != null) {
    const used = await countMonthlyWaivers(punch.user_id, 'hr')
    if (used >= cap) {
      return { data: null, error: { message: `HR waiver limit (${cap}/month) already reached for this employee.` } }
    }
  }

  const { data, error } = await supabase
    .from('attendance_punches')
    .update({
      rule_waiver_status: 'approved',
      rule_approver2_by: approverUserId,
      rule_approver2_at: new Date().toISOString(),
    })
    .eq('id', punchId)
    .select()
    .single()
  if (!error) await logActivity(approverUserId, 'approve', 'attendance_rule', `Waived ${punch.rule_status === 'half_day' ? 'Half Day' : 'Late Present'} (stage 2) for ${punch.date}`, punchId)
  return { data, error }
}

// Admin oversight — waiver counts within an arbitrary date range (browsable by month, not just
// "this month"), returned two ways: per employee (Manager vs HR count each received) and per
// approver (which specific person granted how many, and to whom). Both use the exact same counting
// rule the cap enforcement itself uses (countMonthlyWaivers, above) — a Manager-granted waiver is
// any row where rule_approver1_by is set and that rule's approver1_role='manager'; an HR-granted
// one is either a direct single-stage approval (approver1_role='hr') or a stage-2 sign-off
// (rule_approver2_by set). attendance_punches has multiple FKs to users (user_id, approved_by,
// activity_approved_by, rule_approver1_by, rule_approver2_by) — each embed below names its
// constraint explicitly, same Recurring Bug Pattern #3 workaround used everywhere else this
// session.
export async function fetchWaiverCountsForPeriod(fromDate, toDate) {
  const { data, error } = await supabase
    .from('attendance_punches')
    .select(`
      user_id, rule_approver1_by, rule_approver2_by,
      user:users!attendance_punches_user_id_fkey(id, name),
      approver1:users!attendance_punches_rule_approver1_by_fkey(id, name),
      approver2:users!attendance_punches_rule_approver2_by_fkey(id, name),
      rule:attendance_rules(approver1_role)
    `)
    .gte('date', fromDate)
    .lte('date', toDate)
    .not('rule_status', 'is', null)
  if (error) return { data: null, error }

  const byEmployee = {}
  const byApprover = {}
  const bumpApprover = (id, name, employeeName) => {
    if (!id) return
    if (!byApprover[id]) byApprover[id] = { approverId: id, name: name || `User #${id}`, count: 0, employees: [] }
    byApprover[id].count++
    byApprover[id].employees.push(employeeName)
  }

  ;(data || []).forEach(p => {
    const uid = p.user_id
    const employeeName = p.user?.name || `User #${uid}`
    if (!byEmployee[uid]) byEmployee[uid] = { userId: uid, name: employeeName, managerWaivers: 0, hrWaivers: 0 }

    const managerGranted = p.rule_approver1_by && p.rule?.approver1_role === 'manager'
    const hrGrantedStage1 = p.rule?.approver1_role === 'hr' && p.rule_approver1_by
    const hrGrantedStage2 = !!p.rule_approver2_by

    if (managerGranted) {
      byEmployee[uid].managerWaivers++
      bumpApprover(p.rule_approver1_by, p.approver1?.name, employeeName)
    }
    if (hrGrantedStage1) {
      byEmployee[uid].hrWaivers++
      bumpApprover(p.rule_approver1_by, p.approver1?.name, employeeName)
    }
    if (hrGrantedStage2) {
      byEmployee[uid].hrWaivers++
      bumpApprover(p.rule_approver2_by, p.approver2?.name, employeeName)
    }
  })

  const byEmployeeRows = Object.values(byEmployee)
    .filter(r => r.managerWaivers > 0 || r.hrWaivers > 0)
    .sort((a, b) => (b.managerWaivers + b.hrWaivers) - (a.managerWaivers + a.hrWaivers))
  const byApproverRows = Object.values(byApprover).sort((a, b) => b.count - a.count)

  return { data: { byEmployee: byEmployeeRows, byApprover: byApproverRows }, error: null }
}

// ─── ACTIVITY LOG (generic, feeds Attendance Stage 2's non-driver vein diagram) ────────────────
// user_id is explicitly users.id (matches currentUser.id) — NOT members.id. Several existing
// `approved_by`-style columns in this app inconsistently store one or the other (see CLAUDE.md);
// users.id is right here because it's always available regardless of whether the actor has a
// members row, and it matches attendance_punches.user_id itself, the table this feeds into.
// `date` mirrors attendance_punches' own local-calendar-date column (todayStr(), just above) so
// fetching by day is a plain equality check, not timezone-sensitive range math on `occurred_at`.

export async function logActivity(userId, action, entity, label, entityId) {
  // Soft-fail, non-blocking by design — called AFTER the real write already succeeded. A logging
  // failure must never surface to the user or read as if the actual action failed.
  try {
    const { error } = await supabase
      .from('activity_log')
      .insert({ user_id: userId, date: todayStr(), action, entity, label, entity_id: entityId != null ? String(entityId) : null })
    if (error) console.error('logActivity failed:', error)
  } catch (e) {
    console.error('logActivity failed:', e)
  }
}

export async function fetchActivityLog(userId, date) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('occurred_at', { ascending: true })
  return { data, error }
}

// ─── SALARY ───────────────────────────────────────────────────────────────────

export async function fetchSalaries() {
  const { data, error } = await supabase
    .from('salaries')
    .select('*, member:members(id, name, avatar, color)')
    .order('member_id')
  return { data, error }
}

export async function upsertSalary(memberId, payload) {
  const { data, error } = await supabase
    .from('salaries')
    .upsert({ member_id: memberId, ...payload }, { onConflict: 'member_id' })
    .select()
    .single()
  return { data, error }
}
// ─── DISTRIBUTOR VISITS (New Customer Visit flow) ─────────────────────────────

export async function fetchVisits(memberId = null) {
  let query = supabase
    .from('distributor_visits')
    .select('*, distributor:distributors(id, name, area, type, lead_stage)')
    .order('visit_date', { ascending: false })
  if (memberId) query = query.eq('member_id', memberId)
  const { data, error } = await query
  return { data, error }
}

export async function createVisit(payload) {
  const { data, error } = await supabase.from('distributor_visits').insert(payload).select().single()
  return { data, error }
}
export async function updateDistributorLeadStage(id, updates) {
  const payload = updates.lead_stage ? { ...updates, stage_updated_at: new Date().toISOString() } : updates
  const { data, error } = await supabase.from('distributors').update(payload).eq('id', id).select().single()
  return { data, error }
}


export async function fetchDueFollowups() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('distributors')
    .select('*')
    .eq('lead_stage', 'interested')
    .lte('next_followup_date', today)
    .order('name')
  return { data, error }
}
// ─── DISTRIBUTOR REGISTRATIONS (Phase 3 — post-Final approval flow) ───────────

export async function createRegistration(payload) {
  // payload: { distributor_id, member_id }
  const { data, error } = await supabase.from('distributor_registrations').insert(payload).select().single()
  return { data, error }
}

export async function fetchRegistrations() {
  const { data, error } = await supabase
    .from('distributor_registrations')
    .select('*, distributor:distributors(id, name, area, lead_stage), member:members(id, name)')
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function updateRegistration(id, updates) {
  const { data, error } = await supabase
    .from('distributor_registrations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}
// ─── DISTRIBUTOR PAYMENTS ──────────────────────────────────────────────────────

export async function createPayment(payload) {
  const { data, error } = await supabase.from('distributor_payments').insert(payload).select().single()
  return { data, error }
}

export async function fetchPayments() {
  const { data, error } = await supabase
    .from('distributor_payments')
    .select('*, distributor:distributors(id, name), member:members(id, name)')
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function verifyPayment(id) {
  const { data, error } = await supabase
    .from('distributor_payments')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}
export async function updatePayment(id, updates) {
  const { data, error } = await supabase.from('distributor_payments').update(updates).eq('id', id).select().single()
  return { data, error }
}
// ─── DISTRIBUTOR ORDERS (Distributor Order flow) ──────────────────────────────

export async function createDistributorOrder(header, items) {
  const { data: order, error } = await supabase.from('distributor_orders').insert(header).select().single()
  if (error) return { data: null, error }
  const itemRows = items.map(it => ({
    order_id: order.id, product_id: it.product_id, category_id: it.category_id,
    rate: it.rate, weight: it.weight, volume: it.volume,
    order_qty: it.order_qty, approved_qty: it.order_qty, final_qty: it.order_qty,
  }))
  const { error: itemError } = await supabase.from('distributor_order_items').insert(itemRows)
  return { data: order, error: itemError }
}

export async function fetchDistributorOrders() {
  const { data, error } = await supabase
    .from('distributor_orders')
    .select('*, distributor:distributors(id, name, area, town, payment_mode), member:members!distributor_orders_member_id_fkey(id, name), manager:members!distributor_orders_manager_id_fkey(id, name), items:distributor_order_items(*)')
    .order('order_date', { ascending: false })
  return { data, error }
}
export async function updateOrderStatus(id, updates) {
  const { data, error } = await supabase.from('distributor_orders').update(updates).eq('id', id).select().single()
  return { data, error }
}
export async function markSubmittedForPicking(orderId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ status: 'submitted_for_picking', submitted_for_picking_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}
export async function updateOrderItemQty(itemId, field, value) {
  // field is 'approved_qty' (Manager) or 'final_qty' (Admin)
  const { data, error } = await supabase
    .from('distributor_order_items')
    .update({ [field]: value })
    .eq('id', itemId)
    .select()
    .single()
  return { data, error }
}
export async function updateDistributorOrder(orderId, items) {
  await supabase.from('distributor_order_items').delete().eq('order_id', orderId)
  const itemRows = items.map(it => ({
    order_id: orderId, product_id: it.product_id, category_id: it.category_id,
    rate: it.rate, weight: it.weight, volume: it.volume,
    order_qty: it.order_qty, approved_qty: it.order_qty, final_qty: it.order_qty,
  }))
  const { error } = await supabase.from('distributor_order_items').insert(itemRows)
  return { error }
}

export async function updateOrderPayment(id, updates) {
  const { data, error } = await supabase.from('distributor_order_payments').update(updates).eq('id', id).select().single()
  return { data, error }
}

// ─── DISTRIBUTOR ORDER PAYMENTS ────────────────────────────────────────────────

export async function createOrderPayment(payload) {
  const { data, error } = await supabase.from('distributor_order_payments').insert(payload).select().single()
  return { data, error }
}

export async function fetchOrderPayments() {
  const { data, error } = await supabase
    .from('distributor_order_payments')
    .select('*, distributor:distributors(id, name), member:members(id, name)')
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function verifyOrderPayment(id) {
  const { data, error } = await supabase
    .from('distributor_order_payments')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}
// ─── PICKING (Warehouse Manager flow) ──────────────────────────────────────────

export async function fetchPickingOrders() {
  const { data, error } = await supabase
    .from('distributor_orders')
    .select('*, distributor:distributors(id, name, area, town), member:members!distributor_orders_member_id_fkey(id, name), items:distributor_order_items(*)')
    .eq('status', 'submitted_for_picking')
    .order('order_date', { ascending: false })
  return { data, error }
}

export async function fetchAllOrdersWithItems() {
  const { data, error } = await supabase
    .from('distributor_orders')
    .select('*, distributor:distributors(id, name, area, town), member:members!distributor_orders_member_id_fkey(id, name), items:distributor_order_items(*), allocation:vehicle_allocations(id, status, journey_started_at, journey_completed_at, route_plan, delivery_stop_index, vehicle:vehicles(id, vehicle_number), driver:members!vehicle_allocations_driver_id_fkey(id, name))')
    .order('order_date', { ascending: false })
  return { data, error }
}

export async function updateItemAvailability(itemId, availability, waitDays = null) {
  const { data, error } = await supabase
    .from('distributor_order_items')
    .update({ availability, wait_days: availability === 'Wait' ? waitDays : null })
    .eq('id', itemId)
    .select()
    .single()
  return { data, error }
}
export async function updateOrderItemQtyAndReset(itemId, qty) {
  const { data, error } = await supabase
    .from('distributor_order_items')
    .update({ final_qty: qty, order_qty: qty, availability: null, wait_days: null })
    .eq('id', itemId)
    .select()
    .single()
  return { data, error }
}

export async function submitPicking(orderId, hasWaitItems) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({
      picking_status: hasWaitItems ? 'picking_done' : 'ready_for_load',
      picking_updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}

export async function createLoad(orderId) {
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`
  const { count } = await supabase
    .from('distributor_orders')
    .select('id', { count: 'exact', head: true })
    .not('load_id', 'is', null)
    .like('load_id', `LD-${dateStr}-%`)
  const seq = String((count || 0) + 1).padStart(2, '0')
  const loadId = `LD-${dateStr}-${seq}`
   const { data, error } = await supabase
    .from('distributor_orders')
    .update({ load_id: loadId, load_created_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}

export async function fetchLoads() {
  const { data, error } = await supabase
    .from('distributor_orders')
    .select('*, distributor:distributors(id, name, area, town, payment_mode, confirmed_latitude, confirmed_longitude), member:members!distributor_orders_member_id_fkey(id, name), items:distributor_order_items(*), allocation:vehicle_allocations(id, status, driver_id, driver:members!vehicle_allocations_driver_id_fkey(id, name), vehicle:vehicles(id, vehicle_number, weight_capacity, volume_capacity), warehouse:warehouses(id, name, latitude, longitude))')
    .not('load_id', 'is', null)
    .order('load_created_at', { ascending: false })
  return { data, error }
}

export async function cancelOrderItem(itemId) {
  const { data, error } = await supabase
    .from('distributor_order_items')
    .update({ cancelled: true })
    .eq('id', itemId)
    .select()
    .single()
  return { data, error }
}

export async function addOrderItem(orderId, item) {
  const { data, error } = await supabase
    .from('distributor_order_items')
    .insert({
      order_id: orderId, product_id: item.product_id, category_id: item.category_id,
      rate: item.rate, weight: item.weight, volume: item.volume,
      order_qty: item.order_qty, approved_qty: item.order_qty, final_qty: item.order_qty,
      availability: null,
    })
    .select()
    .single()
  return { data, error }
}

export async function returnToWarehouseManager(orderId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ picking_status: 'pending_picking' })
    .eq('id', orderId)
    .select('picking_round')
    .single()
  if (error) return { data: null, error }
  // Whoever actually confirmed this (Admin directly, or a delegated Manager/order-creator review —
  // see sendOrderForReview below) resolves the delegation the same way: clearing it here means the
  // order drops out of whichever "for your review" queue it was sitting in the instant it's sent
  // back to the warehouse, regardless of who did it.
  const { data: incremented, error: incError } = await supabase
    .from('distributor_orders')
    .update({ picking_round: (data.picking_round || 1) + 1, review_assigned_to: null, review_requested_at: null, review_requested_by: null })
    .eq('id', orderId)
    .select()
    .single()
  return { data: incremented, error: incError }
}

// Admin delegates a not-fully-picked order's review to the order creator's Manager
// (members.manager_id — same manager-lookup pattern as OrderStatus.jsx's scoping) or, if that rep
// has no manager mapped, straight to the order creator themselves. Locks the order read-only for
// Admin (OrderPickingDetail.jsx's isPendingReviewByOther) until the assignee acts —
// returnToWarehouseManager above is what clears it again.
export async function sendOrderForReview(orderId, assignedToUserId, requestedByUserId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ review_assigned_to: assignedToUserId, review_requested_at: new Date().toISOString(), review_requested_by: requestedByUserId })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}

export async function confirmPicking(orderId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ status: 'picking_confirmed', picking_status: 'confirmed' })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}
export async function markOrderWmLoaded(orderId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ loading_stage: 'wm_loaded' })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
}

// Advancing to the next stop / marking the whole allocation loading_complete used to happen only
// inside LoadingScreen.jsx's client-side poll — which only runs while the WM literally has that
// screen open. If the WM closed it (navigated away, refreshed, session ended) before the driver
// got around to confirming, that poll never ran again, so the transition silently never happened —
// the allocation sat at 'loading_in_progress' forever even once every order was actually
// driver_confirmed. Doing it here instead means it always fires, straight off the driver's own
// action, regardless of what the WM's screen is doing. Returns `allocationCompleted`/`allocationId`
// so the caller (DriverOrderConfirmTile.jsx) can fire the same completion notification/activity log
// LoadingScreen.jsx used to.
export async function driverConfirmOrderLoaded(orderId) {
  const { data: order, error } = await supabase
    .from('distributor_orders')
    .update({ loading_stage: 'driver_confirmed', driver_load_confirmed_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()
  if (error || !order?.allocation_id) return { data: order, error, allocationCompleted: false }

  const { data: allocation } = await supabase
    .from('vehicle_allocations')
    .select('id, stop_sequence, current_stop_index, status')
    .eq('id', order.allocation_id)
    .single()
  if (!allocation || allocation.status !== 'loading_in_progress') return { data: order, error: null, allocationCompleted: false }

  const stopSequence = allocation.stop_sequence || []
  const nextIndex = (allocation.current_stop_index || 0) + 1
  if (nextIndex >= stopSequence.length) {
    await supabase.from('vehicle_allocations').update({ status: 'loading_complete', loading_completed_at: new Date().toISOString() }).eq('id', allocation.id)
    return { data: order, error: null, allocationCompleted: true, allocationId: allocation.id }
  }
  await supabase.from('vehicle_allocations').update({ current_stop_index: nextIndex }).eq('id', allocation.id)
  return { data: order, error: null, allocationCompleted: false }
}

export async function fetchOrderLoadingStage(orderId) {
   const { data, error } = await supabase.from('distributor_orders').select('loading_stage').eq('id', orderId).single()
  return { data, error }
}

// Read-back for LoadingScreen.jsx's poll to resync local UI (stopIndex/completion) to whatever
// driverConfirmOrderLoaded already wrote server-side — the poll no longer writes this transition
// itself, only observes it.
export async function fetchAllocationProgress(allocationId) {
  const { data, error } = await supabase.from('vehicle_allocations').select('status, current_stop_index').eq('id', allocationId).single()
  return { data, error }
}

// ─── DISTRIBUTOR SECONDARY (Beats / Retail Outlets / secondary order-taking) ──

export async function createBeat(distributorId, name, coverageDays, createdBy) {
  const { count } = await supabase.from('beats').select('id', { count: 'exact', head: true })
  const seq = String((count || 0) + 1).padStart(4, '0')
  const id = `BT-${seq}`
  const { data, error } = await supabase
    .from('beats')
    .insert({ id, distributor_id: distributorId, name, coverage_days: coverageDays, created_by: createdBy })
    .select()
    .single()
  return { data, error }
}

export async function fetchMyBeats(memberId) {
  const { data, error } = await supabase
    .from('beats')
    .select('*, distributor:distributors(id, name)')
    .eq('created_by', memberId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function createRetailOutlet(beatId, name, number, lat, lng, createdBy) {
  const { count } = await supabase.from('retail_outlets').select('id', { count: 'exact', head: true })
  const seq = String((count || 0) + 1).padStart(4, '0')
  const id = `RO-${seq}`
  const { data, error } = await supabase
    .from('retail_outlets')
    .insert({ id, beat_id: beatId, name, number, lat, lng, created_by: createdBy })
    .select()
    .single()
  return { data, error }
}

export async function fetchOutletsForBeat(beatId) {
  const { data, error } = await supabase
    .from('retail_outlets')
    .select('*')
    .eq('beat_id', beatId)
    .order('created_at', { ascending: true })
  return { data, error }
}

export async function createSecondaryOrder(header, items) {
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  const dateStr = `${dd}${mm}${yyyy}`
  // Local calendar date, NOT toISOString()'s UTC date — for IST (UTC+5:30), any order placed
  // between 12:00-5:29am local time would otherwise get stamped with the PREVIOUS day's
  // order_date while the id prefix above (already local) still says today, so the order would
  // never show up in "today's" Ongoing Orders/Day Summary queries (both filter by the same local
  // todayStr() this file already uses elsewhere). Same bug class already fixed for
  // attendance_punches/period.js; this call site had never been touched by those fixes.
  const orderDate = `${yyyy}-${mm}-${dd}`
  const { count } = await supabase
    .from('secondary_orders')
    .select('id', { count: 'exact', head: true })
    .like('id', `SO-${dateStr}-%`)
  const seq = String((count || 0) + 1).padStart(2, '0')
  const id = `SO-${dateStr}-${seq}`
  const { data: order, error } = await supabase
    .from('secondary_orders')
    .insert({ id, ...header, order_date: orderDate })
    .select()
    .single()
  if (error) return { data: null, error }
  const itemRows = items.map(it => ({
    order_id: order.id, product_id: it.product_id, category_id: it.category_id,
    qty: it.qty, rate: it.rate,
    entered_unit: it.entered_unit || 'base', entered_qty: it.entered_qty ?? it.qty,
  }))
  const { error: itemError } = await supabase.from('secondary_order_items').insert(itemRows)
  return { data: order, error: itemError }
}

export async function createRetailVisit(payload) {
  const { data, error } = await supabase.from('retail_visits').insert(payload).select().single()
  return { data, error }
}

export async function fetchRetailVisitsForDate(memberId, date) {
  const { data, error } = await supabase
    .from('retail_visits')
    .select('*, outlet:retail_outlets(id, name, number)')
    .eq('member_id', memberId)
    .eq('visit_date', date)
    .order('created_at', { ascending: true })
  return { data, error }
}

export async function fetchSecondaryOrdersForDate(memberId, date) {
  const { data, error } = await supabase
    .from('secondary_orders')
    .select('*, outlet:retail_outlets(id, name, number), items:secondary_order_items(*, product:products(id, name, unit))')
    .eq('member_id', memberId)
    .eq('order_date', date)
    // Cancelled orders are excluded here — Day Summary's outlet-wise/product-wise totals should
    // read "as if it didn't happen" once a rep cancels an order (see cancelSecondaryOrder below),
    // not silently include its value.
    .eq('cancelled', false)
    .order('created_at', { ascending: true })
  return { data, error }
}

// Checkout rework (5 Aug 2026) — a saved order isn't final until "Retailing Complete" locks it.
// Between save and lock, a rep can revise items (updateSecondaryOrderItems) or back out entirely
// (cancelSecondaryOrder, soft-cancel + reverts the outlet to unvisited).

export async function updateSecondaryOrderItems(orderId, items) {
  const { error: delError } = await supabase.from('secondary_order_items').delete().eq('order_id', orderId)
  if (delError) return { data: null, error: delError }
  const itemRows = items.map(it => ({
    order_id: orderId, product_id: it.product_id, category_id: it.category_id,
    qty: it.qty, rate: it.rate,
    entered_unit: it.entered_unit || 'base', entered_qty: it.entered_qty ?? it.qty,
  }))
  const { error } = await supabase.from('secondary_order_items').insert(itemRows)
  return { data: { id: orderId }, error }
}

export async function cancelSecondaryOrder(orderId) {
  const { error } = await supabase.from('secondary_orders').update({ cancelled: true }).eq('id', orderId)
  if (error) return { error }
  // Soft-cancelling the order also removes its retail_visits row so the outlet reverts to "Not
  // Visited" for today — the rep can walk it again and place a fresh order if they want to.
  const { error: visitError } = await supabase.from('retail_visits').delete().eq('order_id', orderId)
  return { error: visitError || null }
}

export async function fetchOngoingSecondaryOrders(memberId, date) {
  const { data, error } = await supabase
    .from('secondary_orders')
    .select('*, outlet:retail_outlets(id, name, number), items:secondary_order_items(*, product:products(id, name, unit))')
    .eq('member_id', memberId)
    .eq('order_date', date)
    .eq('cancelled', false)
    .eq('locked', false)
    .order('created_at', { ascending: true })
  return { data, error }
}

// Retailing Complete can now run more than once per day (see createDaySummary below) — each run is
// its own batch, `batchId` is that batch's day_summaries.id. The `locked=false` filter already
// guarantees this only ever touches orders that are still ongoing at the moment of THIS call, never
// a previous batch's already-locked/already-tagged orders.
export async function lockSecondaryOrdersForDate(memberId, date, batchId) {
  const { error } = await supabase
    .from('secondary_orders')
    .update({ locked: true, batch_id: batchId })
    .eq('member_id', memberId)
    .eq('order_date', date)
    .eq('cancelled', false)
    .eq('locked', false)
  return { error }
}

// Day Summary — a permanent "receipt" created each time Retailing Complete is confirmed (not the
// live, always-recomputable rollup the Day Summary tab already shows any time of day). A member can
// complete retailing more than once per day if further orders come in after an earlier batch
// locked — each confirm is its own batch, so id is sequence-suffixed
// (DS-{memberId}-DDMMYYYY-{seq}, same count-then-pad pattern as createSecondaryOrder's
// SO-DDMMYYYY-NN/createLoad's LD-DDMMYYYY-NN) rather than the old fixed one-per-day id.
export async function createDaySummary(memberId, date, totals) {
  const [y, m, d] = date.split('-')
  const dateStr = `${d}${m}${y}`
  const { count } = await supabase
    .from('day_summaries')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('summary_date', date)
  const seq = (count || 0) + 1
  const id = `DS-${memberId}-${dateStr}-${seq}`
  const { data, error } = await supabase
    .from('day_summaries')
    .insert({
      id, member_id: memberId, summary_date: date,
      total_outlets_visited: totals.outletsVisited || 0,
      total_orders: totals.orders || 0,
      total_value: totals.value || 0,
    })
    .select()
    .single()
  return { data, error }
}

// Every batch (day_summaries row) for this member+day, newest first — a day can now hold more than
// one once Retailing Complete has run more than once (see createDaySummary above).
export async function fetchDaySummariesForDate(memberId, date) {
  const { data, error } = await supabase
    .from('day_summaries')
    .select('*')
    .eq('member_id', memberId)
    .eq('summary_date', date)
    .order('created_at', { ascending: false })
  return { data, error }
}

// Distributor Secondary Order Report — single fetch feeding both the Summary tab (grouped
// client-side by batch/distributor/beat) and the Detail tab (flattened to one row per item).
// Scoped to completed batches only (batch_id not null, i.e. locked) — still-ongoing orders aren't
// part of any batch and belong to the live Day Summary rollup instead, not this report.
// from/to are optional (Order Delivery's "no age limit" scope omits them entirely, for an unbounded
// fetch across every completed batch ever) — every other existing caller still passes both, unchanged.
export async function fetchSecondaryOrdersForReport({ memberIds, distributorId, beatId, from, to }) {
  // No `member:members(...)` embed here — secondary_orders.member_id's FK constraint actually
  // points to users(id), even though the app stores members.id values in it in practice (same
  // known quirk as retail_visits.member_id) — PostgREST can't embed a relationship that doesn't
  // exist at the constraint level. Callers resolve the member's name client-side against the
  // already-loaded `members` list from useData() instead.
  // delivery embed (delivery_items → returned_qty per item) feeds the Summary tab's Stock
  // Return/Delivered/Pending breakdown — same !secondary_orders_delivery_id_fkey alias as every
  // other embed of this relationship (2 ambiguous FK paths otherwise, CLAUDE.md Bug Pattern #3).
  let q = supabase
    .from('secondary_orders')
    .select('*, outlet:retail_outlets(id,name), beat:beats(id,name), distributor:distributors(id,name), items:secondary_order_items(*, product:products(id,name)), delivery:secondary_order_deliveries!secondary_orders_delivery_id_fkey(delivered_date, delivery_items:secondary_order_delivery_items(order_item_id, returned_qty))')
    .in('member_id', memberIds)
    .eq('cancelled', false)
    .not('batch_id', 'is', null)
    .order('order_date', { ascending: false })
  if (from) q = q.gte('order_date', from)
  if (to) q = q.lte('order_date', to)
  if (distributorId) q = q.eq('distributor_id', distributorId)
  if (beatId) q = q.eq('beat_id', beatId)
  const { data, error } = await q
  return { data, error }
}

// ─── SECONDARY ORDER DELIVERY ──────────────────────────────────────────────────
// Delivery to the retail outlet is tracked separately from the order itself, one
// secondary_order_deliveries row per order (id `DL-DDMMYYYY-NN`, same count-then-pad local-date
// convention as SO-/LD-/PST-/DS-), referenced back via secondary_orders.delivery_id/delivery_status
// — kept denormalized onto the order row so the dashboard can filter/count directly off
// secondary_orders (already the app's global useData() context) without a second query or a
// PostgREST embed (this table's own FK gotchas, see Recurring Bug Pattern #3, are exactly why the
// read path avoids embedding these two tables together). Only the rep who took the order marks it —
// see CLAUDE.md's Order Delivery module. No unmark/undo path in v1, matching this app's general
// approve-only-flow convention (see Journey Approvals' own no-reject-path note).
async function genDeliveryIds(count) {
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`
  const { count: existing } = await supabase
    .from('secondary_order_deliveries')
    .select('id', { count: 'exact', head: true })
    .like('id', `DL-${dateStr}-%`)
  return Array.from({ length: count }, (_, i) => `DL-${dateStr}-${String((existing || 0) + i + 1).padStart(2, '0')}`)
}

// status: 'full' | 'not_delivered' — the two outcomes that need no per-item breakdown. Covers both
// the batch-level bulk action (many orderIds at once, the "reduce tasks" fast path for the common
// case) and a single order marked from the drill-down, via the same function either way.
// deliveredDate: the real date delivery happened (rep-entered, defaults to today in the UI but
// editable — see SecondaryOrderDelivery.jsx) — distinct from marked_at (below, an automatic
// timestamp of when the app action itself happened, for audit purposes only). The Stock & Sales
// Report's Sales figure is dated by delivered_date, never marked_at.
export async function markOrdersDelivered({ orderIds, batchId, status, memberId, deliveredDate }) {
  if (!orderIds?.length) return { data: [], error: null }
  const ids = await genDeliveryIds(orderIds.length)
  const rows = orderIds.map((order_id, i) => ({ id: ids[i], order_id, batch_id: batchId, status, member_id: memberId, delivered_date: deliveredDate }))
  const { data: deliveries, error } = await supabase.from('secondary_order_deliveries').insert(rows).select()
  if (error) return { data: null, error }
  const updates = await Promise.all(
    deliveries.map(d => supabase.from('secondary_orders').update({ delivery_status: status, delivery_id: d.id }).eq('id', d.order_id))
  )
  return { data: deliveries, error: updates.find(u => u.error)?.error || null }
}

// One order, marked 'partial' — items: [{ order_item_id, returned_qty }], only for lines that
// actually had a return (0 for everything else is the implicit default, no row needed).
export async function markOrderPartiallyDelivered({ orderId, batchId, memberId, items, deliveredDate }) {
  const [id] = await genDeliveryIds(1)
  const { data: delivery, error } = await supabase
    .from('secondary_order_deliveries')
    .insert({ id, order_id: orderId, batch_id: batchId, status: 'partial', member_id: memberId, delivered_date: deliveredDate })
    .select().single()
  if (error) return { data: null, error }
  const itemRows = (items || []).filter(it => Number(it.returned_qty) > 0)
    .map(it => ({ delivery_id: id, order_item_id: it.order_item_id, returned_qty: it.returned_qty }))
  if (itemRows.length) {
    const { error: itemError } = await supabase.from('secondary_order_delivery_items').insert(itemRows)
    if (itemError) return { data: null, error: itemError }
  }
  const { error: updateError } = await supabase.from('secondary_orders').update({ delivery_status: 'partial', delivery_id: id }).eq('id', orderId)
  return { data: delivery, error: updateError }
}

// Return-qty breakdown for a partially-delivered order's detail view — a direct fetch by order_id,
// not a PostgREST embed off secondary_orders (same reasoning as the module comment above).
export async function fetchDeliveryDetail(deliveryId) {
  const { data, error } = await supabase
    .from('secondary_order_delivery_items')
    .select('*, item:secondary_order_items(id, qty, rate, product:products(id, name))')
    .eq('delivery_id', deliveryId)
  return { data, error }
}

// Who/when for the "marked by X" line in SecondaryOrderDetailSheet — member_id/marked_at live on
// this row, not denormalized onto secondary_orders itself (only delivery_status/delivery_id are).
export async function fetchDeliveryById(deliveryId) {
  const { data, error } = await supabase.from('secondary_order_deliveries').select('*').eq('id', deliveryId).single()
  return { data, error }
}

// dateRange: { from, to } ISO date strings — feeds the Distributor Secondary goal category's
// Productive Outlets / Total No. of Orders achievement (see achievementEngine.js). No longer feeds
// the general Visits/"New Customer Visits" goal — that reverted to distributor_visits-only once
// Distributor Secondary got its own dedicated goal fields (5 Aug 2026 session).
export async function fetchRetailVisits(dateRange = null) {
  let query = supabase.from('retail_visits').select('*')
  if (dateRange) query = query.gte('visit_date', dateRange.from).lte('visit_date', dateRange.to)
  const { data, error } = await query
  return { data, error }
}

// Global, date-ranged fetches for the Distributor Secondary goal category (New Outlets / Value) —
// same dateRange-optional pattern as fetchRetailVisits above, org-wide (no member_id filter).
export async function fetchRetailOutlets(dateRange = null) {
  let query = supabase.from('retail_outlets').select('*')
  if (dateRange) query = query.gte('created_at', dateRange.from).lte('created_at', dateRange.to)
  const { data, error } = await query
  return { data, error }
}

// Embeds the delivery outcome (delivered_date + per-item returns) alongside every order — needed so
// achievementEngine.js's Distributor Secondary fields (Total No. of Orders/Productive Outlets/Value)
// can gate on "delivery confirmed" and date by delivered_date, same convention as the Stock & Sales
// Report's own Sales figure (stockReport.js's flattenSales), rather than order-taking. Same
// !secondary_orders_delivery_id_fkey alias as fetchDeliveredSecondaryOrdersForStockReport — the 2 FK
// paths between these tables make PostgREST's embed ambiguous without it (CLAUDE.md Bug Pattern #3).
export async function fetchSecondaryOrders(dateRange = null) {
  // items.id is required here (not just qty/rate) — flattenSales-equivalent return-matching below
  // joins delivery_items.order_item_id back to a specific item.id; without it every item silently
  // keys to `undefined` and the returnedByItem lookup misapplies one item's return to all of them.
  let query = supabase.from('secondary_orders').select('*, items:secondary_order_items(id, qty, rate), delivery:secondary_order_deliveries!secondary_orders_delivery_id_fkey(delivered_date, delivery_items:secondary_order_delivery_items(order_item_id, returned_qty))')
  if (dateRange) query = query.gte('order_date', dateRange.from).lte('order_date', dateRange.to)
  const { data, error } = await query
  return { data, error }
}

// ─── DISTRIBUTOR STOCK TAKE (scheduled physical counts, feeds the Stock & Sales Report) ────────
// Schedule (distributor_stock_take_rules) is a distributor-level policy: Manager sets/edits it
// (always writing to the pending_* columns so the currently-active, already-approved config keeps
// governing the punch-in gate/schedule until HR acts — not a one-time lock, but never silently
// overwritten mid-edit either), HR approves via StockTakeRuleApprovals.jsx. Physical counts
// themselves (distributor_stock_takes/_items) need no approval — they're ground-truth data capture,
// not a figure someone could contest.

export async function fetchStockTakeRules({ distributorIds }) {
  if (!distributorIds?.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('distributor_stock_take_rules')
    .select('*, distributor:distributors(id,name)')
    .in('distributor_id', distributorIds)
  return { data, error }
}

export async function upsertStockTakeRule({ distributor_id, frequency, deviation_limit_days, submittedBy }) {
  const { data, error } = await supabase
    .from('distributor_stock_take_rules')
    .upsert({
      distributor_id,
      pending_frequency: frequency, pending_deviation_limit_days: deviation_limit_days,
      pending_submitted_by: submittedBy, pending_submitted_at: new Date().toISOString(),
      rejection_reason: null, created_by: submittedBy, updated_at: new Date().toISOString(),
    }, { onConflict: 'distributor_id', ignoreDuplicates: false })
    .select()
    .single()
  if (!error) {
    await createNotification({
      target_roles: ['r4'],
      title: 'Stock Take Schedule change pending approval',
      body: `${frequency} / ${deviation_limit_days}-day deviation limit proposed for distributor ${distributor_id}`,
      type: 'stock_take_rule_pending',
      ref_id: distributor_id,
    })
  }
  return { data, error }
}

// distributor_stock_take_rules.pending_submitted_by has no queryable FK to `users` embeddable
// alongside distributor — resolve client-side against the already-loaded `users` list instead,
// same convention as secondary_orders.member_id.
export async function fetchPendingStockTakeRuleChanges() {
  const { data, error } = await supabase
    .from('distributor_stock_take_rules')
    .select('*, distributor:distributors(id,name)')
    .not('pending_frequency', 'is', null)
    .order('pending_submitted_at', { ascending: true })
  return { data, error }
}

export async function approveStockTakeRuleChange(id, approvedBy) {
  const { data: row, error: fetchError } = await supabase
    .from('distributor_stock_take_rules')
    .select('pending_frequency, pending_deviation_limit_days')
    .eq('id', id)
    .single()
  if (fetchError) return { data: null, error: fetchError }
  const { data, error } = await supabase
    .from('distributor_stock_take_rules')
    .update({
      frequency: row.pending_frequency, deviation_limit_days: row.pending_deviation_limit_days,
      status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString(),
      pending_frequency: null, pending_deviation_limit_days: null,
      pending_submitted_by: null, pending_submitted_at: null, rejection_reason: null,
    })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function rejectStockTakeRuleChange(id, approvedBy, reason) {
  const { data, error } = await supabase
    .from('distributor_stock_take_rules')
    .update({
      pending_frequency: null, pending_deviation_limit_days: null,
      pending_submitted_by: null, pending_submitted_at: null,
      rejection_reason: reason || null,
    })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// All completed physical stock takes for the given distributors, oldest first — feeds both the
// Stock & Sales Report (stockReport.js builds consecutive-take periods from this) and the punch-in
// gate's due-date computation (stockTakeSchedule.js's computeDueStatus wants the latest per
// distributor, derived client-side from this same list).
export async function fetchStockTakesForDistributors({ distributorIds }) {
  if (!distributorIds?.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('distributor_stock_takes')
    .select('*, items:distributor_stock_take_items(*, product:products(id,name,unit))')
    .in('distributor_id', distributorIds)
    .order('take_date', { ascending: true })
  return { data, error }
}

// header: { distributor_id, member_id }. items: every active product's { product_id, category_id,
// physical_qty (base-unit-equivalent), entered_unit, entered_qty } — including explicit 0s, unlike
// the Distributor Secondary cart's qty>0 filter, since an exhaustive physical count is the whole
// point (a product simply absent from a take means "not recounted," not "zero").
export async function createStockTake(header, items) {
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  const dateStr = `${dd}${mm}${yyyy}`
  // Local calendar date, not toISOString() — same IST-boundary reasoning as createSecondaryOrder.
  const takeDate = `${yyyy}-${mm}-${dd}`
  const { count } = await supabase
    .from('distributor_stock_takes')
    .select('id', { count: 'exact', head: true })
    .like('id', `PST-${dateStr}-%`)
  const seq = String((count || 0) + 1).padStart(2, '0')
  const id = `PST-${dateStr}-${seq}`
  const { data: take, error } = await supabase
    .from('distributor_stock_takes')
    .insert({ id, ...header, take_date: takeDate })
    .select()
    .single()
  if (error) return { data: null, error }
  const itemRows = items.map(it => ({
    take_id: take.id, product_id: it.product_id,
    physical_qty: it.physical_qty, entered_unit: it.entered_unit || 'base', entered_qty: it.entered_qty ?? it.physical_qty,
  }))
  const { error: itemError } = await supabase.from('distributor_stock_take_items').insert(itemRows)
  return { data: take, error: itemError }
}

// Bootstrap only — "frequency is calculated immediately from next punch in of team": an approved
// rule's cycle doesn't start ticking from the approval moment, it starts from the covering rep's
// next punch-in. Called opportunistically from PunchInGate's stock-take check; idempotent (only
// ever touches rows where first_anchor_date is still null), no scheduled job needed. Once a real
// stock take exists for a distributor, its take_date always wins over this column in
// stockTakeSchedule.js's computeDueStatus, so this value becomes moot after the first count.
export async function bootstrapStockTakeAnchors(distributorIds, today) {
  if (!distributorIds?.length) return { error: null }
  const { error } = await supabase
    .from('distributor_stock_take_rules')
    .update({ first_anchor_date: today })
    .in('distributor_id', distributorIds)
    .eq('status', 'approved')
    .is('first_anchor_date', null)
  return { error }
}

// Receipts side of the Stock & Sales Report — sourced from `invoices` (the authoritative billed-
// quantity record, not distributor_order_items.final_qty directly), scoped to approved invoices for
// the given distributors, all-time. An order-linked invoice only counts once the driver has actually
// confirmed delivery (order.delivered_at set, Journey Phase 3's "Delivery Complete") — stockReport.js
// gates on that client-side. A legacy/manual invoice (order_id null — pre-dates the digital order
// pipeline, see CLAUDE.md's Invoicing note) has nothing to "confirm" and counts as soon as approved.
// No server-side date filter for the same IST-boundary reasoning as fetchDeliveredOrdersForStockReport
// used to carry — bucketing by local calendar date happens client-side in stockReport.js.
export async function fetchReceiptsForStockReport({ distributorIds }) {
  if (!distributorIds?.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('invoices')
    .select('*, lines:invoice_lines(*, product:products(id,name)), order:distributor_orders(id, delivered_at)')
    .in('distributor_id', distributorIds)
    .eq('status', 'approved')
  return { data, error }
}

// Sales side of the Stock & Sales Report — real delivered secondary-order quantity (replacing the
// old Opening+Receipts-Closing derived plug), scoped to completed batches (matches every other
// Distributor Secondary "real activity" gate in this app) with a resolved delivery outcome. Embeds
// the delivery row + its per-item returns directly — unlike secondary_orders.member_id, delivery_id
// is a real FK with no PostgREST embedding trap, so this reads in one query rather than needing a
// client-side resolve.
export async function fetchDeliveredSecondaryOrdersForStockReport({ distributorIds }) {
  if (!distributorIds?.length) return { data: [], error: null }
  // secondary_orders <-> secondary_order_deliveries has 2 FK paths (deliveries.order_id, and this
  // table's own denormalized delivery_id) — PostgREST can't pick one without the explicit
  // !constraint_name alias below (see CLAUDE.md's Recurring Bug Pattern #3; this fetch fell into
  // that exact trap once already: the embed failed outright, and since nothing surfaces that error
  // to the UI, Sales just silently computed as 0 everywhere — caught only by checking real numbers
  // during verification, not by any crash or visible symptom).
  const { data, error } = await supabase
    .from('secondary_orders')
    .select('*, items:secondary_order_items(*), delivery:secondary_order_deliveries!secondary_orders_delivery_id_fkey(id, marked_at, delivered_date, delivery_items:secondary_order_delivery_items(order_item_id, returned_qty))')
    .in('distributor_id', distributorIds)
    .eq('cancelled', false)
    .not('batch_id', 'is', null)
    .in('delivery_status', ['full', 'partial'])
  return { data, error }
}

// ─── DISTRIBUTOR OPENING STOCK (one-time baseline, per distributor) ────────────
// A distributor's very first Stock & Sales Report period has no prior physical count to inherit an
// Opening balance from — this fills that gap with a one-time manual entry instead of defaulting to
// 0. distributor_id is the table's own primary key (not a generated id), which is what enforces
// "entered once, ever" at the database level — the insert below simply fails on a second attempt for
// the same distributor. Needs Manager then Admin sign-off (sequential, same shape as every other
// 2-stage approval in this app) before stockReport.js will actually use it as a baseline.
export async function fetchOpeningStocks({ distributorIds }) {
  if (!distributorIds?.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('distributor_opening_stocks')
    .select('*, items:distributor_opening_stock_items(*), distributor:distributors(id,name)')
    .in('distributor_id', distributorIds)
  return { data, error }
}

export async function submitOpeningStock({ distributorId, enteredBy, items }) {
  const { data: header, error } = await supabase
    .from('distributor_opening_stocks')
    .insert({ distributor_id: distributorId, entered_by: enteredBy })
    .select().single()
  if (error) return { data: null, error }
  const itemRows = (items || []).filter(it => Number(it.qty) > 0)
    .map(it => ({ distributor_id: distributorId, product_id: it.product_id, qty: it.qty }))
  if (itemRows.length) {
    const { error: itemError } = await supabase.from('distributor_opening_stock_items').insert(itemRows)
    if (itemError) return { data: null, error: itemError }
  }
  return { data: header, error: null }
}

export async function approveOpeningStockManager(distributorId, approvedBy) {
  const { data, error } = await supabase
    .from('distributor_opening_stocks')
    .update({ status: 'manager_approved', manager_approved_by: approvedBy, manager_approved_at: new Date().toISOString() })
    .eq('distributor_id', distributorId).eq('status', 'pending')
    .select().single()
  return { data, error }
}

export async function approveOpeningStockAdmin(distributorId, approvedBy) {
  const { data, error } = await supabase
    .from('distributor_opening_stocks')
    .update({ status: 'approved', admin_approved_by: approvedBy, admin_approved_at: new Date().toISOString() })
    .eq('distributor_id', distributorId).eq('status', 'manager_approved')
    .select().single()
  return { data, error }
}

// ─── STOCK & SALES DISCREPANCY REPORT ──────────────────────────────────────────
// Pending Order Delivery batches for one distributor — shown as a soft confirmation gate in
// StockTakeEntry.jsx before a physical count proceeds. Sales is now real (from Order Delivery), so a
// stock take taken while deliveries are still pending is worth flagging to the rep, not blocking —
// same soft-warn convention as this file's geofence check.
export async function fetchPendingDeliveryBatchesForDistributor(distributorId) {
  const { data, error } = await supabase
    .from('secondary_orders')
    .select('id, batch_id, order_date, items:secondary_order_items(qty, rate)')
    .eq('distributor_id', distributorId)
    .eq('cancelled', false)
    .not('batch_id', 'is', null)
    .eq('delivery_status', 'pending')
  return { data, error }
}

// One snapshot per physical stock take (StockTakeEntry.jsx generates this right after createStockTake
// succeeds), comparing that moment's ledger-calculated closing (Opening+Receipts-Sales) against the
// just-submitted physical count. Immutable by design — stores the numbers as computed at save time,
// not re-derived later, so a later-edited invoice or return can't silently rewrite history. id
// `SDR-DDMMYYYY-NN`, same count-then-pad local-date convention as every other generated id here.
export async function createDiscrepancyReport({ distributorId, takeId, reportDate, fromDate, items }) {
  const dateStr = reportDate.split('-').reverse().join('') // 'YYYY-MM-DD' -> 'DDMMYYYY'
  const { count } = await supabase
    .from('stock_discrepancy_reports')
    .select('id', { count: 'exact', head: true })
    .like('id', `SDR-${dateStr}-%`)
  const id = `SDR-${dateStr}-${String((count || 0) + 1).padStart(2, '0')}`
  const { data: report, error } = await supabase
    .from('stock_discrepancy_reports')
    .insert({ id, distributor_id: distributorId, take_id: takeId, report_date: reportDate, from_date: fromDate || null })
    .select().single()
  if (error) return { data: null, error }
  const itemRows = items.map(it => ({ report_id: id, ...it }))
  const { error: itemError } = await supabase.from('stock_discrepancy_report_items').insert(itemRows)
  return { data: report, error: itemError }
}

export async function fetchDiscrepancyReports({ distributorIds }) {
  if (!distributorIds?.length) return { data: [], error: null }
  // Embeds the stock take itself (single, unambiguous FK — take_id has no reverse pointer back from
  // distributor_stock_takes, unlike the secondary_orders/secondary_order_deliveries trap) so the
  // report can show the real date+time the physical count was taken, not just report_date.
  const { data, error } = await supabase
    .from('stock_discrepancy_reports')
    .select('*, items:stock_discrepancy_report_items(*, product:products(id,name,unit)), distributor:distributors(id,name), take:distributor_stock_takes(id,take_date,created_at)')
    .in('distributor_id', distributorIds)
    .order('report_date', { ascending: false })
  return { data, error }
}

// ─── PRICING MASTER ─────────────────────────────────────────────────────────
// Price Tiers are plain Admin-direct-edit master data (create/rename tiers, assign distributors to
// one via distributors.price_tier_id) — no approval workflow, same convention as every other master
// table (Products, Vehicles, Warehouses). Actual price *values* (base, or an override for a specific
// distributor/tier) go through price_change_requests instead: Accounts (or Admin) proposes, Admin
// approves — see approvePriceChangeRequest below for how a 'base' approval also writes products.price
// directly so every reader that isn't wired into the resolution cascade (src/lib/pricing.js) still
// sees a correct, current flat price with no code change of its own.

export async function fetchPriceTiers() {
  const { data, error } = await supabase.from('price_tiers').select('*').order('name')
  return { data, error }
}

export async function createPriceTier(payload) {
  const { data, error } = await supabase.from('price_tiers').insert(payload).select().single()
  return { data, error }
}

export async function updatePriceTier(id, payload) {
  const { data, error } = await supabase.from('price_tiers').update(payload).eq('id', id).select().single()
  return { data, error }
}

export async function deletePriceTier(id) {
  const { error } = await supabase.from('price_tiers').delete().eq('id', id)
  return { error }
}

export async function updateDistributorPriceTier(distributorId, tierId) {
  const { data, error } = await supabase
    .from('distributors')
    .update({ price_tier_id: tierId || null })
    .eq('id', distributorId)
    .select()
    .single()
  return { data, error }
}

// Full history (every proposal, approved/rejected/pending) — the approval queue and the "current
// price" cascade (src/lib/pricing.js's buildPriceOverrideMaps) both derive from this one fetch, no
// separate "current state" table to drift out of sync with the approval log.
export async function fetchPriceChangeRequests() {
  const { data, error } = await supabase
    .from('price_change_requests')
    .select('*, product:products(id,name,unit), distributor:distributors(id,name), tier:price_tiers(id,name)')
    .order('proposed_at', { ascending: false })
  return { data, error }
}

export async function createPriceChangeRequest({ productId, scopeType, distributorId, tierId, previousPrice, proposedPrice, note, proposedBy }) {
  const payload = {
    product_id: productId, scope_type: scopeType,
    distributor_id: scopeType === 'distributor' ? distributorId : null,
    tier_id: scopeType === 'tier' ? tierId : null,
    previous_price: previousPrice, proposed_price: proposedPrice,
    status: 'pending_approval', note: note || null,
    proposed_by: proposedBy, proposed_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('price_change_requests').insert(payload).select().single()
  return { data, error }
}

// Category-level bulk propose (PricingMaster.jsx's Propose Change "Bulk by Category" mode) — one row
// per product the rep actually edited away from its prefilled current price, inserted in a single
// round trip. Still just ordinary price_change_requests rows underneath (same scope_type/status
// shape as a single proposal) — bulk-by-category is a UI convenience for creating many of them at
// once, not a new resolution concept, so the approval queue/cascade need no changes to handle these.
export async function createPriceChangeRequestsBulk(rows) {
  const payload = rows.map(({ productId, scopeType, distributorId, tierId, previousPrice, proposedPrice, note, proposedBy }) => ({
    product_id: productId, scope_type: scopeType,
    distributor_id: scopeType === 'distributor' ? distributorId : null,
    tier_id: scopeType === 'tier' ? tierId : null,
    previous_price: previousPrice, proposed_price: proposedPrice,
    status: 'pending_approval', note: note || null,
    proposed_by: proposedBy, proposed_at: new Date().toISOString(),
  }))
  const { data, error } = await supabase.from('price_change_requests').insert(payload).select()
  return { data, error }
}

export async function approvePriceChangeRequest(id, approvedBy) {
  const { data: row, error: fetchError } = await supabase
    .from('price_change_requests')
    .select('product_id, scope_type, proposed_price')
    .eq('id', id)
    .single()
  if (fetchError) return { data: null, error: fetchError }

  const { data, error } = await supabase
    .from('price_change_requests')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString(), rejection_reason: null })
    .eq('id', id)
    .select()
    .single()
  if (error) return { data: null, error }

  // Base-scope approvals also update the flat products.price column itself — it IS the base price,
  // not a separate override row — so every reader that still goes straight to products.price (e.g.
  // Distributor Secondary's cart) stays correct without needing its own wiring into the cascade.
  if (row.scope_type === 'base') {
    const { error: prodError } = await supabase.from('products').update({ price: row.proposed_price }).eq('id', row.product_id)
    if (prodError) return { data, error: prodError }
  }
  return { data, error: null }
}

export async function rejectPriceChangeRequest(id, approvedBy, reason) {
  const { data, error } = await supabase
    .from('price_change_requests')
    .update({ status: 'rejected', approved_by: approvedBy, approved_at: new Date().toISOString(), rejection_reason: reason || null })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}