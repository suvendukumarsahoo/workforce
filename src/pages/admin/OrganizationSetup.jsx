import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Inp } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

const fmtTs = ts => ts ? new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null

// Singleton company profile — one row (organization.id=1, seeded by the schema migration), no list/
// create/delete, just fetch-then-update, same shape any future singleton-config screen in this app
// should follow. Used today purely as a system-of-record for the company's own statutory details;
// not yet wired into PDF exports (Invoice/Order/Journey/etc. all still hardcode "WorkForce" as their
// header) — a natural next step, deliberately not done in this pass.
export default function OrganizationSetup() {
  const { currentUser, can } = useAuth()
  const { showToast } = useData()
  const [org, setOrg] = useState(null)
  const [d, setD] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    db.fetchOrganization().then(({ data }) => { setOrg(data); setD(data || {}) })
  }, [])

  const set = (k, v) => setD(x => ({ ...x, [k]: v }))

  const save = async () => {
    setSaving(true)
    const { data, error } = await db.updateOrganization({
      legal_name: d.legal_name || null,
      trade_name: d.trade_name || null,
      address_line1: d.address_line1 || null,
      address_line2: d.address_line2 || null,
      city: d.city || null,
      state: d.state || null,
      pincode: d.pincode || null,
      country: d.country || 'India',
      phone: d.phone || null,
      email: d.email || null,
      website: d.website || null,
      gstin: d.gstin || null,
      pan: d.pan || null,
      cin: d.cin || null,
      tan: d.tan || null,
    }, currentUser?.id)
    setSaving(false)
    if (error) { showToast('Error saving organization details'); return }
    setOrg(data)
    setD(data)
    showToast('Organization details saved')
  }

  if (org === null) return <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>

  const readOnly = !can('edit')

  return (
    <div>
      <Card>
        <CH title="Organization Details" sub={org.updated_at ? `Last updated ${fmtTs(org.updated_at)}` : 'Not set up yet'} />
        <div style={{ padding: 14 }}>
          <Inp label="Legal Name" value={d.legal_name} onChange={v => set('legal_name', v)} req disabled={readOnly} />
          <Inp label="Trade Name (if different)" value={d.trade_name} onChange={v => set('trade_name', v)} disabled={readOnly} />
        </div>
      </Card>

      <Card>
        <CH title="Registered Address" />
        <div style={{ padding: 14 }}>
          <Inp label="Address Line 1" value={d.address_line1} onChange={v => set('address_line1', v)} disabled={readOnly} />
          <Inp label="Address Line 2" value={d.address_line2} onChange={v => set('address_line2', v)} disabled={readOnly} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Inp label="City" value={d.city} onChange={v => set('city', v)} disabled={readOnly} /></div>
            <div style={{ flex: 1 }}>
              <Inp label="State" value={d.state} onChange={v => set('state', v)} disabled={readOnly}
                options={[{ value: '', label: 'Select state...' }, ...INDIAN_STATES.map(s => ({ value: s, label: s }))]} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Inp label="PIN Code" value={d.pincode} onChange={v => set('pincode', v)} disabled={readOnly} /></div>
            <div style={{ flex: 1 }}><Inp label="Country" value={d.country || 'India'} onChange={v => set('country', v)} disabled={readOnly} /></div>
          </div>
        </div>
      </Card>

      <Card>
        <CH title="Statutory Details" />
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Inp label="GSTIN" value={d.gstin} onChange={v => set('gstin', v.toUpperCase())} placeholder="22AAAAA0000A1Z5" disabled={readOnly} /></div>
            <div style={{ flex: 1 }}><Inp label="PAN" value={d.pan} onChange={v => set('pan', v.toUpperCase())} placeholder="AAAAA0000A" disabled={readOnly} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Inp label="CIN / LLPIN" value={d.cin} onChange={v => set('cin', v.toUpperCase())} helper="Only if registered as a Company or LLP" disabled={readOnly} /></div>
            <div style={{ flex: 1 }}><Inp label="TAN" value={d.tan} onChange={v => set('tan', v.toUpperCase())} helper="Only if you deduct TDS" disabled={readOnly} /></div>
          </div>
        </div>
      </Card>

      <Card>
        <CH title="Contact" />
        <div style={{ padding: 14 }}>
          <Inp label="Phone" value={d.phone} onChange={v => set('phone', v)} disabled={readOnly} />
          <Inp label="Email" value={d.email} onChange={v => set('email', v)} disabled={readOnly} />
          <Inp label="Website" value={d.website} onChange={v => set('website', v)} placeholder="https://" disabled={readOnly} />
        </div>
      </Card>

      {!readOnly && (
        <Btn v="pri" full disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</Btn>
      )}
    </div>
  )
}
