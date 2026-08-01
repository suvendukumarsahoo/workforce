import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { CrudTable, Av, SBadge, Sheet, Inp, Btn } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function Employees() {
  const { can } = useAuth()
  const { users, setUsers, roles, showToast } = useData()
  const [sheet, setSheet] = useState(null)

  const cols = [
    { key: 'name', label: 'Name', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Av av={r.avatar || '?'} color={r.color || '#6b7280'} sz={28} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{r.name}</div>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.email}</div>
        </div>
      </div>
    )},
    { key: 'role_id', label: 'Role', render: r => {
      const role = (roles || []).find(x => x.id === r.role_id)
      return role ? <span style={{ background: role.color + '22', color: role.color, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{role.name}</span> : null
    }},
    { key: 'member_id', label: 'Member ID', render: r => r.member_id || '—' },
  ]

  const save = async (d) => {
    const payload = {
      name: d.name, email: d.email, role_id: d.role_id, member_id: d.member_id ? Number(d.member_id) : null,
      avatar: (d.name || '??').slice(0, 2).toUpperCase(), color: d.color || '#6b7280',
      hq_latitude: d.hq_latitude !== '' && d.hq_latitude != null ? Number(d.hq_latitude) : null,
      hq_longitude: d.hq_longitude !== '' && d.hq_longitude != null ? Number(d.hq_longitude) : null,
      duty_start_time: d.duty_start_time || null,
      allowed_deviation_m: d.allowed_deviation_m !== '' && d.allowed_deviation_m != null ? Number(d.allowed_deviation_m) : 20,
    }
    if (sheet?.id) {
      const { error } = await db.updateUser(sheet.id, payload)
      if (error) { showToast('Error saving user'); return }
      setUsers(prev => prev.map(x => x.id === sheet.id ? { ...x, ...payload } : x))
    } else {
      const { error } = await db.createUser({ ...payload, password: d.password })
      if (error) { showToast('Error creating user: ' + error.message); return }
      setUsers(prev => [...prev, { ...payload, id: Date.now() }])
    }
    setSheet(null)
    showToast(sheet?.id ? 'User updated' : 'User added')
  }

  return (
    <div>
      {sheet !== null && (
        <Sheet title={sheet?.id ? 'Edit user' : 'Add user'} onClose={() => setSheet(null)}>
          <UserForm init={sheet?.id ? sheet : {}} roles={roles} onSave={save} onClose={() => setSheet(null)} isEdit={!!sheet?.id} />
        </Sheet>
      )}
      <CrudTable
        title="Users & employees"
        sub="Manage user accounts and role assignments"
        cols={cols}
        rows={users || []}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet({})}
        onEdit={row => setSheet(row)}
        onDelete={async row => { await db.deleteUser(row.id); setUsers(prev => prev.filter(x => x.id !== row.id)); showToast('User deleted') }}
      />
    </div>
  )
}

function UserForm({ init, roles, onSave, onClose, isEdit }) {
  const [d, setD] = useState({ ...init })
  const [locBusy, setLocBusy] = useState(false)
  const set = (k, v) => setD(x => ({ ...x, [k]: v }))

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return
    setLocBusy(true)
    navigator.geolocation.getCurrentPosition(
      pos => { set('hq_latitude', pos.coords.latitude); set('hq_longitude', pos.coords.longitude); setLocBusy(false) },
      () => setLocBusy(false)
    )
  }

  return (
    <>
      <Inp label="Full name" value={d.name} onChange={v => set('name', v)} req />
      <Inp label="Email address" value={d.email} onChange={v => set('email', v)} req />
      {!isEdit && <Inp label="Password" type="password" value={d.password} onChange={v => set('password', v)} req />}
      <Inp label="Role" value={d.role_id} onChange={v => set('role_id', v)} options={[{ value: '', label: 'Select role...' }, ...(roles || []).map(r => ({ value: r.id, label: r.name }))]} />
      <Inp label="Member ID (for Sales Team only)" value={d.member_id || ''} onChange={v => set('member_id', v)} type="number" ph="Leave blank for non-sales staff" />
      <Inp label="Colour (hex)" value={d.color || ''} onChange={v => set('color', v)} placeholder="#3b82f6" />

      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Headquarter Location (for attendance check-in)</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <Inp label="" value={d.hq_latitude ?? ''} onChange={v => set('hq_latitude', v)} type="number" placeholder="Latitude" />
        <Inp label="" value={d.hq_longitude ?? ''} onChange={v => set('hq_longitude', v)} type="number" placeholder="Longitude" />
      </div>
      <Btn sm onClick={useCurrentLocation} disabled={locBusy} style={{ marginBottom: 12 }}>
        {locBusy ? 'Getting location...' : '📍 Use my current location'}
      </Btn>

      <Inp label="Approved Deviation Limit (metres)" value={d.allowed_deviation_m ?? 20} onChange={v => set('allowed_deviation_m', v)} type="number" helper="Distance from HQ allowed before a punch-in is flagged for HR review" />

      <Inp label="Duty Reporting Time" value={d.duty_start_time || ''} onChange={v => set('duty_start_time', v)} type="time" helper="Used to flag punch-ins as late vs on time" />

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn v="pri" full onClick={() => onSave(d)}>Save</Btn>
        <Btn full onClick={onClose}>Cancel</Btn>
      </div>
    </>
  )
}
