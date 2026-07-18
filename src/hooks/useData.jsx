import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { useAuth } from './useAuth'
import * as db from '../lib/db'
import { computeAchievements, getGoalOverallStatus } from '../lib/achievementEngine'

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

  useEffect(() => {
    if (!currentUser) return
    loadAll()
  }, [currentUser])

  async function loadAll() {
    setLoading(true)
    const [
  { data: r }, { data: u }, { data: m }, { data: c }, { data: p },
  { data: dist }, { data: pa }, { data: g }, { data: inv }, { data: exp },
  { data: sal }, { data: att }, { data: vis },
] = await Promise.all([
  db.fetchRoles(), db.fetchUsers(), db.fetchMembers(), db.fetchCategories(),
  db.fetchProducts(), db.fetchDistributors(), db.fetchParameters(), db.fetchGoals(),
  db.fetchInvoices(), db.fetchExpenses(), db.fetchSalaries(),
  db.fetchAttendance(new Date().getMonth()+1, new Date().getFullYear()),
  db.fetchVisits(),
])

    if (r)    setRoles(r)
    if (u)    setUsers(u)
    if (m)    setMembers(m)
    if (c)    setCategories(c)
    if (p)    setProducts(p)
    if (dist) setDistributors(dist.map(d => ({ ...d, assignedTo: d.assignments?.map(a => a.member_id) || [] })))
    if (pa)   setParams(Object.fromEntries(pa.map(p => [p.member_id, p])))
      if (vis) setVisits(vis)
    if (g)   {
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
      distributors, setDistributors, params, setParams,
      goals, setGoals, invoices, setInvoices,
      expenses, setExpenses, salaries, setSalaries,
      attendance, setAttendance, achievements,
      visits, setVisits,
      loading, loadAll, toast, showToast,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)