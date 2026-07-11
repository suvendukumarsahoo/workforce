import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import { useData } from './hooks/useData.jsx'
import { Toast } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import TeamApp from './pages/team/TeamApp.jsx'
import WebApp from './pages/WebApp.jsx'

export default function App() {
  const { currentUser, loading: authLoading } = useAuth()
  const { toast } = useData()

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>Loading WorkForce...</div>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        {toast && <Toast msg={toast} />}
      </>
    )
  }

  // Determine if user is a team member (only has team menus)
  const menus = currentUser?.role?.menus || []
  const isTeam = menus.includes('myGoals') && !menus.includes('parameters')

  return (
    <>
      <Routes>
        {isTeam
          ? <Route path="/*" element={<TeamApp />} />
          : <Route path="/*" element={<WebApp />} />
        }
        <Route path="/login" element={<Navigate to="/" replace />} />
      </Routes>
      {toast && <Toast msg={toast} />}
    </>
  )
}
