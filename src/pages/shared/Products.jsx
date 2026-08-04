import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { CrudTable, EntitySheet } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function Products() {
  const { can } = useAuth()
  const { products, setProducts, categories, showToast } = useData()
  const [sheet, setSheet] = useState(null)

  const cols = [
    { key: 'name', label: 'Product', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'category_id', label: 'Category', render: r => { const c = (categories || []).find(x => x.id === (r.category_id || r.catId)); return <span style={{ fontSize: 12 }}>{c?.name || '—'}</span> } },
    { key: 'unit', label: 'Base Unit' },
    { key: 'price', label: 'Price', render: r => <span style={{ fontWeight: 600 }}>{F(r.price)}</span> },
    { key: 'weight', label: 'Weight', render: r => <span style={{ fontSize: 12 }}>{r.weight ? `${r.weight} kg` : '—'}</span> },
{ key: 'volume', label: 'Volume', render: r => <span style={{ fontSize: 12 }}>{r.volume ? `${Number(r.volume).toFixed(3)} cu.ft` : '—'}</span> },
  ]

  const save = async (d) => {
    const lowestFactor = d.lowest_unit_factor ? Number(d.lowest_unit_factor) : null
    const altFactor = d.alt_unit_factor ? Number(d.alt_unit_factor) : null
    if ((d.lowest_unit && !lowestFactor) || (!d.lowest_unit && lowestFactor)) {
      showToast('Lowest Unit name and factor must both be set, or both left blank'); return
    }
    if ((d.alt_unit && !altFactor) || (!d.alt_unit && altFactor)) {
      showToast('Alternate Unit name and factor must both be set, or both left blank'); return
    }
    if (lowestFactor !== null && lowestFactor <= 1) { showToast('Lowest Unit factor must be greater than 1'); return }
    if (altFactor !== null && altFactor <= 1) { showToast('Alternate Unit factor must be greater than 1'); return }
    if (lowestFactor !== null && altFactor !== null && lowestFactor <= altFactor) {
      showToast('Lowest Unit factor must be greater than Alternate Unit factor'); return
    }
    const payload = {
      name: d.name, category_id: d.category_id, unit: d.unit || 'Units', price: Number(d.price),
      weight: Number(d.weight) || null,
      length: Number(d.length) || null,
      breadth: Number(d.breadth) || null,
      height: Number(d.height) || null,
      dimension_unit: d.dimension_unit || 'feet',
      lowest_unit: d.lowest_unit || null,
      lowest_unit_factor: lowestFactor,
      alt_unit: d.alt_unit || null,
      alt_unit_factor: altFactor,
    }
    if (sheet?.id) {
      const { error } = await db.updateProduct(sheet.id, payload)
      if (error) { showToast('Error saving'); return }
      setProducts(prev => prev.map(x => x.id === sheet.id ? { ...x, ...payload } : x))
    } else {
      const id = 'P' + Date.now().toString(36).toUpperCase()
      const { error } = await db.createProduct({ ...payload, id })
      if (error) { showToast('Error saving'); return }
      setProducts(prev => [...prev, { ...payload, id }])
    }
    setSheet(null)
    showToast(sheet?.id ? 'Product updated' : 'Product added')
  }

  return (
    <div>
      {sheet !== null && (
        <EntitySheet
          title={sheet?.id ? 'Edit product' : 'Add product'}
          fields={[
            { key: 'name', label: 'Product name', req: true },
            { key: 'category_id', label: 'Category', opts: [{ value: '', label: 'Select...' }, ...(categories || []).map(c => ({ value: c.id, label: c.name }))] },
            { key: 'unit', label: 'Base Unit', opts: ['Litres', 'Pieces', 'Kgs', 'Units'] },
            { key: 'lowest_unit', label: 'Lowest Unit (e.g. Piece)' },
            { key: 'lowest_unit_factor', label: '1 Base Unit = ? Lowest Units', type: 'number' },
            { key: 'alt_unit', label: 'Alternate Unit (e.g. Pack)' },
            { key: 'alt_unit_factor', label: '1 Base Unit = ? Alternate Units', type: 'number' },
            { key: 'price', label: 'Price (₹)', type: 'number', req: true },
            { key: 'weight', label: 'Weight (kg)', type: 'number' },
            { key: 'length', label: 'Length', type: 'number' },
            { key: 'breadth', label: 'Breadth', type: 'number' },
            { key: 'height', label: 'Height', type: 'number' },
            { key: 'dimension_unit', label: 'Dimension Unit', opts: ['inch', 'feet'] },
          ]}
          init={sheet?.id ? sheet : {}}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
      <CrudTable
        title="Products"
        cols={cols}
        rows={products || []}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet({})}
        onEdit={row => setSheet(row)}
        onDelete={async row => { await db.deleteProduct(row.id); setProducts(prev => prev.filter(x => x.id !== row.id)); showToast('Product deleted') }}
      />
    </div>
  )
}
