import { useState, useEffect } from 'react'
import { Card, CH, Sheet } from './ui.jsx'
import { localDateStr } from '../lib/period.js'
import { computeDueStatus, FREQUENCY_LABELS } from '../lib/stockTakeSchedule.js'
import StockTakeEntry from '../pages/team/StockTakeEntry.jsx'
import * as db from '../lib/db.js'

const STATE_BADGE = {
  overdue: { bg: '#fee2e2', color: '#b91c1c', label: 'Overdue' },
  warn: { bg: '#fef3c7', color: '#92400e', label: 'Due Soon' },
  ok: { bg: '#dcfce7', color: '#15803d', label: 'On Track' },
  inactive: { bg: '#f3f4f6', color: '#6b7280', label: 'Not Scheduled' },
}

// Sales Team's own "Home" tab schedule card (src/pages/team/TeamApp.jsx dashboard tab) — a
// non-blocking, always-visible view of the same due-date logic PunchInGate.jsx enforces as a hard
// gate, plus a "Take Stock Now" button so a count can always be done early, not only when forced.
export default function StockTakeScheduleCard({ mid, distributors }) {
  const myDistributors = (distributors || []).filter(d => d.type === 'Distributor' && (d.assignments || []).some(a => a.member_id === mid))
  const distributorIds = myDistributors.map(d => d.id)

  const [rules, setRules] = useState(null)
  const [latestTakeDate, setLatestTakeDate] = useState({})
  const [entryFor, setEntryFor] = useState(null) // the distributor currently being counted (voluntary/early)

  const load = async () => {
    if (!distributorIds.length) { setRules([]); return }
    const [{ data: ruleRows }, { data: takes }] = await Promise.all([
      db.fetchStockTakeRules({ distributorIds }),
      db.fetchStockTakesForDistributors({ distributorIds }),
    ])
    const latest = {}
    ;(takes || []).forEach(t => { latest[t.distributor_id] = t.take_date }) // ascending order — last write wins = latest
    setLatestTakeDate(latest)
    setRules(ruleRows || [])
  }
  useEffect(() => { load() }, [distributorIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!myDistributors.length) return null

  const today = localDateStr(new Date())
  const ruleFor = distributorId => (rules || []).find(r => r.distributor_id === distributorId)

  return (
    <Card>
      <CH title="Stock Take Schedule" sub={`${myDistributors.length} distributor(s)`} />
      {rules === null && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>Loading...</div>}
      {rules !== null && myDistributors.map(d => {
        const status = computeDueStatus(ruleFor(d.id), latestTakeDate[d.id] || null, today)
        const badge = STATE_BADGE[status.state]
        return (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {status.nextDue ? `Due ${status.nextDue}${ruleFor(d.id) ? ` · ${FREQUENCY_LABELS[ruleFor(d.id).frequency]}` : ''}` : 'No schedule set'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: badge.bg, color: badge.color, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{badge.label}</span>
              <button onClick={() => setEntryFor(d)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Take Stock Now
              </button>
            </div>
          </div>
        )
      })}

      {entryFor && (
        <Sheet title={entryFor.name} sub="Physical Stock Take" onClose={() => setEntryFor(null)}>
          <StockTakeEntry
            distributor={entryFor} memberId={mid}
            onDone={() => { setEntryFor(null); load() }}
            onCancel={() => setEntryFor(null)}
          />
        </Sheet>
      )}
    </Card>
  )
}
