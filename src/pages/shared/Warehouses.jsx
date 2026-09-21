import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Btn, Sheet, CrudTable, EntitySheet } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function Warehouses() {
  const { can } = useAuth()
  const { products, categories } = useData()
  const [warehouses, setWarehouses] = useState([])
  const [sheet, setSheet] = useState(null)
  // Flat product_id+warehouse_id pairs (see db.js's fetchProductWarehouseMap comment for why this
  // isn't per-warehouse-fetched or lifted into useData()'s global context) — mapForWarehouse below
  // filters it client-side per row.
  const [mapRows, setMapRows] = useState([])
  const [mapFor, setMapFor] = useState(null) // warehouse row currently getting its product checklist edited
  const [mapSaving, setMapSaving] = useState({})

  const loadWarehouses = async () => {
    const { data } = await db.fetchWarehouses()
    setWarehouses(data || [])
  }
  const loadMap = async () => {
    const { data } = await db.fetchProductWarehouseMap()
    setMapRows(data || [])
  }
  useEffect(() => { loadWarehouses(); loadMap() }, [])

  const categoryName = cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'
  const mappedProductIds = warehouseId => new Set(mapRows.filter(r => r.warehouse_id === warehouseId).map(r => r.product_id))
  const productCountFor = warehouseId => mappedProductIds(warehouseId).size

  const toggleMap = async (warehouseId, productId, currentlyMapped) => {
    setMapSaving(s => ({ ...s, [productId]: true }))
    if (currentlyMapped) {
      await db.unmapProductFromWarehouse(productId, warehouseId)
      setMapRows(rows => rows.filter(r => !(r.warehouse_id === warehouseId && r.product_id === productId)))
    } else {
      await db.mapProductToWarehouse(productId, warehouseId)
      setMapRows(rows => [...rows, { warehouse_id: warehouseId, product_id: productId }])
    }
    setMapSaving(s => ({ ...s, [productId]: false }))
  }

  const cols = [
    { key: 'name', label: 'Name', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'address', label: 'Address' },
    { key: 'latitude', label: 'Latitude' },
    { key: 'longitude', label: 'Longitude' },
    { key: 'products', label: 'Products', render: r => (
      <Btn sm onClick={() => setMapFor(r)}>{productCountFor(r.id)} mapped</Btn>
    ) },
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

      {mapFor && (() => {
        const mapped = mappedProductIds(mapFor.id)
        const groups = {}
        ;(products || []).forEach(p => {
          const key = categoryName(p.category_id)
          if (!groups[key]) groups[key] = []
          groups[key].push(p)
        })
        return (
          <Sheet title={mapFor.name} sub={`${mapped.size} of ${(products || []).length} product(s) stocked here`} onClose={() => setMapFor(null)}>
            {Object.entries(groups).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{cat}</div>
                {items.map(p => {
                  const isMapped = mapped.has(p.id)
                  return (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', fontSize: 13, cursor: can('edit') ? 'pointer' : 'default' }}>
                      <input
                        type="checkbox"
                        checked={isMapped}
                        disabled={!can('edit') || !!mapSaving[p.id]}
                        onChange={() => toggleMap(mapFor.id, p.id, isMapped)}
                        style={{ width: 16, height: 16 }}
                      />
                      {p.name} <span style={{ color: '#9ca3af' }}>({p.unit})</span>
                    </label>
                  )
                })}
              </div>
            ))}
            {(products || []).length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No products in the catalog yet</div>
            )}
          </Sheet>
        )
      })()}
    </div>
  )
}