import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Card, CH, Btn, Sheet } from './ui.jsx'
import * as db from '../lib/db.js'

export default function DriverOrderConfirmTile() {
  const { currentUser } = useAuth()
  const [allocations, setAllocations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [reviewing, setReviewing] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadData = async () => {
    const { data } = await db.fetchDriverAllocations(currentUser?.member_id)
    const inProgress = (data || []).filter(a => a.status === 'loading_in_progress')
    const withOrders = await Promise.all(inProgress.map(async a => {
      const { data: orders } = await db.fetchAllocationOrders(a.id)
      const pending = (orders || []).find(o => o.loading_stage === 'wm_loaded')
      return pending ? { allocation: a, order: pending } : null
    }))
    setAllocations(withOrders.filter(Boolean))
    setLoaded(true)
  }
  if (!loaded) loadData()

  const confirm = async () => {
    setBusy(true)
    await db.driverConfirmOrderLoaded(reviewing.order.id)
    setBusy(false)
    setReviewing(null)
    await loadData()
  }

  if (allocations.length === 0) return null

  return (
    <>
      <Card style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
        <CH title="Loading Confirmation Needed" sub={`${allocations.length} order(s) waiting your confirmation`} />
        {allocations.map(({ allocation, order }) => (
          <div key={order.id} onClick={() => setReviewing({ allocation, order })} style={{ padding: '12px 14px', borderBottom: '1px solid #fde68a', cursor: 'pointer' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{order.distributor?.name} — Order #{order.id}</div>
            <div style={{ fontSize: 11, color: '#92400e' }}>Tap to review loaded quantities</div>
          </div>
        ))}
      </Card>

      {reviewing && (
        <Sheet title={`Confirm Loading — Order #${reviewing.order.id}`} sub={reviewing.order.distributor?.name} onClose={() => setReviewing(null)}>
          <Card>
            <CH title="Items" />
            {(reviewing.order.items || []).filter(it => !it.cancelled).map(it => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                <span>{it.product_id}</span>
                <span>{it.final_qty} qty</span>
              </div>
            ))}
          </Card>
          <Btn v="pri" full disabled={busy} onClick={confirm}>{busy ? 'Confirming...' : 'Confirm Loaded Quantity'}</Btn>
        </Sheet>
      )}
    </>
  )
}