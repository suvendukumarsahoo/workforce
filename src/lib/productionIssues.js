// Shared 3M (Material/Machinery/Manpower) production-issue definitions — used by StockUpdate.jsx
// (where WM ticks these per product), ProductionIssues.jsx (itemwise/issuewise report), and
// Attendance.jsx (Manpower-only slice shown to HR). Each reason maps to one boolean column on
// `products`, independent of `stock_status` — ticking these does not change the Available/Wait/
// Unavailable dropdown, it's a separate annotation for reporting.

export const ISSUE_CATEGORIES = [
  {
    key: 'Material',
    reasons: [
      { field: 'issue_rm_unavailable', label: 'Main Ingredient RM Unavailable' },
      { field: 'issue_packing_material_unavailable', label: 'Packing Materials Unavailable' },
    ],
  },
  {
    key: 'Machinery',
    reasons: [
      { field: 'issue_production_breakdown', label: 'Production Breakdown' },
      { field: 'issue_packing_breakdown', label: 'Packing Breakdown' },
    ],
  },
  {
    key: 'Manpower',
    reasons: [
      { field: 'issue_section_head_absent', label: 'Section Head Absent' },
      { field: 'issue_section_labourer_absent', label: 'Section Labourer Absent' },
    ],
  },
]

export const ALL_ISSUE_FIELDS = ISSUE_CATEGORIES.flatMap(c => c.reasons.map(r => r.field))
const ALL_REASONS = ISSUE_CATEGORIES.flatMap(c => c.reasons)

export const hasAnyIssue = product => ALL_ISSUE_FIELDS.some(f => product[f])
export const activeIssueFields = product => ALL_ISSUE_FIELDS.filter(f => product[f])
export const labelForField = field => ALL_REASONS.find(r => r.field === field)?.label || field

export const MANPOWER_FIELDS = ISSUE_CATEGORIES.find(c => c.key === 'Manpower').reasons.map(r => r.field)

export const hasManpowerIssue = product => MANPOWER_FIELDS.some(f => product[f])
