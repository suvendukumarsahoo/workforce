import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, Inp, SBadge } from '../../components/ui.jsx'
import { FREQUENCY_LABELS } from '../../lib/stockTakeSchedule.js'
import * as db from '../../lib/db.js'

// Manager sets a stock-take cadence per distributor mapped to their team — not a one-time/locked
// setup, editable any time, but every edit goes through db.upsertStockTakeRule which writes to the
// pending_* columns only (HR approval, StockTakeRuleApprovals.jsx, is what actually moves a change
// into effect) so the currently-active schedule keeps governing the punch-in gate until then.
export default function StockTakeSchedule() {
  const { currentUser, role } = useAuth()
  const { members, users, distributors } = useData()
  const [rules, setRules] = useState(null)
  const [editing, setEditing] = useState(null) // the distributor being scheduled
  const [frequency, setFrequency] = useState('weekly')
  const [deviationDays, setDeviationDays] = useState(3)
  const [saving, setSaving] = useState(false)

  const isAdmin = role?.id === 'r1'
  const salesTeamMemberIds = new Set((users || []).filter(u => u.role_id === 'r5' && u.member_id != null).map(u => u.member_id))
  const scopeMemberIds = isAdmin
    ? (members || []).filter(m => salesTeamMemberIds.has(m.id)).map(m => m.id)
    : (members || []).filter(m => salesTeamMemberIds.has(m.id) && String(m.manager_id || '') === String(currentUser?.id)).map(m => m.id)

  const scopeDistributors = (distributors || []).filter(d =>
    d.type === 'Distributor' && (d.assignments || []).some(a => scopeMemberIds.includes(a.member_id))
  )
  const distributorIds = scopeDistributors.map(d => d.id)

  const load = async () => {
    const { data } = await db.fetchStockTakeRules({ distributorIds })
    setRules(data || [])
  }
  useEffect(() => { if (distributorIds.length) load() }, [distributorIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const ruleFor = distributorId => (rules || []).find(r => r.distributor_id === distributorId)

  const openEdit = d => {
    const rule = ruleFor(d.id)
    setFrequency(rule?.pending_frequency || rule?.frequency || 'weekly')
    setDeviationDays(rule?.pending_deviation_limit_days || rule?.deviation_limit_days || 3)
    setEditing(d)
  }

  const save = async () => {
    const days = Math.min(7, Math.max(1, Number(deviationDays) || 1))
    setSaving(true)
    const { error } = await db.upsertStockTakeRule({
      distributor_id: editing.id, frequency, deviation_limit_days: days, submittedBy: currentUser?.id,
    })
    setSaving(false)
    if (error) return
    setEditing(null)
    load()
  }

  return (
    <div>
      <Card>
        <CH title="Stock Take Schedule" sub={`${scopeDistributors.length} distributor(s)`} />
        {scopeDistributors.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No distributors in scope</div>}
        {scopeDistributors.map(d => {
          const rule = ruleFor(d.id)
          const hasPending = !!rule?.pending_frequency
          const hasActive = rule?.status === 'approved'
          return (
            <div key={d.id} onClick={() => openEdit(d)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {hasActive ? `${FREQUENCY_LABELS[rule.frequency]} · ${rule.deviation_limit_days}-day deviation limit` : 'Not set'}
                </div>
              </div>
              {hasPending && <SBadge s="pending" />}
            </div>
          )
        })}
      </Card>

      {editing && (
        <Sheet title={editing.name} sub="Stock take frequency & deviation limit" onClose={() => setEditing(null)}>
          <Inp
            label="Frequency" options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))}
            value={frequency} onChange={setFrequency}
          />
          <Inp
            label="Deviation Limit (days)" type="number" value={deviationDays}
            onChange={v => setDeviationDays(Math.min(7, Math.max(1, Number(v) || 1)))}
            helper="Grace window after the due date before punch-in blocks. Max 7 days."
          />
          {ruleFor(editing.id)?.pending_frequency && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
              A change is already pending HR approval — saving again replaces that pending change.
            </div>
          )}
          <Btn v="pri" full disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Submit for HR Approval'}</Btn>
        </Sheet>
      )}
    </div>
  )
}
