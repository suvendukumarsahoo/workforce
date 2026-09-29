import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Btn, Inp } from './ui.jsx'
import * as db from '../lib/db.js'

// Full-screen, blocking — mounted by App.jsx in place of PunchInGate/Routes whenever
// currentUser.must_change_password is true (a brand-new account, or one Admin just reset via
// Employees.jsx's "Reset Password"). Same wrap/card style convention as PunchInGate.jsx's own
// blocking screens. supabase.auth.updateUser({ password }) needs no elevated privilege — it's the
// currently-signed-in user changing their own password, the one password operation that's genuinely
// self-service — unlike creating a user or resetting someone ELSE's password, both of which need the
// admin-user-ops Edge Function (see db.js).
export default function ForcePasswordChange() {
  const { currentUser, refreshCurrentUser, logout } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const wrapStyle = { minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }
  const cardStyle = { background: '#fff', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%' }

  const submit = async () => {
    setError(null)
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setBusy(true)
    const { error: pwError } = await db.changeOwnPassword(newPassword)
    if (pwError) { setError(pwError.message); setBusy(false); return }
    await db.updateUser(currentUser.id, { must_change_password: false })
    await refreshCurrentUser()
    setBusy(false)
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Set a New Password</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {currentUser?.name ? `Welcome, ${currentUser.name} — ` : ''}you're using a temporary password. Set your own before continuing.
          </div>
        </div>
        <Inp label="New Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="At least 6 characters" req />
        <Inp label="Confirm New Password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password" req />
        {error && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>{error}</div>}
        <Btn v="pri" full disabled={busy} onClick={submit}>{busy ? 'Saving...' : 'Set Password & Continue'}</Btn>
        <Btn full onClick={logout} style={{ marginTop: 8 }}>Log Out Instead</Btn>
      </div>
    </div>
  )
}
