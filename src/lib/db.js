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
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
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

export async function advanceStopIndex(allocationId, newIndex) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({ current_stop_index: newIndex })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}

export async function markLoadingComplete(allocationId) {
  const { data, error } = await supabase
    .from('vehicle_allocations')
    .update({ status: 'loading_complete', loading_completed_at: new Date().toISOString() })
    .eq('id', allocationId)
    .select()
    .single()
  return { data, error }
}

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
  return { data, error }
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

export async function fetchInvoicesForOrders(orderIds) {
  if (!orderIds?.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('invoices')
    .select('order_id, id, status')
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

export async function punchIn(userId, { lat, lng, distanceM, locationFlag, flagReason, dutyStatus, minutesLate }) {
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
    .select('*, user:users!attendance_punches_user_id_fkey(id, name, avatar, color, role_id)')
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
    .select('*, user:users!attendance_punches_user_id_fkey(id, name, avatar, color, role_id)')
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
    .select('*, user:users!attendance_punches_user_id_fkey(id, name, avatar, color, role_id)')
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
  const { data: incremented, error: incError } = await supabase
    .from('distributor_orders')
    .update({ picking_round: (data.picking_round || 1) + 1 })
    .eq('id', orderId)
    .select()
    .single()
  return { data: incremented, error: incError }
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

export async function driverConfirmOrderLoaded(orderId) {
  const { data, error } = await supabase
    .from('distributor_orders')
    .update({ loading_stage: 'driver_confirmed', driver_load_confirmed_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()
  return { data, error }
} 

export async function fetchOrderLoadingStage(orderId) {
   const { data, error } = await supabase.from('distributor_orders').select('loading_stage').eq('id', orderId).single()
  return { data, error }
}