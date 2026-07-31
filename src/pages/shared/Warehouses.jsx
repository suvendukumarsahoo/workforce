import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { CrudTable, EntitySheet } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function Warehouses() {
  const { can } = useAuth()
  const [warehouses, setWarehouses] = useState([])
  const [sheet, setSheet] = useState(null)

  const loadWarehouses = async () => {
    const { data } = await db.fetchWarehouses()
    setWarehouses(data || [])
  }
  useEffect(() => { loadWarehouses() }, [])

  const cols = [
    { key: 'name', label: 'Name', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'address', label: 'Address' },
    { key: 'latitude', label: 'Latitude' },
    { key: 'longitude', label: 'Longitude' },
  ]

  const save = async (d) => {
    const payload = {
      name: d.name, address: d.address,
      latitude: Number(d.latitude) || null,
      longitude: Number(d.longitude) || null,
    }
    if (sheet?.id) {
      await db.updateWarehouse(sheet.id, payload)
    } else {
      const id = 'W' + Date.now().toString(36).toUpperCase()
      await db.createWarehouse({ ...payload, id })
    }
    setSheet(null)
    await loadWarehouses()
  }

  return (
    <div>
      {sheet !== null && (
        <EntitySheet
          title={sheet?.id ? 'Edit warehouse' : 'Add warehouse'}
          fields={[
            { key: 'name', label: 'Warehouse Name', req: true },
            { key: 'address', label: 'Address' },
            { key: 'latitude', label: 'Latitude', type: 'number', req: true },
            { key: 'longitude', label: 'Longitude', type: 'number', req: true },
          ]}
          init={sheet?.id ? sheet : {}}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
      <CrudTable
        title="Warehouses"
        cols={cols}
        rows={warehouses}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet({})}
        onEdit={row => setSheet(row)}
        onDelete={async row => { await db.deleteWarehouse(row.id); await loadWarehouses() }}
      />
    </div>
  )
}