import { createContext, useContext, useEffect, useState } from 'react'
import { getSession, onAuthChange, fetchCurrentUser, signIn, signOut } from '../lib/db'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,     setSession]     = useState(undefined) // undefined = loading
  const [currentUser, setCurrentUser] = useState(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    // Get initial session
    getSession().then(({ data: sess }) => {
      setSession(sess)
      if (sess?.user) loadUser(sess.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const unsub = onAuthChange(sess => {
      setSession(sess)
      if (sess?.user) loadUser(sess.user.id)
      else { setCurrentUser(null); setLoading(false) }
    })

    return unsub
  }, [])

  async function loadUser(authId) {
    setLoading(true)
    const { data, error } = await fetchCurrentUser(authId)
    if (!error && data) setCurrentUser(data)
    setLoading(false)
  }

  async function login(email, password) {
    const { data, error } = await signIn(email, password)
    return { data, error }
  }

  async function logout() {
    await signOut()
    setCurrentUser(null)
  }

  // Role helpers
  const role      = currentUser?.role || {}
  const menus     = role.menus    || []
  const actions   = role.actions  || {}
  const can       = act => !!actions[act]
  const hasMenu   = id  => menus.includes(id)
  const isTeam    = menus.includes('myGoals') && !menus.includes('dashboard')
  const memberId  = currentUser?.member_id || null

  return (
    <AuthContext.Provider value={{ session, currentUser, loading, login, logout, role, menus, can, hasMenu, isTeam, memberId }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
