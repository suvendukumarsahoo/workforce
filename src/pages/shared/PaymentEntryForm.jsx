import { useState } from 'react'
import { Sheet, Btn } from '../../components/ui.jsx'

export default function PaymentEntryForm({ lead, onClose, onSubmit, showToast }) {
  const [mode, setMode] = useState('')
  const [bankName, setBankName] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [branch, setBranch] = useState('')
  const [txnDate, setTxnDate] = useState('')
  const [amount, setAmount] = useState('')
  const [txnId, setTxnId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)

  const fieldStyle = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }

  const handleSubmit = async () => {
    if (!mode) { showToast('Select mode of payment'); return }
    if (!bankName.trim()) { showToast('Bank name is required'); return }
    if (!ifsc.trim()) { showToast('IFSC code is required'); return }
    if (!branch.trim()) { showToast('Bank branch is required'); return }
    if (!txnDate) { showToast('Transaction date is required'); return }
    if (!amount || Number(amount) <= 0) { showToast('Enter a valid transaction amount'); return }
    if (!txnId.trim()) { showToast('Transaction ID is required'); return }

    setSaving(true)
    await onSubmit({
      mode_of_payment: mode, bank_name: bankName, ifsc_code: ifsc, bank_branch: branch,
      transaction_date: txnDate, transaction_amount: Number(amount), transaction_id: txnId,
      remarks: remarks || null,
    })
    setSaving(false)
  }

  return (
    <Sheet title="Payment Entry Details" sub={lead.name} onClose={onClose}>
      <label style={labelStyle}>Mode of Payment</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {['Cash', 'Cheque', 'NEFT', 'RTGS', 'UPI'].map(m => (
          <Btn key={m} v={mode === m ? 'pri' : ''} sm onClick={() => setMode(m)}>{m}</Btn>
        ))}
      </div>

      <label style={labelStyle}>Bank Name</label>
      <input value={bankName} onChange={e => setBankName(e.target.value)} style={fieldStyle} />

      <label style={labelStyle}>IFSC Code</label>
      <input value={ifsc} onChange={e => setIfsc(e.target.value)} style={fieldStyle} />

      <label style={labelStyle}>Bank Branch</label>
      <input value={branch} onChange={e => setBranch(e.target.value)} style={fieldStyle} />

      <label style={labelStyle}>Transaction Date</label>
      <input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} style={fieldStyle} />

      <label style={labelStyle}>Transaction Amount (₹)</label>
      <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={fieldStyle} />

      <label style={labelStyle}>Transaction ID</label>
      <input value={txnId} onChange={e => setTxnId(e.target.value)} style={fieldStyle} />

      <label style={labelStyle}>Remarks</label>
      <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} style={fieldStyle} />

      <Btn v="pri" full onClick={handleSubmit}>{saving ? 'Submitting...' : 'Submit'}</Btn>
    </Sheet>
  )
}