import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { CrudTable, EntitySheet } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

export default function Categories() {
  const { can } = useAuth()
  const { categories, setCategories, showToast } = useData()
  const [sheet, setSheet] = useState(null)

  const save = async (d) => {
    const payload = { name: d.name, unit: d.unit || 'Units' }
    if (sheet?.id) {
      const { error } = await db.updateCategory(sheet.id, payload)
      if (error) { showToast('Error saving'); return }
      setCategories(prev => prev.map(x => x.id === sheet.id ? { ...x, ...payload } : x))
    } else {
      const id = 'CAT' + Date.now().toString(36).toUpperCase()
      const { error } = await db.createCategory({ ...payload, id })
      if (error) { showToast('Error saving'); return }
      setCategories(prev => [...prev, { ...payload, id }])
    }
    setSheet(null)
    showToast(sheet?.id ? 'Category updated' : 'Category added')
  }

  return (
    <div>
      {sheet !== null && (
        <EntitySheet
          title={sheet?.id ? 'Edit category' : 'Add category'}
          fields={[
            { key: 'name', label: 'Category name', req: true },
            { key: 'unit', label: 'Unit', opts: ['Litres', 'Pieces', 'Kgs', 'Units'] },
          ]}
          init={sheet?.id ? sheet : {}}
          onSave={save}
          onClose={() => setSheet(null)}
        />
      )}
      <CrudTable
        title="Categories"
        cols={[
          { key: 'name', label: 'Name', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
          { key: 'unit', label: 'Unit' },
        ]}
        rows={categories || []}
        canAdd={can('add')} canEdit={can('edit')} canDel={can('del')}
        onAdd={() => setSheet({})}
        onEdit={row => setSheet(row)}
        onDelete={async row => { await db.deleteCategory(row.id); setCategories(prev => prev.filter(x => x.id !== row.id)); showToast('Category deleted') }}
      />
    </div>
  )
}
