import { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react'
import { useAuth } from './useAuth'
import * as db from '../lib/db'
import { computeAchievements, getGoalOverallStatus } from '../lib/achievementEngine'
import { getCurrentPeriod, monthRangeForPeriod } from '../lib/period'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { currentUser } = useAuth()

  const [roles,        setRoles]        = useState([])
  const [users,        setUsers]        = useState([])
  const [members,      setMembers]      = useState([])
  const [categories,   setCategories]   = useState([])
  const [products,     setProducts]     = useState([])
  const [distributors, setDistributors] = useState([])
  const [params,       setParams]       = useState({})
  const [goals,        setGoals]        = useState({})
  const [invoices,     setInvoices]     = useState([])
  const [expenses,     setExpenses]     = useState([])
  const [salaries,     setSalaries]     = useState([])
  const [attendance,   setAttendance]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [toast,        setToast]        = useState(null)
  const [visits, setVisits] = useState([])
  const [retailVisits, setRetailVisits] = useState([])
  const [retailOutlets, setRetailOutlets] = useState([])
  const [secondaryOrders, setSecondaryOrders] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [payments, setPayments] = useState([])
  const [approvedAttendanceRules, setApprovedAttendanceRules] = useState([])
  const [currentPeriod] = useState(getCurrentPeriod())
  const loadingRef = useRef(false) // guards against overlapping loadAll() calls

  useEffect(() => {
    if (!currentUser) return
    loadAll()

    // Nothing in this app pushes live updates for ordinary business data (only
    // vehicle_locations/distributor_celebrations use Supabase Realtime) — so
    // without this, one user's change is invisible to everyone else already
    // logged in until something happens to force a refetch. Cover that with a
    // silent background refresh: immediately when a tab regains focus (the
    // common "switched tabs, came back, other user's change isn't here yet"
    // case), plus a floor poll for tabs simply left open. Both call loadAll(true)
    // — silent means it updates state in place and never touches `loading`,
    // so it can never unmount/reset whatever the user is doing on screen.
    function onVisible() {
      if (document.visibilityState === 'visible') loadAll(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(() => loadAll(true), 60000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(poll)
    }
  }, [currentUser])

  async function loadAll(silent = false) {
    if (loadingRef.current) return // a refresh is already in flight — skip, don't stack
    loadingRef.current = true
    if (!silent) setLoading(true)
    try {
    const [
  { data: r }, { data: u }, { data: m }, { data: c }, { data: p },
  { data: dist }, { data: pa }, { data: g }, { data: inv }, { data: exp },
  { data: sal }, { data: att }, { data: vis }, { data: reg }, { data: pay },
  { data: rvis }, { data: routs }, { data: sord }, { data: attRules },
] = await Promise.all([
  db.fetchRoles(), db.fetchUsers(), db.fetchMembers(), db.fetchCategories(),
  db.fetchProducts(), db.fetchDistributors(), db.fetchParameters(currentPeriod), db.fetchGoals(currentPeriod),
  db.fetchInvoices(), db.fetchExpenses(), db.fetchSalaries(),
  db.fetchAttendance(new Date().getMonth()+1, new Date().getFullYear()),
  db.fetchVisits(), db.fetchRegistrations(), db.fetchPayments(),
  db.fetchRetailVisits(), db.fetchRetailOutlets(), db.fetchSecondaryOrders(),
  db.fetchAttendanceRules(),
])

    if (r)    setRoles(r)
    if (u)    setUsers(u)
    if (m)    setMembers(m)
    if (c)    setCategories(c)
    if (p)    setProducts(p)
    if (dist) setDistributors(dist.map(d => ({ ...d, assignedTo: d.assignments?.map(a => a.member_id) || [] })))
    if (pa)   setParams(Object.fromEntries(pa.map(p => [p.member_id, p])))
      if (vis) setVisits(vis)
        if (reg) setRegistrations(reg)
          if (pay) setPayments(pay)
          if (rvis) setRetailVisits(rvis)
          if (routs) setRetailOutlets(routs)
          if (sord) setSecondaryOrders(sord)
          if (attRules) setApprovedAttendanceRules(attRules.filter(rr => rr.status === 'approved'))
    if (g)   {
      const goalMap = {}
      g.forEach(goal => {
      const memberParam = (pa || []).find(p => p.member_id === goal.member_id)
      goalMap[goal.member_id] = { ...goal, status: getGoalOverallStatus(goal, memberParam) }      })
      setGoals(goalMap)
    }
    if (inv) setInvoices(inv)
    if (exp) setExpenses(exp)
    if (sal) setSalaries(sal)
    if (att) setAttendance(att)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }

  const achievements = useMemo(
  () => computeAchievements(invoices, goals, products, distributors, visits, retailVisits, retailOutlets, secondaryOrders, monthRangeForPeriod(currentPeriod)),
  [invoices, goals, products, distributors, visits, retailVisits, retailOutlets, secondaryOrders, currentPeriod]
)

  function showToast(msg, duration = 2800) {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  return (
    <DataContext.Provider value={{
      roles, setRoles, users, setUsers, members, setMembers,
      categories, setCategories, products, setProducts,
      distributors, setDistributors, params, setParams,
      goals, setGoals, invoices, setInvoices,
      expenses, setExpenses, salaries, setSalaries,
      attendance, setAttendance, achievements,
      visits, setVisits,
      retailVisits, setRetailVisits,
      retailOutlets, setRetailOutlets,
      secondaryOrders, setSecondaryOrders,
      registrations, setRegistrations,
      loading, loadAll, toast, showToast,payments, setPayments,
      currentPeriod, approvedAttendanceRules,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)