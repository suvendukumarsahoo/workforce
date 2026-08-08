import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { Card, CH, Btn, Sheet } from '../../components/ui.jsx'
import JourneyVeinTimeline from '../../components/JourneyVeinTimeline.jsx'
import { printJourneyReport } from '../../lib/printJourney.js'
import { fmtTs } from '../../lib/journeyTimeline.js'
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
  const [remarksById, setRemarksById] = useState({})

  const [approved, setApproved] = useState([])
  const [members, setMembers] = useState([])
  const [openingId, setOpeningId] = useState(null)
  const [detail, setDetail] = useState(null)

  const loadData = async () => {
    const { data } = await db.fetchPendingJourneyApprovals()
    const withOrders = await Promise.all((data || []).map(async a => {
      const { data: orders } = await db.fetchAllocationOrders(a.id)
      const { data: progress } = await db.fetchLoadItemProgress(a.id)
      const totalQtyLoaded = (progress || []).reduce((s, p) => s + (p.loaded_qty || 0), 0)
      return { allocation: a, orders: orders || [], totalQtyLoaded }
    }))
    setAllocations(withOrders)
    setLoaded(true)
  }
  if (!loaded) loadData()

  const loadApproved = async () => {
    const { data } = await db.fetchApprovedJourneys()
    setApproved(data || [])
  }

  useEffect(() => {
    db.fetchApprovedJourneys().then(({ data }) => setApproved(data || []))
    db.fetchMembers().then(({ data }) => setMembers(data || []))
  }, [])

  const approverName = a => members.find(m => m.id === a.journey_complete_approved_by)?.name || a.journey_complete_approved_by || '—'

  const approve = async (allocation) => {
    setBusyId(allocation.id)
    await db.approveJourneyComplete(allocation.id, currentUser?.member_id, remarksById[allocation.id] || '')
    db.logActivity(currentUser?.id, 'approve', 'allocation', `Approved journey complete — allocation #${allocation.id}`, allocation.id)
    setBusyId(null)
    await loadData()
    await loadApproved()
  }

  const openDetail = async (allocation) => {
    setOpeningId(allocation.id)
    const { data: orders } = await db.fetchAllocationOrders(allocation.id)
    const { data: progress } = await db.fetchLoadItemProgress(allocation.id)
    const totalQtyLoaded = (progress || []).reduce((s, p) => s + (p.loaded_qty || 0), 0)
    setOpeningId(null)
    setDetail({ allocation, orders: orders || [], totalQtyLoaded })
  }

  return (
    <div>
      <Card>
        <CH title="Journey Complete — Pending Approval" sub={`${allocations.length} allocation(s)`} />
        {allocations.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No journeys waiting for approval</div>}
      </Card>

      {allocations.map(({ allocation, orders, totalQtyLoaded }) => (
        <Card key={allocation.id}>
          <CH title={`${allocation.id} — ${allocation.vehicle?.vehicle_number || ''}`}
            sub={`Driver: ${allocation.driver?.name || '—'} · From ${allocation.warehouse?.name || '—'}`}
            right={
              <Btn sm onClick={() => printJourneyReport({ allocation, orders, totalQtyLoaded, remarks: remarksById[allocation.id] })}>
                ⬇ PDF
              </Btn>
            } />

          <JourneyVeinTimeline allocation={allocation} orders={orders} totalQtyLoaded={totalQtyLoaded} />

          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {RETURN_CHECKLIST_ITEMS.map(c => (
                <div key={c.key} style={{ fontSize: 12, fontWeight: 600, color: allocation[c.key] ? '#10b981' : '#ef4444' }}>
                  {allocation[c.key] ? '✓' : '✗'} {c.label}
                </div>
              ))}
            </div>

            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', margin: '12px 0 4px' }}>
              Approval Remarks
            </label>
            <textarea
              value={remarksById[allocation.id] || ''}
              onChange={e => setRemarksById(r => ({ ...r, [allocation.id]: e.target.value }))}
              placeholder="Optional notes for this approval..."
              rows={2}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
            />

            <Btn v="pri" full disabled={busyId === allocation.id} onClick={() => approve(allocation)} style={{ marginTop: 12 }}>
              {busyId === allocation.id ? 'Approving...' : 'Approve Journey Complete'}
            </Btn>
          </div>
        </Card>
      ))}

      <Card>
        <CH title="Approved Journey Completions" sub={`${approved.length} allocation(s)`} />
        {approved.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No approved journeys yet</div>}
        {approved.map(a => (
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
                Driver: {a.driver?.name || '—'} · Approved by {approverName(a)} · {fmtTs(a.journey_complete_approved_at)}
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>
              {openingId === a.id ? 'Loading…' : '›'}
            </div>
          </div>
        ))}
      </Card>

      {detail && (
        <Sheet
          title={`Journey Details — ${detail.allocation.id}`}
          sub={`${detail.allocation.vehicle?.vehicle_number || ''} · Driver: ${detail.allocation.driver?.name || '—'}`}
          onClose={() => setDetail(null)}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Btn sm onClick={() => printJourneyReport({
              allocation: detail.allocation, orders: detail.orders, totalQtyLoaded: detail.totalQtyLoaded,
              approvedBy: approverName(detail.allocation), remarks: detail.allocation.journey_complete_approval_remarks,
            })}>
              ⬇ PDF
            </Btn>
          </div>

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
    </div>
  )
}
