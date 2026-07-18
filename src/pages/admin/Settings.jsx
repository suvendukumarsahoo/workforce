import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Inp, EntitySheet, Confirm } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const ALL_MENUS = [
  { id:'dashboard',     label:'Dashboard'        },
  { id:'parameters',    label:'Set Parameters'   },
  { id:'goalApprovals', label:'Goal Approvals'   },
  { id:'targets',       label:'Targets'          },
  { id:'expApprovals',  label:'Expense Approvals'},
  { id:'invoices',      label:'Invoices'         },
  { id:'customers',     label:'Distributors'     },
  { id:'products',      label:'Products'         },
  { id:'categories',    label:'Categories'       },
  { id:'attendance',    label:'Attendance'       },
  { id:'employees',     label:'Employees'        },
  { id:'payroll',       label:'Payroll'          },
  { id:'settings',      label:'Settings'         },
  { id:'myGoals',       label:'My Goals'         },
  { id:'myExpenses',    label:'My Expenses'      },
  { id:'myAttendance',  label:'My Attendance'    },
  { id:'mySalary',      label:'My Salary'        },
]

export default function Settings() {
  const { can } = useAuth()
  const { roles, setRoles, showToast } = useData()
  const [selId,   setSelId]   = useState(roles[0]?.id || '')
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const role = (roles || []).find(r => r.id === selId)

  const togMenu = async (rid, mid) => {
    const r   = roles.find(x => x.id === rid)
    const upd = { ...r, menus: r.menus.includes(mid) ? r.menus.filter(x => x !== mid) : [...r.menus, mid] }
    const { error } = await db.updateRole(rid, { menus: upd.menus })
    if (error) { showToast('Error saving'); return }
    setRoles(prev => prev.map(x => x.id === rid ? upd : x))
  }

  const togAction = async (rid, act) => {
    const r   = roles.find(x => x.id === rid)
    const upd = { ...r, actions: { ...r.actions, [act]: !r.actions[act] } }
    const { error } = await db.updateRole(rid, { actions: upd.actions })
    if (error) { showToast('Error saving'); return }
    setRoles(prev => prev.map(x => x.id === rid ? upd : x))
  }

  const saveRole = async (d) => {
    if (editing?.id) {
      const { error } = await db.updateRole(editing.id, { name: d.name, color: d.color })
      if (error) { showToast('Error saving'); return }
      setRoles(prev => prev.map(x => x.id === editing.id ? { ...x, name: d.name, color: d.color } : x))
    } else {
      const newRole = { id: 'r' + Date.now().toString(36), name: d.name, color: d.color || '#6b7280', menus: [], actions: { add: false, edit: false, del: false, approve: false, reject: false } }
      const { error } = await db.createRole(newRole)
      if (error) { showToast('Error saving'); return }
      setRoles(prev => [...prev, newRole])
      setSelId(newRole.id)
    }
    setEditing(null)
    showToast('Role saved')
  }

  const delRole = async (r) => {
    const { error } = await db.deleteRole(r.id)
    if (error) { showToast('Error deleting'); return }
    setRoles(prev => prev.filter(x => x.id !== r.id))
    setSelId(roles.filter(x => x.id !== r.id)[0]?.id || '')
    setConfirm(null)
    showToast('Role deleted')
  }

  return (
    <div>
      {confirm  && <Confirm msg={`Delete role "${confirm.name}"?`} onYes={() => delRole(confirm)} onNo={() => setConfirm(null)} />}
      {editing  && <EntitySheet title={editing?.id ? 'Edit role' : 'Add role'} fields={[{ key: 'name', label: 'Role name', req: true }, { key: 'color', label: 'Colour (hex)', ph: '#2563eb' }]} init={editing} onSave={saveRole} onClose={() => setEditing(null)} />}

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
        ⚠️ Menu access changes take effect on the user's next login.
      </div>

      {/* Role tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(roles || []).map(r => (
          <button key={r.id} onClick={() => setSelId(r.id)} style={{ padding: '6px 14px', borderRadius: 20, border: `2px solid ${selId === r.id ? r.color : '#e5e7eb'}`, background: selId === r.id ? r.color + '15' : '#fff', color: selId === r.id ? r.color : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{r.name}</button>
        ))}
        {can('add') && <Btn sm v="gh" onClick={() => setEditing({})}>+ New role</Btn>}
      </div>

      {role && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Role info + actions */}
          <Card>
            <CH title="Role details" right={
              can('edit') && <div style={{ display: 'flex', gap: 6 }}>
                <Btn sm onClick={() => setEditing(role)}>✏️ Edit</Btn>
                <Btn sm v="bad" onClick={() => setConfirm(role)}>🗑️</Btn>
              </div>
            } />
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: role.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: role.color, fontWeight: 700, fontSize: 14 }}>{role.name[0]}</div>
                <div><div style={{ fontWeight: 600 }}>{role.name}</div><div style={{ fontSize: 11, color: '#9ca3af' }}>ID: {role.id}</div></div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Allowed actions</div>
              {['add', 'edit', 'del', 'approve', 'reject'].map(act => (
                <label key={act} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: can('edit') ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={!!(role.actions || {})[act]} onChange={() => can('edit') && togAction(role.id, act)} style={{ width: 14, height: 14 }} />
                  <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{act === 'del' ? 'Delete' : act}</span>
                </label>
              ))}
            </div>
          </Card>

          {/* Menu access */}
          <Card>
            <CH title="Menu access" sub="Takes effect on next login" />
            <div style={{ padding: 14 }}>
              {ALL_MENUS.map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: can('edit') ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={(role.menus || []).includes(m.id)} onChange={() => can('edit') && togMenu(role.id, m.id)} style={{ width: 14, height: 14 }} />
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                </label>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
