import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useData } from '../hooks/useData.jsx'
import { Sheet, Card, CH } from './ui.jsx'
import { fetchPendingTasks } from '../lib/pendingTasks.js'

// Replaces the old NotificationBell (which read the `notifications` table — schema-drifted and
// silently empty for every call site, see CLAUDE.md's Deferred/Known Issues). This bell's badge is
// instead the total count of every pending-action item this role can see, aggregated from the exact
// same queues each source page already shows (src/lib/pendingTasks.js). Mounted once per shell
// (WebApp.jsx desktop+mobile headers, TeamApp.jsx's Home tab header — Sales Team/Driver had no bell
// at all before this).
export default function PendingTasksBell({ onNavigate }) {
  const { currentUser, role, hasMenu } = useAuth()
  const { goals, expenses, invoices, distributors, members, loading: dataLoading } = useData()
  const [tasks, setTasks] = useState([])
  const [open, setOpen] = useState(false)
  const inFlightRef = useRef(false)
  const dirtyRef = useRef(false)
  const argsRef = useRef(null)

  // Kept in sync after every render (an effect, not a render-time write, so this stays pure) so
  // `load` below always sees this render's real goals/expenses/invoices/etc without needing to be
  // recreated — see the in-flight/dirty guard below for why that matters.
  useEffect(() => {
    argsRef.current = { currentUser, role, hasMenu, context: { goals, expenses, invoices, distributors, members } }
  })

  const load = async () => {
    if (!argsRef.current?.currentUser) return
    if (inFlightRef.current) { dirtyRef.current = true; return } // a fetch is already running — flag for a re-run instead of stacking a second one
    inFlightRef.current = true
    dirtyRef.current = false
    try {
      const result = await fetchPendingTasks(argsRef.current)
      setTasks(result)
    } catch (err) {
      // A single bad category (bad query, unexpected null, etc.) would otherwise reject the whole
      // Promise.all in fetchPendingTasks and silently leave the badge at its last good count with
      // zero trace — surface it instead of failing silent.
      console.error('PendingTasksBell: failed to load pending tasks', err)
    } finally {
      inFlightRef.current = false
      // Something changed (e.g. useData()'s context finished loading, or another tab's action
      // updated goals/invoices/etc) while this fetch was in flight — that update was silently
      // dropped by the guard above, so redo it now against the latest args rather than leaving the
      // badge stuck on a stale, possibly-empty snapshot (this is exactly how "0 pending" could show
      // even with real pending items, if the very first fetch raced useData()'s own initial load).
      if (dirtyRef.current) load()
    }
  }

  useEffect(() => {
    if (!currentUser || dataLoading) return // wait for useData()'s initial context to actually be populated
    load()
    function onVisible() { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(load, 60000) // same freshness floor as useData.jsx's own poll
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(poll) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, dataLoading])

  if (!currentUser) return null

  const openTask = (t) => {
    setOpen(false)
    onNavigate?.(t.nav)
  }

  const grouped = tasks.reduce((acc, t) => {
    (acc[t.category] ||= []).push(t)
    return acc
  }, {})

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 16, position: 'relative' }}>
        🔔
        {tasks.length > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px', lineHeight: '14px' }}>
            {tasks.length}
          </span>
        )}
      </button>

      {open && (
        <Sheet title="Pending Tasks" sub={`${tasks.length} item(s) need your action`} onClose={() => setOpen(false)} zIndex={9000}>
          {tasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Nothing pending — you're all caught up 🎉</div>
          )}
          {Object.entries(grouped).map(([category, items]) => (
            <Card key={category}>
              <CH title={category} sub={`${items.length} pending`} />
              {items.map(t => (
                <div key={t.id} onClick={() => openTask(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{t.icon}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{t.subtitle}</div>
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: 14, flexShrink: 0 }}>›</span>
                </div>
              ))}
            </Card>
          ))}
        </Sheet>
      )}
    </div>
  )
}
