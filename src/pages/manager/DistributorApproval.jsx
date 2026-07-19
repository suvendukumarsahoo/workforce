import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const PIPELINE_STAGES = ['final_pending', 'registration_pending', 'documents_submitted', 'documentation_verification', 'payment_pending', 'payment_verification', 'final_approved']

const stageLabels = {
  final_pending: 'Final — Awaiting Manager Approval',
  registration_pending: 'Registration Pending',
  documents_submitted: 'Document Submitted',
  documentation_verification: 'Distributor Registration Under Process',
  payment_pending: 'Awaiting Payment',
  payment_verification: 'Payment Under Verification',
  final_approved: 'Distributor',
}

const timeAgo = (isoDate) => {
  if (!isoDate) return ''
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function DistributorApproval() {
  const { role } = useAuth()
  const { distributors, visits, members, showToast, loadAll } = useData()
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [resendNote, setResendNote] = useState('')
  const isAdmin = role?.name === 'Admin'

  const pipelineLeads = (distributors || []).filter(d => PIPELINE_STAGES.includes(d.lead_stage))

  const approve = async (lead) => {
    const { error: regError } = await db.createRegistration({
      distributor_id: lead.id,
      member_id: (lead.assignedTo || [])[0],
    })
    if (regError) { showToast('Error creating registration'); return }
    const { error } = await db.updateDistributorLeadStage(lead.id, { lead_stage: 'registration_pending' })
    if (error) { showToast('Error updating lead'); return }
    await loadAll()
    setSelected(null); setNote('')
    showToast('Approved — registration form sent to team member')
  }

  const reject = async (lead) => {
    const { error } = await db.updateDistributorLeadStage(lead.id, { lead_stage: 'interested' })
    if (error) { showToast('Error updating lead'); return }
    await db.createVisit({
      distributor_id: lead.id, member_id: (lead.assignedTo || [])[0],
      outcome: 'interested', notes: `Final rejected by manager: ${note}`,
    })
    await loadAll()
    setSelected(null); setNote('')
    showToast('Rejected — sent back to Interested')
  }

  const acknowledgeReceipt = async (lead) => {
    const { error } = await db.updateDistributorLeadStage(lead.id, { lead_stage: 'documentation_verification' })
    if (error) { showToast('Error updating'); return }
    await loadAll()
    setSelected(null)
    showToast('Acknowledged — under process')
  }

  const resendForRevision = async (lead) => {
    if (!resendNote.trim()) { showToast('Add a comment before resending'); return }
    const { error } = await db.updateDistributorLeadStage(lead.id, { lead_stage: 'registration_pending', resend_note: resendNote })
    if (error) { showToast('Error updating'); return }
    await loadAll()
    setSelected(null); setResendNote('')
    showToast('Sent back to team member for resubmission')
  }

  const approveForPayment = async (lead) => {
    const { error } = await db.updateDistributorLeadStage(lead.id, { lead_stage: 'payment_pending' })
    if (error) { showToast('Error updating'); return }
    await loadAll()
    setSelected(null)
    showToast('Approved — payment window opened')
  }
  return (
    <div>
      <Card>
        <CH title="New Distributor Approval" sub={`${pipelineLeads.length} lead(s) in pipeline`} />
        {pipelineLeads.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No leads in pipeline</div>}
        {pipelineLeads.map(d => {
          const ownerId = (d.assignedTo || [])[0]
          const owner = (members || []).find(m => m.id === ownerId)
          return (
            <div key={d.id} onClick={() => setSelected(d)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{d.area || '—'} · {owner?.name || 'Unassigned'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>{stageLabels[d.lead_stage] || d.lead_stage}</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>{timeAgo(d.stage_updated_at)}</div>
              </div>
            </div>
          )
        })}
      </Card>

      {selected && (
        <Sheet title={selected.name} sub={stageLabels[selected.lead_stage] || selected.lead_stage} onClose={() => setSelected(null)}>

          {(selected.mobile_no || selected.town || selected.district) && (
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Confirmed Details</div>
              {selected.mobile_no && <div style={{ fontSize: 12, color: '#374151', marginBottom: 3 }}>Mobile: {selected.mobile_no}</div>}
              {(selected.town || selected.district) && <div style={{ fontSize: 12, color: '#374151', marginBottom: 3 }}>{selected.town}{selected.town && selected.district ? ', ' : ''}{selected.district}</div>}
              {selected.nearby_wd_30km === 'Yes' && <div style={{ fontSize: 12, color: '#374151', marginBottom: 3 }}>Nearby WD: {selected.nearby_wd_name} ({selected.nearby_wd_town})</div>}
              {selected.confirmed_latitude && selected.confirmed_longitude && (
                <a href={`https://www.google.com/maps?q=${selected.confirmed_latitude},${selected.confirmed_longitude}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: '#2563eb', display: 'inline-block', marginTop: 4 }}>
                  📍 View confirmed location on map
                </a>
              )}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Visit history</div>
            {(visits || []).filter(v => v.distributor_id === selected.id).length === 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>No visits recorded</div>
            )}
            {(visits || []).filter(v => v.distributor_id === selected.id).map(v => (
              <div key={v.id} style={{ padding: '8px 4px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{v.outcome?.replace('_', ' ')}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(v.visit_date).toLocaleDateString('en-IN')}</span>
                </div>
                {v.notes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{v.notes}</div>}
              </div>
            ))}
          </div>

          {!isAdmin && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, fontSize: 12, color: '#1e40af' }}>
              View only — no action needed from Manager at this stage.
            </div>
          )}

          {isAdmin && selected.lead_stage === 'final_pending' && (
            <>
              <div style={{ marginBottom: 14, marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Note (required if rejecting)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn v="pri" full onClick={() => approve(selected)}>Approve</Btn>
                <Btn full onClick={() => { if (!note) { showToast('Add a note before rejecting'); return }; reject(selected) }}>Reject</Btn>
              </div>
            </>
          )}

          {isAdmin && selected.lead_stage === 'documents_submitted' && (
            <Btn v="pri" full onClick={() => acknowledgeReceipt(selected)} style={{ marginTop: 14 }}>Acknowledge Receipt</Btn>
          )}

          {isAdmin && selected.lead_stage === 'documentation_verification' && (
            <>
              <div style={{ marginBottom: 14, marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Comment (required for ReSend)</label>
                <textarea value={resendNote} onChange={e => setResendNote(e.target.value)} rows={3}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn full onClick={() => resendForRevision(selected)}>ReSend</Btn>
                <Btn v="pri" full onClick={() => approveForPayment(selected)}>Approved for Payment</Btn>
              </div>
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}
