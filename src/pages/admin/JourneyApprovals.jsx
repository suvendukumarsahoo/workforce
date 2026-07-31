import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { Card, CH, Btn } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const RETURN_CHECKLIST_ITEMS = [
  { key: 'return_vehicle_parked', label: 'Vehicle Parked' },
  { key: 'return_keys_handover', label: 'Keys Handover' },
  { key: 'return_pod_handover', label: 'POD Handover' },
]

export default function JourneyApprovals() {
  const { currentUser } = useAuth()
  const [allocations, setAllocations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const loadData = async () => {
    const { data } = await db.fetchPendingJourneyApprovals()
    const withOrders = await Promise.all((data || []).map(async a => {
      const { data: orders } = await db.fetchAllocationOrders(a.id)
      return { allocation: a, orders: orders || [] }
    }))
    setAllocations(withOrders)
    setLoaded(true)
  }
  if (!loaded) loadData()

  const approve = async (allocation) => {
    setBusyId(allocation.id)
    await db.approveJourneyComplete(allocation.id, currentUser?.member_id)
    setBusyId(null)
    await loadData()
  }

  return (
    <div>
      <Card>
        <CH title="Journey Complete — Pending Approval" sub={`${allocations.length} allocation(s)`} />
        {allocations.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No journeys waiting for approval</div>}
      </Card>

      {allocations.map(({ allocation, orders }) => (
        <Card key={allocation.id}>
          <CH title={`${allocation.id} — ${allocation.vehicle?.vehicle_number || ''}`}
            sub={`Driver: ${allocation.driver?.name || '—'} · From ${allocation.warehouse?.name || '—'}`} />

          <div style={{ padding: 14 }}>
            {orders.map(o => (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{o.distributor?.name} — Order #{o.id}</div>
                <div style={{ color: '#6b7280', marginTop: 2 }}>
                  {o.arrived_at && `Arrived ${new Date(o.arrived_at).toLocaleString('en-IN')}`}
                  {o.unloading_started_at && ` · Unloading ${new Date(o.unloading_started_at).toLocaleString('en-IN')}`}
                  {o.delivered_at && ` · Delivered ${new Date(o.delivered_at).toLocaleString('en-IN')}`}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {RETURN_CHECKLIST_ITEMS.map(c => (
                <div key={c.key} style={{ fontSize: 12, fontWeight: 600, color: allocation[c.key] ? '#10b981' : '#ef4444' }}>
                  {allocation[c.key] ? '✓' : '✗'} {c.label}
                </div>
              ))}
            </div>

            <Btn v="pri" full disabled={busyId === allocation.id} onClick={() => approve(allocation)} style={{ marginTop: 12 }}>
              {busyId === allocation.id ? 'Approving...' : 'Approve Journey Complete'}
            </Btn>
          </div>
        </Card>
      ))}
    </div>
  )
}
