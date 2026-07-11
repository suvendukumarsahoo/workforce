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
    { key: 'unit', label: 'Unit' },
    { key: 'price', label: 'Price', render: r => <span style={{ fontWeight: 600 }}>{F(r.price)}</span> },
  ]

  const save = async (d) => {
    const payload = { name: d.name, category_id: d.category_id, unit: d.unit || 'Units', price: Number(d.price) }
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
            { key: 'unit', label: 'Unit', opts: ['Litres', 'Pieces', 'Kgs', 'Units'] },
            { key: 'price', label: 'Price (₹)', type: 'number', req: true },
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
