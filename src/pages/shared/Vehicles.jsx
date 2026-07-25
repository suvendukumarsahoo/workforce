import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { CrudTable, EntitySheet } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function Vehicles() {
  const { can } = useAuth()
  const [vehicles, setVehicles] = useState([])
  const [sheet, setSheet] = useState(null)

  const loadVehicles = async () => {
    const { data } = await db.fetchVehicles()
    setVehicles(data || [])
  }
  useEffect(() => { loadVehicles() }, [])

  const showToast = () => {}

  const cols = [
    { key: 'vehicle_number', label: 'Vehicle No.', render: r => <span style={{ fontWeight: 600 }}>{r.vehicle_number}</span> },
    { key: 'vehicle_type', label: 'Type' },
    { key: 'weight_capacity', label: 'Weight Capacity', render: r => <span style={{ fontSize: 12 }}>{r.weight_capacity ? `${r.weight_capacity} kg` : '—'}</span> },
    { key: 'volume_capacity', label: 'Volume Capacity', render: r => <span style={{ fontSize: 12 }}>{r.volume_capacity ? `${r.volume_capacity} cu.ft` : '—'}</span> },
    { key: 'status', label: 'Status', render: r => <span style={{ fontSize: 12, color: r.status === 'Active' ? '#10b981' : '#ef4444', fontWeight: 600 }}>{r.status}</span> },
  ]

  const save = async (d) => {
    const payload = {
      vehicle_number: d.vehicle_number, vehicle_type: d.vehicle_type,
      weight_capacity: Number(d.weight_capacity) || null,
      volume_capacity: Number(d.volume_capacity) || null,
      status: d.status || 'Active',
    }
    if (sheet?.id) {
      await db.updateVehicle(sheet.id, payload)
    } else {
      const id = 'V' + Date.now().toString(36).toUpperCase()
      await db.createVehicle({ ...payload, id })
    }
    setSheet(null)
    await loadVehicles()
  }

  return (
    <div>
      {sheet !== null && (
        <EntitySheet
          title={sheet?.id ? 'Edit vehicle' : 'Add vehicle'}
          fields={[
            { key: 'vehicle_number', label: 'Vehicle Number', req: true },
            { key: 'vehicle_type', label: 'Vehicle Type', opts: ['Truck', 'Mini Truck', 'Van', 'Tempo', 'Three Wheeler'] },
            { key: 'weight_capacity', label: 'Weight Capacity (kg)', type: 'number' },
            { key: 'volume_capacity', label: 'Volume Capacity (cu. ft.)', type: 'number' },
            { key: 'status', label: 'Status', opts: ['Active', 'Inactive'] },
          ]}
          init={sheet?.id ? sheet : {}}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
      <CrudTable
        title="Vehicles"
        cols={cols}
        rows={vehicles}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet({})}
        onEdit={row => setSheet(row)}
        onDelete={async row => { await db.deleteVehicle(row.id); await loadVehicles() }}
      />
    </div>
  )
}