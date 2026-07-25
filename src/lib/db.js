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

// ─── PARAMETERS ───────────────────────────────────────────────────────────────

export async function fetchParameters() {
  const { data, error } = await supabase.from('parameters').select('*')
  return { data, error }
}

export async function upsertParameter(memberId, payload) {
  const { data, error } = await supabase
    .from('parameters')
    .upsert({ member_id: memberId, ...payload }, { onConflict: 'member_id' })
    .select()
    .single()
  return { data, error }
}

// ─── GOALS ────────────────────────────────────────────────────────────────────

export async function fetchGoals() {
  const { data, error } = await supabase.from('goals').select('*')
  return { data, error }
}

export async function fetchGoalByMember(memberId) {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('member_id', memberId)
    .single()
  return { data, error }
}

export async function upsertGoal(memberId, payload) {
  const { data, error } = await supabase
    .from('goals')
    .upsert({ member_id: memberId, ...payload }, { onConflict: 'member_id' })
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
    .select('*, distributor:distributors(id, name, area, town), member:members!distributor_orders_member_id_fkey(id, name), items:distributor_order_items(*)')
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
    .select('*, distributor:distributors(id, name, area, town), member:members!distributor_orders_member_id_fkey(id, name), items:distributor_order_items(*)')
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