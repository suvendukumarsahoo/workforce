import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { getSession, onAuthChange, fetchCurrentUser, signIn, signOut } from '../lib/db'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,     setSession]     = useState(undefined) // undefined = loading
  const [currentUser, setCurrentUser] = useState(null)
  const [loading,     setLoading]     = useState(true)
  // Tracks whether we've ever finished a user load. App.jsx unmounts the
  // entire app tree (losing any in-progress form/cart state) while `loading`
  // is true, so only the very first load is allowed to set it — every load
  // after that must be silent. Without this, Supabase's automatic background
  // token refresh (which fires onAuthStateChange with TOKEN_REFRESHED every
  // time a backgrounded tab regains focus) was re-triggering the splash
  // screen and blowing away whatever the user was doing.
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    // Get initial session
    getSession().then(({ data: sess }) => {
      setSession(sess)
      if (sess?.user) loadUser(sess.user.id)
      else { hasLoadedRef.current = true; setLoading(false) }
    })

    // Listen for auth changes — fires on real sign-in/sign-out, but also on
    // silent background token refreshes. A token refresh only ever concerns
    // the already-signed-in user, so it never needs to re-fetch the user row
    // or touch `loading`/the app's render tree.
    const unsub = onAuthChange((event, sess) => {
      setSession(sess)
      if (event === 'TOKEN_REFRESHED') return
      if (sess?.user) loadUser(sess.user.id)
      else { setCurrentUser(null); hasLoadedRef.current = true; setLoading(false) }
    })

    return unsub
  }, [])

  async function loadUser(authId) {
    if (!hasLoadedRef.current) setLoading(true)
    const { data, error } = await fetchCurrentUser(authId)
    if (!error && data) setCurrentUser(data)
    hasLoadedRef.current = true
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
