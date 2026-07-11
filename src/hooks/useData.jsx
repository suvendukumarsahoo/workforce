import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import * as db from '../lib/db'
import { computeAchievements, getGoalOverallStatus } from '../lib/achievementEngine'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { currentUser } = useAuth()

  const [roles,      setRoles]      = useState([])
  const [users,      setUsers]      = useState([])
  const [members,    setMembers]    = useState([])
  const [categories, setCategories] = useState([])
  const [products,   setProducts]   = useState([])
  const [customers,  setCustomers]  = useState([])
  const [params,     setParams]     = useState({})   // { [memberId]: param }
  const [goals,      setGoals]      = useState({})   // { [memberId]: goal }
  const [invoices,   setInvoices]   = useState([])
  const [expenses,   setExpenses]   = useState([])
  const [salaries,   setSalaries]   = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [toast,      setToast]      = useState(null)

  // Load all data on mount
  useEffect(() => {
    if (!currentUser) return
    loadAll()
  }, [currentUser])

  async function loadAll() {
    setLoading(true)
    const [
      { data: r }, { data: u }, { data: m }, { data: c }, { data: p },
      { data: cu }, { data: pa }, { data: g }, { data: inv }, { data: exp },
      { data: sal }, { data: att },
    ] = await Promise.all([
      db.fetchRoles(), db.fetchUsers(), db.fetchMembers(), db.fetchCategories(),
      db.fetchProducts(), db.fetchCustomers(), db.fetchParameters(), db.fetchGoals(),
      db.fetchInvoices(), db.fetchExpenses(), db.fetchSalaries(),
      db.fetchAttendance(new Date().getMonth()+1, new Date().getFullYear()),
    ])

    if (r)   setRoles(r)
    if (u)   setUsers(u)
    if (m)   setMembers(m)
    if (c)   setCategories(c)
    if (p)   setProducts(p)
    if (cu)  setCustomers(cu.map(c => ({ ...c, assignedTo: c.assignments?.map(a => a.member_id) || [] })))
    if (pa)  setParams(Object.fromEntries(pa.map(p => [p.member_id, p])))
    if (g)   {
      // Enrich goals with computed overall status
      const goalMap = {}
      g.forEach(goal => {
        goalMap[goal.member_id] = { ...goal, status: getGoalOverallStatus(goal) }
      })
      setGoals(goalMap)
    }
    if (inv) setInvoices(inv)
    if (exp) setExpenses(exp)
    if (sal) setSalaries(sal)
    if (att) setAttendance(att)
    setLoading(false)
  }

  // Achievement — pure computation from invoices + goals, no extra db call
  const achievements = useMemo(
    () => computeAchievements(invoices, goals, products),
    [invoices, goals, products]
  )

  function showToast(msg, duration = 2800) {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  return (
    <DataContext.Provider value={{
      roles, setRoles, users, setUsers, members, setMembers,
      categories, setCategories, products, setProducts,
      customers, setCustomers, params, setParams,
      goals, setGoals, invoices, setInvoices,
      expenses, setExpenses, salaries, setSalaries,
      attendance, setAttendance, achievements,
      loading, loadAll, toast, showToast,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
