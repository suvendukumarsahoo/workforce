import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, Av, Btn, SBadge } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'

const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export default function ExpApprovals() {
  const { can } = useAuth()
  const { expenses, setExpenses, showToast, loadAll } = useData()

  const pending = (expenses || []).filter(e => e.status === 'pending')

  const action = async (id, status) => {
    const { error } = await db.updateExpense(id, { status })
    if (error) { showToast('Error updating expense'); return }
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, status } : e))
    await loadAll()
    showToast(status === 'approved' ? 'Expense approved' : 'Expense rejected')
  }

  if (pending.length === 0) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
      <div>No expenses pending approval</div>
    </div>
  )

  return (
    <div>
      {pending.map(e => (
        <Card key={e.id}>
          <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
              <Av av={e.member?.avatar || '?'} color={e.member?.color || '#6b7280'} sz={32} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.member?.name || 'Member'}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{e.description} · {e.category}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{e.date}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{F(e.amount)}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {can('approve') && <Btn v="ok" sm onClick={() => action(e.id, 'approved')}>✓ Approve</Btn>}
                {can('reject')  && <Btn v="bad" sm onClick={() => action(e.id, 'rejected')}>✗ Reject</Btn>}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
