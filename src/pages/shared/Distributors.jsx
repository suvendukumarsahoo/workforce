
import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { CrudTable, EntitySheet, Av, SBadge } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function Distributors() {
  const { can } = useAuth()
  const { distributors, setDistributors, members, showToast } = useData()
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
    const payload   = { name: d.name, area: d.area, type: d.type || 'New Customer' }
    if (sheet?.id) {
      const { error } = await db.updateDistributor(sheet.id, payload, memberIds)
      if (error) { showToast('Error saving'); return }
      setDistributors(prev => prev.map(x => x.id === sheet.id ? { ...x, ...payload, assignedTo: memberIds } : x))
    } else {
      const id = 'C' + Date.now().toString(36).toUpperCase()
      const { error } = await db.createDistributor({ ...payload, id }, memberIds)
      if (error) { showToast('Error saving'); return }
      setDistributors(prev => [...prev, { ...payload, id, assignedTo: memberIds }])
    }
    setSheet(null)
    showToast(sheet?.id ? 'Distributor updated' : 'Distributor added')
  }

  return (
    <div>
      {sheet !== null && (
        <EntitySheet
          title={sheet?.id ? 'Edit distributor' : 'Add distributor'}
          fields={[
            { key: 'name', label: 'Distributor name', req: true },
            { key: 'area', label: 'Area / Region' },
            { key: 'type', label: 'Type', opts: [{ value: 'New Customer', label: 'New Customer' }, { value: 'Distributor', label: 'Distributor' }, { value: 'Direct', label: 'Direct' }] },
            { key: 'assignedTo', label: 'Assign to member IDs (comma-separated)', ph: 'e.g. 1,2' },
          ]}
          init={sheet?.id ? { ...sheet, assignedTo: (sheet.assignedTo || []).join(',') } : {}}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
      <CrudTable
        title="Distributors"
        cols={cols}
        rows={distributors || []}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet({})}
        onEdit={row => setSheet(row)}
        onDelete={async row => { await db.deleteDistributor(row.id); setDistributors(prev => prev.filter(x => x.id !== row.id)); showToast('Distributor deleted') }}
      />
    </div>
  )
}