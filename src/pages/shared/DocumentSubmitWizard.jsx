import { useState, useEffect } from 'react'
import { Sheet, Btn } from '../../components/ui.jsx'

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function DocumentSubmitWizard({ lead, visits, onClose, onSubmit, showToast }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState(lead.name || '')
  const [currentLoc, setCurrentLoc] = useState(null)
  const [locStatus, setLocStatus] = useState(null) // checking | near | far | none
  const [farConfirming, setFarConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [confirmedLat, setConfirmedLat] = useState(lead.confirmed_latitude || null)
  const [confirmedLng, setConfirmedLng] = useState(lead.confirmed_longitude || null)
  const [town, setTown] = useState(lead.town || '')
  const [district, setDistrict] = useState(lead.district || '')
  const [mobileNo, setMobileNo] = useState(lead.mobile_no || lead.phone_no || '')
  const [nearbyWd, setNearbyWd] = useState(lead.nearby_wd_30km || '')
  const [wdName, setWdName] = useState(lead.nearby_wd_name || '')
  const [wdTown, setWdTown] = useState(lead.nearby_wd_town || '')

  const originalVisit = (visits || []).find(v => v.latitude && v.longitude)

  useEffect(() => { if (step === 2) checkLocation() }, [step])

  const checkLocation = () => {
    setLocStatus('checking')
    if (!navigator.geolocation) { setLocStatus('none'); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const cur = {latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        setCurrentLoc(cur)
        if (originalVisit) {
          const dist = haversineMeters(originalVisit.latitude, originalVisit.longitude, cur.latitude, cur.longitude)
          setLocStatus(dist <= 100 ? 'near' : 'far')
        } else {
          setLocStatus('far')
        }
      },
      () => setLocStatus('none'),
      { timeout: 8000 }
    )
  }

  const confirmNear = () => {
    setConfirmedLat(originalVisit.latitude)
    setConfirmedLng(originalVisit.longitude)
    setStep(3)
  }

  const finalizeFarConfirm = () => {
    if (confirmText.trim().toLowerCase() !== 'yes') { showToast('Type "yes" to confirm'); return }
    if (!currentLoc) { showToast('Location not available'); return }
    setConfirmedLat(currentLoc.latitude)
    setConfirmedLng(currentLoc.longitude)
    setStep(3)
  }

  const goStep3 = () => {
    if (!name.trim()) { showToast('Enter the distributor name'); return }
    setStep(2)
  }
  const goStep4 = () => {
    if (!town.trim() || !district.trim()) { showToast('Town and District are required'); return }
    setStep(4)
  }
  const goStep5 = () => {
    if (!mobileNo.trim()) { showToast('Mobile number is required'); return }
    setStep(5)
  }
  const handleFinalSubmit = () => {
    if (!nearbyWd) { showToast('Select Yes or No'); return }
    if (nearbyWd === 'Yes' && (!wdName.trim() || !wdTown.trim())) { showToast('Enter distributor name and town'); return }
    onSubmit({
      name, mobile_no: mobileNo, town, district,
      confirmed_latitude: confirmedLat, confirmed_longitude: confirmedLng,
      nearby_wd_30km: nearbyWd, nearby_wd_name: nearbyWd === 'Yes' ? wdName : '', nearby_wd_town: nearbyWd === 'Yes' ? wdTown : '',
    })
  }

  const fieldStyle = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }

  return (
    <Sheet title="Submit Registration & Documents" sub={`Step ${step} of 5`} onClose={onClose}>
      {step === 1 && (
        <div>
          <label style={labelStyle}>Confirm Distributor Name (as per GST/PAN)</label>
          <input value={name} onChange={e => setName(e.target.value)} style={fieldStyle} />
          <Btn v="pri" full onClick={goStep3}>Confirm</Btn>
        </div>
      )}

      {step === 2 && (
        <div>
          {locStatus === 'checking' && <div style={{ textAlign: 'center', padding: 20, color: '#6b7280', fontSize: 13 }}>Checking your location...</div>}
          {locStatus === 'near' && (
            <div>
              <div style={{ fontSize: 13, color: '#10b981', marginBottom: 14 }}>✅ You're near the recorded distributor location.</div>
              <Btn v="pri" full onClick={confirmNear}>Proceed</Btn>
            </div>
          )}
          {(locStatus === 'far' || locStatus === 'none') && !farConfirming && (
            <div>
              <div style={{ fontSize: 13, color: '#92400e', marginBottom: 14 }}>
                {locStatus === 'none' ? 'Location unavailable.' : "This doesn't match the recorded distributor location."} Are you at the Distributor point?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn v="pri" full onClick={() => setFarConfirming(true)}>Yes</Btn>
                <Btn full onClick={onClose}>No</Btn>
              </div>
            </div>
          )}
          {(locStatus === 'far' || locStatus === 'none') && farConfirming && (
            <div>
              <div style={{ fontSize: 13, color: '#991b1b', marginBottom: 10 }}>
                This location is different from your earlier recorded location. Change to current location — type "yes" to confirm.
              </div>
              <input value={confirmText} onChange={e => setConfirmText(e.target.value)} style={fieldStyle} placeholder='Type "yes"' />
              <Btn v="pri" full onClick={finalizeFarConfirm}>Confirm</Btn>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <label style={labelStyle}>Town</label>
          <input value={town} onChange={e => setTown(e.target.value)} style={fieldStyle} />
          <label style={labelStyle}>District</label>
          <input value={district} onChange={e => setDistrict(e.target.value)} style={fieldStyle} />
          <Btn v="pri" full onClick={goStep4}>Next</Btn>
        </div>
      )}

      {step === 4 && (
        <div>
          <label style={labelStyle}>Mobile Number *</label>
          <input value={mobileNo} onChange={e => setMobileNo(e.target.value)} style={fieldStyle} placeholder="10-digit mobile number" />
          <Btn v="pri" full onClick={goStep5}>Next</Btn>
        </div>
      )}

      {step === 5 && (
        <div>
          <label style={labelStyle}>Is there any Distributor within 30km?</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Btn v={nearbyWd === 'Yes' ? 'pri' : ''} full onClick={() => setNearbyWd('Yes')}>Yes</Btn>
            <Btn v={nearbyWd === 'No' ? 'pri' : ''} full onClick={() => setNearbyWd('No')}>No</Btn>
          </div>
          {nearbyWd === 'Yes' && (
            <>
              <label style={labelStyle}>Name of Distributor</label>
              <input value={wdName} onChange={e => setWdName(e.target.value)} style={fieldStyle} />
              <label style={labelStyle}>Town</label>
              <input value={wdTown} onChange={e => setWdTown(e.target.value)} style={fieldStyle} />
            </>
          )}
          <Btn v="pri" full onClick={handleFinalSubmit}>Submit</Btn>
        </div>
      )}
    </Sheet>
  )
}