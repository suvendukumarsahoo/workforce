import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { CrudTable, EntitySheet, Av, SBadge } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function Customers() {
  const { can } = useAuth()
  const { customers, setCustomers, members, showToast } = useData()
  const [sheet, setSheet] = useState(null)

  const cols = [
    { key: 'name', label: 'Name', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'area', label: 'Area' },
    { key: 'type', label: 'Type', render: r => <SBadge s={r.type} /> },
    { key: 'assignedTo', label: 'Assigned to', render: r => (
      <div style={{ display: 'flex', gap: 4 }}>
        {(r.assignedTo || []).map(id => { const m = (members || []).find(x => x.id === id); return m ? <Av key={id} av={m.avatar} color={m.color} sz={22} /> : null })}
      </div>
    )},
  ]

  const save = async (d) => {
    const memberIds = String(d.assignedTo || '').split(',').map(s => parseInt(s.trim())).filter(Boolean)
    const payload   = { name: d.name, area: d.area, type: d.type || 'Retailer' }
    if (sheet?.id) {
      const { error } = await db.updateCustomer(sheet.id, payload, memberIds)
      if (error) { showToast('Error saving'); return }
      setCustomers(prev => prev.map(x => x.id === sheet.id ? { ...x, ...payload, assignedTo: memberIds } : x))
    } else {
      const id = 'C' + Date.now().toString(36).toUpperCase()
      const { error } = await db.createCustomer({ ...payload, id }, memberIds)
      if (error) { showToast('Error saving'); return }
      setCustomers(prev => [...prev, { ...payload, id, assignedTo: memberIds }])
    }
    setSheet(null)
    showToast(sheet?.id ? 'Customer updated' : 'Customer added')
  }

  return (
    <div>
      {sheet !== null && (
        <EntitySheet
          title={sheet?.id ? 'Edit customer' : 'Add customer'}
          fields={[
            { key: 'name', label: 'Customer name', req: true },
            { key: 'area', label: 'Area / Region' },
            { key: 'type', label: 'Type', opts: [{ value: 'Retailer', label: 'Retailer' }, { value: 'Distributor', label: 'Distributor' }, { value: 'Direct', label: 'Direct' }] },
            { key: 'assignedTo', label: 'Assign to member IDs (comma-separated)', ph: 'e.g. 1,2' },
          ]}
          init={sheet?.id ? { ...sheet, assignedTo: (sheet.assignedTo || []).join(',') } : {}}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
      <CrudTable
        title="Customers"
        cols={cols}
        rows={customers || []}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet({})}
        onEdit={row => setSheet(row)}
        onDelete={async row => { await db.deleteCustomer(row.id); setCustomers(prev => prev.filter(x => x.id !== row.id)); showToast('Customer deleted') }}
      />
    </div>
  )
}
