import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Btn, Inp } from '../components/ui.jsx'

export default function Login() {
  const { login } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleLogin() {
    if (!email || !password) { setError('Enter email and password'); return }
    setLoading(true)
    setError('')
    const { error: err } = await login(email, password)
    if (err) { setError('Invalid email or password'); setLoading(false) }
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#1e293b 0%,#1d4ed8 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
          <div style={{ fontWeight: 800, fontSize: 24, color: '#0f172a' }}>WorkForce</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Sales · Targets · Expenses · HR</div>
        </div>

        {/* Form */}
        <Inp
          label="Email address"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          req
        />
        <div onKeyDown={handleKey}>
          <Inp
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            req
          />
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, padding: '8px 10px', background: '#fef2f2', borderRadius: 8 }}>
            ⚠️ {error}
          </div>
        )}

        <Btn v="pri" full onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in →'}
        </Btn>

        {/* Help text */}
        <div style={{ marginTop: 20, padding: 12, background: '#f8fafc', borderRadius: 10, fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
          Contact your administrator if you cannot log in.
        </div>
      </div>
    </div>
  )
}
