import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Card, CH, Btn, Sheet } from './ui.jsx'
import * as db from '../lib/db.js'
import RouteMapSheet from './RouteMapSheet.jsx'
import JourneyVeinTimeline from './JourneyVeinTimeline.jsx'
import { fmtTs } from '../lib/journeyTimeline.js'

const CHECKLIST_ITEMS = [
  { key: 'collected_invoice', label: 'Collected Invoice' },
  { key: 'collected_waybill', label: 'Collected Waybill' },
  { key: 'informed_distributor', label: 'Informed to Distributor' },
]

const RETURN_CHECKLIST_ITEMS = [
  { key: 'return_vehicle_parked', label: 'Vehicle Parked' },
  { key: 'return_keys_handover', label: 'Keys Handover' },
  { key: 'return_pod_handover', label: 'POD Handover' },
]

export default function AllocationJourneyTile() {
  const { currentUser } = useAuth()
  const [allocations, setAllocations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busyKey, setBusyKey] = useState(null)
  const [routingFor, setRoutingFor] = useState(null)
  const [routePlanCandidate, setRoutePlanCandidate] = useState(null)
  const [startingJourney, setStartingJourney] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [deliveryError, setDeliveryError] = useState(null)

  const [completed, setCompleted] = useState([])
  const [members, setMembers] = useState([])
  const [openingId, setOpeningId] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!currentUser?.member_id) return
    db.fetchDriverCompletedJourneys(currentUser.member_id).then(({ data }) => setCompleted(data || []))
    db.fetchMembers().then(({ data }) => setMembers(data || []))
  }, [currentUser?.member_id])

  const approverName = a => members.find(m => m.id === a.journey_complete_approved_by)?.name || a.journey_complete_approved_by || '—'

  const openDetail = async (allocation) => {
    setOpeningId(allocation.id)
    const { data: orders } = await db.fetchAllocationOrders(allocation.id)
    const { data: progress } = await db.fetchLoadItemProgress(allocation.id)
    const totalQtyLoaded = (progress || []).reduce((s, p) => s + (p.loaded_qty || 0), 0)
    setOpeningId(null)
    setDetail({ allocation, orders: orders || [], totalQtyLoaded })
  }

  const lastPingRef = useRef({})
  const watchIdRef = useRef(null)

  // Report position for in-transit loads while this Journey screen stays open — only source of
  // live tracking data, see CLAUDE.md Phase 2: no background service worker exists.
  useEffect(() => {
    const inTransitIds = allocations
      .filter(a => a.allocation.status === 'in_transit')
      .map(a => a.allocation.id)

    if (inTransitIds.length === 0 || !navigator.geolocation) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const nowMs = Date.now()
        inTransitIds.forEach(id => {
          const last = lastPingRef.current[id] || 0
          if (nowMs - last >= 45000) {
            lastPingRef.current[id] = nowMs
            db.recordVehicleLocation(id, pos.coords.latitude, pos.coords.longitude)
          }
        })
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 20000 }
    )

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [allocations])

  const loadData = async () => {
    const { data } = await db.fetchDriverAllocations(currentUser?.member_id)
    const relevant = (data || []).filter(a => ['loading_complete', 'in_transit', 'returning_to_base', 'pending_journey_approval'].includes(a.status))
    const withOrders = await Promise.all(relevant.map(async a => {
      const { data: orders } = await db.fetchAllocationOrders(a.id)
      const orderIds = (orders || []).map(o => o.id)
      const { data: invoices } = await db.fetchInvoicesForOrders(orderIds)
      const invoicedIds = new Set((invoices || []).map(i => i.order_id))
      return { allocation: a, orders: orders || [], invoicedIds }
    }))
    setAllocations(withOrders)
    setLoaded(true)
  }
  if (!loaded) loadData()

  const toggleChecklistItem = async (allocation, key) => {
    setBusyKey(`${allocation.id}-${key}`)
    await db.updateAllocationChecklist(allocation.id, { [key]: !allocation[key] })
    setBusyKey(null)
    await loadData()
  }

  const openRoute = (allocation, orders) => {
    setRoutePlanCandidate(null)
    setRoutingFor({ allocation, orders })
  }

  const confirmStartJourney = async () => {
    if (!routePlanCandidate || !routingFor) return
    setStartingJourney(true)
    const { error } = await db.startJourney(routingFor.allocation.id, routePlanCandidate)
    setStartingJourney(false)
    if (error) return
    setRoutingFor(null)
    setRoutePlanCandidate(null)
    await loadData()
  }

  const markArrived = async (order) => {
    setBusyKey(`${order.id}-arrive`)
    await db.markArrived(order.id)
    setBusyKey(null)
    await loadData()
  }

  const startUnloading = async (order) => {
    setBusyKey(`${order.id}-unload`)
    await db.startUnloading(order.id)
    setBusyKey(null)
    await loadData()
  }

  const completeDelivery = async (order, withLocation) => {
    setBusyKey(`${order.id}-deliver`)
    setDeliveryError(null)
    if (!withLocation || !navigator.geolocation) {
      await db.completeDelivery(order.id, null, null)
      setBusyKey(null)
      await loadData()
      return
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      await db.completeDelivery(order.id, pos.coords.latitude, pos.coords.longitude)
      setBusyKey(null)
      await loadData()
    }, () => {
      setDeliveryError('Could not get your current location')
      setBusyKey(null)
    })
  }

  const nextStop = async (allocation, stopIndex) => {
    setBusyKey(`${allocation.id}-next`)
    await db.advanceDeliveryStop(allocation.id, stopIndex + 1)
    setBusyKey(null)
    await loadData()
  }

  const returnToBase = async (allocation) => {
    setBusyKey(`${allocation.id}-return`)
    await db.startReturnToBase(allocation.id)
    setBusyKey(null)
    await loadData()
  }

  const toggleReturnChecklistItem = async (allocation, key) => {
    setBusyKey(`${allocation.id}-${key}`)
    await db.updateAllocationChecklist(allocation.id, { [key]: !allocation[key] })
    setBusyKey(null)
    await loadData()
  }

  const submitJourneyComplete = async (allocation) => {
    setBusyKey(`${allocation.id}-submit-journey`)
    await db.submitJourneyComplete(allocation.id)
    setBusyKey(null)
    await loadData()
  }

  return (
    <>
      {allocations.length === 0 && (
        <Card>
          <CH title="Journey" />
          <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No load ready for invoicing / dispatch right now</div>
        </Card>
      )}

      {allocations.map(({ allocation, orders, invoicedIds }) => {
        const allInvoiced = orders.length > 0 && orders.every(o => invoicedIds.has(o.id))
        const allChecked = CHECKLIST_ITEMS.every(c => allocation[c.key])

        if (allocation.status === 'loading_complete') {
          return (
            <Card key={allocation.id} style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <CH title={`Load ${allocation.id} — ${allocation.vehicle?.vehicle_number || ''}`} sub="Ready for invoicing / dispatch checklist" />
              {orders.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #fde68a', fontSize: 13 }}>
                  <span>{o.distributor?.name} — Order #{o.id}</span>
                  <span style={{ fontWeight: 600, color: invoicedIds.has(o.id) ? '#10b981' : '#9ca3af' }}>
                    {invoicedIds.has(o.id) ? 'Invoiced' : 'Not Invoiced'}
                  </span>
                </div>
              ))}

              {allInvoiced && (
                <div style={{ padding: 14 }}>
                  {CHECKLIST_ITEMS.map(c => (
                    <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!allocation[c.key]}
                        disabled={busyKey === `${allocation.id}-${c.key}`}
                        onChange={() => toggleChecklistItem(allocation, c.key)}
                      />
                      {c.label}
                    </label>
                  ))}
                  <Btn v="pri" full disabled={!allChecked} onClick={() => openRoute(allocation, orders)} style={{ marginTop: 6 }}>
                    Start Journey
                  </Btn>
                </div>
              )}
            </Card>
          )
        }

        if (allocation.status === 'returning_to_base') {
          const allReturnChecked = RETURN_CHECKLIST_ITEMS.every(c => allocation[c.key])
          return (
            <Card key={allocation.id} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <CH title={`Returning to Base — ${allocation.vehicle?.vehicle_number || ''}`} sub="All deliveries complete" />
              <div style={{ padding: 14 }}>
                {RETURN_CHECKLIST_ITEMS.map(c => (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!allocation[c.key]}
                      disabled={busyKey === `${allocation.id}-${c.key}`}
                      onChange={() => toggleReturnChecklistItem(allocation, c.key)}
                    />
                    {c.label}
                  </label>
                ))}
                <Btn v="pri" full disabled={!allReturnChecked || busyKey === `${allocation.id}-submit-journey`} onClick={() => submitJourneyComplete(allocation)} style={{ marginTop: 6 }}>
                  {busyKey === `${allocation.id}-submit-journey` ? 'Submitting...' : 'Submit Journey Complete'}
                </Btn>
              </div>
            </Card>
          )
        }

        if (allocation.status === 'pending_journey_approval') {
          return (
            <Card key={allocation.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <CH title={`Journey Complete — ${allocation.vehicle?.vehicle_number || ''}`} sub="Waiting for Admin Approval" />
            </Card>
          )
        }

        // in_transit
        const stops = allocation.route_plan?.stops || []
        const stopIndex = allocation.delivery_stop_index || 0
        const stop = stops[stopIndex]
        const order = stop ? orders.find(o => o.id === stop.order_id) : null
        const elapsedMin = allocation.journey_started_at
          ? Math.round((now - new Date(allocation.journey_started_at).getTime()) / 60000)
          : null
        const isLastStop = stopIndex === stops.length - 1

        return (
          <Card key={allocation.id} style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <CH title={`In Transit — ${allocation.vehicle?.vehicle_number || ''}`} sub={`Stop ${stopIndex + 1} of ${stops.length}`} />
            {stop && order ? (
              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{stop.distributor_name}</div>
                <div style={{ fontSize: 12, color: '#1e40af', marginTop: 4 }}>
                  Est. arrival: {stop.cum_eta_min} min from journey start
                  {elapsedMin !== null && ` · Elapsed: ${elapsedMin} min`}
                </div>

                {!order.arrived_at && (
                  <Btn v="pri" full disabled={busyKey === `${order.id}-arrive`} onClick={() => markArrived(order)} style={{ marginTop: 10 }}>
                    {busyKey === `${order.id}-arrive` ? 'Confirming...' : 'Arrived'}
                  </Btn>
                )}

                {order.arrived_at && !order.unloading_started_at && (
                  <>
                    <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 10 }}>
                      Arrived — {new Date(order.arrived_at).toLocaleTimeString('en-IN')}
                    </div>
                    <Btn v="pri" full disabled={busyKey === `${order.id}-unload`} onClick={() => startUnloading(order)} style={{ marginTop: 8 }}>
                      {busyKey === `${order.id}-unload` ? 'Confirming...' : 'Start Unloading'}
                    </Btn>
                  </>
                )}

                {order.unloading_started_at && !order.delivered_at && (
                  <>
                    <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginTop: 10 }}>
                      Unloading in Progress — {new Date(order.unloading_started_at).toLocaleTimeString('en-IN')}
                    </div>
                    <Btn v="pri" full disabled={busyKey === `${order.id}-deliver`} onClick={() => completeDelivery(order, true)} style={{ marginTop: 8 }}>
                      {busyKey === `${order.id}-deliver` ? 'Getting location...' : 'Delivery Complete'}
                    </Btn>
                    {deliveryError && (
                      <>
                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{deliveryError}</div>
                        <Btn full onClick={() => completeDelivery(order, false)} style={{ marginTop: 6 }}>
                          Complete Without Location
                        </Btn>
                      </>
                    )}
                  </>
                )}

                {order.delivered_at && (
                  <>
                    <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 10 }}>
                      Delivery Complete — {new Date(order.delivered_at).toLocaleTimeString('en-IN')}
                    </div>
                    {isLastStop ? (
                      <Btn v="pri" full disabled={busyKey === `${allocation.id}-return`} onClick={() => returnToBase(allocation)} style={{ marginTop: 8 }}>
                        {busyKey === `${allocation.id}-return` ? 'Confirming...' : 'Return to Base'}
                      </Btn>
                    ) : (
                      <Btn v="pri" full disabled={busyKey === `${allocation.id}-next`} onClick={() => nextStop(allocation, stopIndex)} style={{ marginTop: 8 }}>
                        {busyKey === `${allocation.id}-next` ? 'Confirming...' : 'Next Stop'}
                      </Btn>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div style={{ padding: 14, fontSize: 12, color: '#9ca3af' }}>No further stops</div>
            )}
          </Card>
        )
      })}

      {routingFor && (
        <RouteMapSheet
          loads={routingFor.orders.map(o => ({ ...o, allocation: { warehouse: routingFor.allocation.warehouse } }))}
          onClose={() => { setRoutingFor(null); setRoutePlanCandidate(null) }}
          onRouteReady={setRoutePlanCandidate}
          footer={
            <Btn v="pri" full disabled={!routePlanCandidate || startingJourney} onClick={confirmStartJourney} style={{ marginTop: 10 }}>
              {startingJourney ? 'Starting...' : 'Confirm Route & Start Journey'}
            </Btn>
          }
        />
      )}

      {completed.length > 0 && (
        <Card>
          <CH title="Completed Journeys" sub={`${completed.length} journey(s)`} />
          {completed.map(a => (
            <div
              key={a.id}
              onClick={() => openDetail(a)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb' }}
              onMouseLeave={e => { e.currentTarget.style.background = '' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2937' }}>
                  {a.id} — {a.vehicle?.vehicle_number || ''}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  From {a.warehouse?.name || '—'} · Approved {fmtTs(a.journey_complete_approved_at)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>
                {openingId === a.id ? 'Loading…' : '›'}
              </div>
            </div>
          ))}
        </Card>
      )}

      {detail && (
        <Sheet
          title={`Journey Details — ${detail.allocation.id}`}
          sub={`${detail.allocation.vehicle?.vehicle_number || ''} · From ${detail.allocation.warehouse?.name || '—'}`}
          onClose={() => setDetail(null)}
        >
          <div style={{ border: '1px solid #f3f4f6', borderRadius: 12, overflow: 'hidden' }}>
            <JourneyVeinTimeline allocation={detail.allocation} orders={detail.orders} totalQtyLoaded={detail.totalQtyLoaded} />
          </div>

          <div style={{ marginTop: 14, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 4 }}>✓ Approved</div>
            <div>By: {approverName(detail.allocation)}</div>
            <div>At: {fmtTs(detail.allocation.journey_complete_approved_at)}</div>
            <div style={{ marginTop: 6 }}>Remarks: {detail.allocation.journey_complete_approval_remarks || '—'}</div>
          </div>
        </Sheet>
      )}
    </>
  )
}
