import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Inp } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function NewCustomerVisit() {
  const { currentUser } = useAuth()
  const { distributors, showToast, loadAll } = useData()
  const mid = currentUser?.member_id

  const [dueFollowups, setDueFollowups] = useState([])
  const [mode, setMode] = useState('new')          // 'new' | 'existing'
  const [selectedId, setSelectedId] = useState('')  // existing distributor id
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [personalInfo, setPersonalInfo] = useState('')
  const [businessInfo, setBusinessInfo] = useState('')
  const [outcome, setOutcome] = useState('')        // 'interested' | 'not_interested' | 'final'
  const [followupDate, setFollowupDate] = useState('')
  const [saving, setSaving] = useState(false)

  const myLeads = (distributors || []).filter(d =>
    (d.assignedTo || []).includes(mid) && d.lead_stage && d.lead_stage !== 'not_interested'
  )

  useEffect(() => { loadDue() }, [])

  async function loadDue() {
    const { data } = await db.fetchDueFollowups()
    setDueFollowups((data || []).filter(d => (d.assignedTo || []).includes(mid) || true))
  }

  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 8000 }
      )
    })
  }

  async function confirmLocation() {
    const atLocation = window.confirm('Are you at the Distributor Point?')
    if (!atLocation) return null

    const typed = window.prompt('Type "Yes" to confirm and capture your location:')
    if (!typed || typed.trim().toLowerCase() !== 'yes') return null

    return await getLocation()
  }

  function resetForm() {
    setMode('new'); setSelectedId(''); setName(''); setArea('')
    setPersonalInfo(''); setBusinessInfo(''); setOutcome(''); setFollowupDate('')
  }

  async function submitVisit() {
    if (!outcome) { showToast('Select an outcome'); return }
    if (outcome === 'interested' && !followupDate) { showToast('Set a follow-up date'); return }
    setSaving(true)
    const loc = await confirmLocation()

    let distributorId = selectedId

    if (mode === 'new') {
      if (!name) { showToast('Enter customer name'); setSaving(false); return }
      const id = 'C' + Date.now().toString(36).toUpperCase()
      const { error } = await db.createDistributor(
        { id, name, area, type: 'New Customer', lead_stage: outcome === 'not_interested' ? 'not_interested' : outcome === 'final' ? 'final_pending' : 'interested',
          next_followup_date: outcome === 'interested' ? followupDate : null,
          personal_info: { note: personalInfo }, business_info: { note: businessInfo } },
        [mid]
      )
      if (error) { showToast('Error saving customer'); setSaving(false); return }
      distributorId = id
    } else {
      const stage = outcome === 'not_interested' ? 'not_interested' : outcome === 'final' ? 'final_pending' : 'interested'
      const { error } = await db.updateDistributorLeadStage(distributorId, {
        lead_stage: stage,
        next_followup_date: outcome === 'interested' ? followupDate : null,
      })
      if (error) { showToast('Error updating customer'); setSaving(false); return }
    }

    const { error: visitError } = await db.createVisit({
      distributor_id: distributorId,
      member_id: mid,
      outcome,
      notes: mode === 'new' ? `${personalInfo} ${businessInfo}`.trim() : '',
      next_followup_date: outcome === 'interested' ? followupDate : null,
      latitude: loc?.latitude || null,
      longitude: loc?.longitude || null,
    })
    if (visitError) { showToast('Error logging visit'); setSaving(false); return }

    await loadAll()
    await loadDue()
    resetForm()
    setSaving(false)
    showToast('Visit logged successfully')
  }

  return (
    <div>
      {dueFollowups.length > 0 && (
        <Card style={{ marginBottom: 16, background: '#fffbeb', border: '1px solid #fde68a' }}>
          <CH title="Follow-ups due" sub="Tap to log today's visit" />
          {dueFollowups.map(d => (
            <div key={d.id} onClick={() => { setMode('existing'); setSelectedId(d.id) }}
              style={{ padding: '10px 14px', borderBottom: '1px solid #fde68a', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
              <span style={{ fontSize: 11, color: '#92400e' }}>Due: {d.next_followup_date}</span>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <CH title="New Customer Visit" sub="Log a visit and update lead status" />
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <Btn v={mode === 'new' ? 'pri' : ''} full onClick={() => { setMode('new'); setSelectedId('') }}>New Customer</Btn>
            <Btn v={mode === 'existing' ? 'pri' : ''} full onClick={() => setMode('existing')}>Existing Customer</Btn>
          </div>

          {mode === 'new' ? (
            <>
              <Inp label="Customer name" value={name} onChange={setName} placeholder="Business or contact name" />
              <Inp label="Area / Region" value={area} onChange={setArea} placeholder="Location" />
              <Inp label="Personal information" value={personalInfo} onChange={setPersonalInfo} placeholder="Notes" />
              <Inp label="Business information" value={businessInfo} onChange={setBusinessInfo} placeholder="Notes" />
            </>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Select customer</label>
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit' }}>
                <option value="">— Select —</option>
                {myLeads.map(d => <option key={d.id} value={d.id}>{d.name} ({d.lead_stage})</option>)}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Visit outcome</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn v={outcome === 'interested' ? 'pri' : ''} full onClick={() => setOutcome('interested')}>Interested</Btn>
              <Btn v={outcome === 'not_interested' ? 'pri' : ''} full onClick={() => setOutcome('not_interested')}>Not Interested</Btn>
              <Btn v={outcome === 'final' ? 'pri' : ''} full onClick={() => setOutcome('final')}>Final</Btn>
            </div>
          </div>

          {outcome === 'interested' && (
            <Inp label="Next follow-up date" type="date" value={followupDate} onChange={setFollowupDate} />
          )}

          <Btn v="pri" full onClick={submitVisit}>{saving ? 'Saving...' : 'Submit visit'}</Btn>
        </div>
      </Card>
    </div>
  )
}