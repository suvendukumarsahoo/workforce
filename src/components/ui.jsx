// ─── AVATAR ───────────────────────────────────────────────────────────────────
export const Av = ({ av, color, sz = 32 }) => (
  <div style={{
    width: sz, height: sz, borderRadius: '50%',
    background: color + '22', color,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: sz * 0.34, fontWeight: 700, flexShrink: 0,
  }}>{av}</div>
)

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const STATUS = {
  approved:   ['#10b981', '#d1fae5'],
  pending:    ['#f59e0b', '#fef3c7'],
  rejected:   ['#ef4444', '#fee2e2'],
  draft:      ['#6b7280', '#f3f4f6'],
  partial:    ['#8b5cf6', '#ede9fe'],
  active:     ['#10b981', '#d1fae5'],
  idle:       ['#f59e0b', '#fef3c7'],
  offline:    ['#6b7280', '#f3f4f6'],
  'on track': ['#10b981', '#d1fae5'],
  behind:     ['#ef4444', '#fee2e2'],
  watch:      ['#f59e0b', '#fef3c7'],
}

export const SBadge = ({ s }) => {
  const [c, bg] = STATUS[s?.toLowerCase()] || ['#6b7280', '#f3f4f6']
  return (
    <span style={{ background: bg, color: c, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s}
    </span>
  )
}

const GOAL_STATUS_LABELS = {
  approved: 'Approved',
  pending:  'Pending review',
  rejected: 'Rejected',
  draft:    'Not submitted',
  partial:  'Partially approved',
}

export const GBadge = ({ status }) => {
  const [c, bg] = STATUS[status] || STATUS.draft
  return (
    <span style={{ background: bg, color: c, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {GOAL_STATUS_LABELS[status] || status}
    </span>
  )
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
const barColor = v => v >= 75 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444'

export const Bar = ({ val, color, h = 6 }) => (
  <div style={{ height: h, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
    <div style={{
      width: `${Math.min(Math.max(val || 0, 0), 100)}%`,
      height: '100%',
      background: color || barColor(val),
      borderRadius: 3, transition: 'width .4s',
    }} />
  </div>
)

// ─── CARD ─────────────────────────────────────────────────────────────────────
export const Card = ({ children, style, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 12, overflow: 'hidden', marginBottom: 12,
      cursor: onClick ? 'pointer' : undefined, ...style,
    }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)' }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = '' }}
  >
    {children}
  </div>
)

// ─── CARD HEADER ──────────────────────────────────────────────────────────────
export const CH = ({ title, right, sub }) => (
  <div style={{ padding: '11px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
    <div style={{ flexShrink: 0 }}>{right}</div>
  </div>
)

// ─── METRIC TILE ──────────────────────────────────────────────────────────────
export const Tile = ({ icon, label, value, sub, color, onClick }) => (
  <div
    onClick={onClick}
    style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', cursor: onClick ? 'pointer' : undefined, transition: 'box-shadow .15s' }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'; e.currentTarget.style.borderColor = '#93c5fd' } }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = '#e5e7eb' }}
  >
    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
      {icon && <span>{icon}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
    <div style={{ fontSize: 20, fontWeight: 700, color: color || '#111827' }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    {onClick && <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 3 }}>Tap for detail ›</div>}
  </div>
)

// ─── BUTTON ───────────────────────────────────────────────────────────────────
const BTN_STYLES = {
  def:  { background: '#fff',     color: '#374151', border: '1px solid #d1d5db' },
  pri:  { background: '#2563eb',  color: '#fff',    border: 'none' },
  ok:   { background: '#10b981',  color: '#fff',    border: 'none' },
  bad:  { background: '#ef4444',  color: '#fff',    border: 'none' },
  gh:   { background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb' },
  warn: { background: '#f59e0b',  color: '#fff',    border: 'none' },
}

export const Btn = ({ children, onClick, v = 'def', sm, full, disabled, style }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    style={{
      ...BTN_STYLES[v] || BTN_STYLES.def,
      padding: sm ? '5px 10px' : '8px 14px',
      borderRadius: 8, fontSize: sm ? 11 : 13, fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: 'inherit',
      width: full ? '100%' : undefined,
      justifyContent: full ? 'center' : undefined,
      ...style,
    }}
  >
    {children}
  </button>
)

// ─── INPUT / SELECT ───────────────────────────────────────────────────────────
export const Inp = ({ label, value, onChange, type = 'text', placeholder, options, helper, req, style }) => (
  <div style={{ marginBottom: 12 }}>
    {label && (
      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
        {label}{req && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
    )}
    {options
      ? (
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', background: '#fff', ...style }}
        >
          {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', ...style }}
        />
      )
    }
    {helper && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>{helper}</div>}
  </div>
)

// ─── TOAST ────────────────────────────────────────────────────────────────────
export const Toast = ({ msg }) => (
  <div style={{
    position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
    background: '#1f2937', color: '#fff', padding: '10px 18px',
    borderRadius: 10, fontSize: 13, zIndex: 9999,
    boxShadow: '0 4px 20px rgba(0,0,0,.25)', whiteSpace: 'nowrap',
  }}>
    ✓ {msg}
  </div>
)

// ─── BOTTOM SHEET ─────────────────────────────────────────────────────────────
export const Sheet = ({ title, sub, onClose, children }) => (
  <div
    onClick={e => e.target === e.currentTarget && onClose()}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
  >
    <div
      style={{ background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', padding: '16px 14px 24px' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{sub}</div>}
        </div>
        <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', width: 28, height: 28, borderRadius: '50%', fontSize: 16, cursor: 'pointer', color: '#6b7280', flexShrink: 0 }}>×</button>
      </div>
      {children}
    </div>
  </div>
)

// ─── CONFIRM DIALOG ───────────────────────────────────────────────────────────
export const Confirm = ({ msg, onYes, onNo }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 340, width: '100%' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#374151' }}>{msg}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn v="bad" full onClick={onYes}>Yes, delete</Btn>
        <Btn full onClick={onNo}>Cancel</Btn>
      </div>
    </div>
  </div>
)

// ─── ATTENDANCE CALENDAR ──────────────────────────────────────────────────────
export const AttCal = ({ days = [] }) => {
  const BG = { P: '#d1fae5', A: '#fee2e2', H: '#fef3c7', W: '#f9fafb', T: '#dbeafe' }
  const TC = { P: '#065f46', A: '#991b1b', H: '#92400e', W: '#d1d5db', T: '#1d4ed8' }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 2 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 9, color: '#9ca3af' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {days.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, padding: '4px 1px', borderRadius: 4, background: BG[d] || '#f9fafb', color: TC[d] || '#9ca3af', fontWeight: d === 'T' ? 700 : 400 }}>
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── CRUD TABLE ───────────────────────────────────────────────────────────────
import { useState } from 'react'

export const CrudTable = ({ title, sub, cols, rows, onAdd, onEdit, onDelete, canAdd, canEdit, canDel, extra }) => {
  const [conf, setConf] = useState(null)
  return (
    <Card>
      {conf && <Confirm msg={`Delete "${conf.name || conf.id}"?`} onYes={() => { onDelete(conf); setConf(null) }} onNo={() => setConf(null)} />}
      <CH title={title} sub={sub} right={
        <div style={{ display: 'flex', gap: 6 }}>
          {extra}
          {canAdd && <Btn sm v="pri" onClick={onAdd}>+ Add</Btn>}
        </div>
      } />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '9px 12px', fontSize: 10, color: '#6b7280', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                  {c.label}
                </th>
              ))}
              {(canEdit || canDel) && (
                <th style={{ padding: '9px 12px', fontSize: 10, color: '#6b7280', textAlign: 'right', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 1} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No records</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id || i} onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.background = ''} style={{ borderBottom: '1px solid #f9fafb' }}>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: '10px 12px', fontSize: 12, verticalAlign: 'middle' }}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
                {(canEdit || canDel) && (
                  <td style={{ padding: '10px 12px', textAlign: 'right', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {canEdit && <Btn sm onClick={() => onEdit(row)}>✏️ Edit</Btn>}
                      {canDel  && <Btn sm v="bad" onClick={() => setConf(row)}>🗑️</Btn>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── ENTITY SHEET (generic add/edit form) ────────────────────────────────────
export const EntitySheet = ({ title, fields, init = {}, onSave, onClose }) => {
  const [d, setD] = useState({ ...init })
  return (
    <Sheet title={title} onClose={onClose}>
      {fields.map(f => (
        <Inp
          key={f.key}
          label={f.label}
          type={f.type || 'text'}
          value={d[f.key] || ''}
          onChange={v => setD(x => ({ ...x, [f.key]: v }))}
          placeholder={f.ph}
          options={f.opts}
          req={f.req}
        />
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn v="pri" full onClick={() => onSave(d)}>Save</Btn>
        <Btn full onClick={onClose}>Cancel</Btn>
      </div>
    </Sheet>
  )
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export const F   = n => '₹' + Number(n || 0).toLocaleString('en-IN')
export const clr = v => v >= 75 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444'
export const netSalary = s => s.basic + s.hra + s.ta + s.da - s.pf - s.tds
