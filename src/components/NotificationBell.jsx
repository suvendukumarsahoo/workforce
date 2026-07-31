import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import * as db from '../lib/db.js'

const timeAgo = (isoDate) => {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationBell({ onNavigate }) {
  const { currentUser } = useAuth()
  const roleId = currentUser?.role_id
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)

  const load = async () => {
    if (!roleId) return
    const { data } = await db.fetchNotifications(roleId)
    setItems(data || [])
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [roleId])

  const unread = items.filter(n => !n.read).length

  const openItem = async (n) => {
    if (!n.read) {
      await db.markNotificationRead(n.id)
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    setOpen(false)
    if (n.type === 'loading_complete' && onNavigate) onNavigate('invoices')
  }

  if (!roleId) return null

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 16, position: 'relative' }}>
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px', lineHeight: '14px' }}>
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{ position: 'absolute', right: 0, top: '110%', width: 320, maxHeight: 400, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 100 }}>
            <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, borderBottom: '1px solid #f3f4f6' }}>Notifications</div>
            {items.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No notifications</div>}
            {items.map(n => (
              <div key={n.id} onClick={() => openItem(n)} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: n.read ? '#fff' : '#eff6ff' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{n.body}</div>}
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
