import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { downloadReportPdf, downloadReportExcel } from '../../lib/printSecondaryReport.js'
import { computeStockTakePeriods, round1 } from '../../lib/stockReport.js'

const selStyle = { padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }
const uniqById = arr => Object.values(Object.fromEntries((arr || []).filter(Boolean).map(x => [x.id, x])))
const fmtQty = (n, unit) => (n === null || n === undefined ? '—' : `${round1(n)} ${unit || ''}`.trim())

// Periods are anchored to real stock-take dates, not a user-chosen date range — no From/To filter
// here, unlike DistributorSecondaryReport.jsx. Summary = latest period per (distributor,product);
// Detail = every stock-take-to-stock-take period ever recorded (computeStockTakePeriods handles
// both from the same fetch).
export default function DistributorStockSalesReport() {
  const { currentUser, role } = useAuth()
  const { members, users, distributors, products } = useData()

  const isOwnView = role?.id === 'r5'
  const multiRep = !isOwnView
  const salesTeamMemberIds = new Set((users || []).filter(u => u.role_id === 'r5' && u.member_id != null).map(u => u.member_id))
  const scopeMembers = isOwnView
    ? (members || []).filter(m => m.id === currentUser?.member_id)
    : role?.id === 'r2'
      ? (members || []).filter(m => salesTeamMemberIds.has(m.id) && String(m.manager_id || '') === String(currentUser?.id))
      : (members || []).filter(m => salesTeamMemberIds.has(m.id)) // r1 Admin — every Sales Team member
  const scopeMemberIds = scopeMembers.map(m => m.id)

  const [repId, setRepId] = useState('')
  const effectiveMemberIds = repId ? [repId] : scopeMemberIds

  const scopeDistributors = (distributors || []).filter(d =>
    d.type === 'Distributor' && (d.assignments || []).some(a => effectiveMemberIds.includes(a.member_id))
  )
  const scopeDistributorIds = scopeDistributors.map(d => d.id)

  const [distributorId, setDistributorId] = useState('')
  const [productId, setProductId] = useState('')
  const [data, setData] = useState(null) // { periods, latest }
  const [tab, setTab] = useState('summary')

  const load = async () => {
    setData(null)
    const [{ data: stockTakes }, { data: deliveredOrders }] = await Promise.all([
      db.fetchStockTakesForDistributors({ distributorIds: scopeDistributorIds }),
      db.fetchDeliveredOrdersForStockReport({ distributorIds: scopeDistributorIds }),
    ])
    setData(computeStockTakePeriods({
      stockTakes: stockTakes || [], deliveredOrders: deliveredOrders || [],
      distributorIds: scopeDistributorIds, productIds: null,
    }))
  }
  useEffect(() => { if (scopeDistributorIds.length) load() }, [repId, scopeDistributorIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const distributorName = id => (distributors || []).find(d => d.id === id)?.name || id
  const distributorOptions = uniqById(scopeDistributors)
  const productOptions = uniqById(products || [])

  const filterRow = r => (!distributorId || r.distributorId === distributorId) && (!productId || r.productId === productId)
  const summaryRows = (data?.latest || []).filter(filterRow).map(r => ({ ...r, distributorName: distributorName(r.distributorId) }))
  const detailRows = (data?.periods || []).filter(filterRow).map(r => ({ ...r, distributorName: distributorName(r.distributorId) }))

  const summaryColumns = [
    { header: 'Distributor', key: 'distributorName' }, { header: 'Product', key: 'productName' },
    { header: 'Period From', key: 'from' }, { header: 'Period To', key: 'to' },
    { header: 'Opening', key: 'openingDisp' }, { header: 'Receipts', key: 'receiptsDisp' },
    { header: 'Sales', key: 'salesDisp' }, { header: 'Closing', key: 'closingDisp' },
  ]
  const detailColumns = summaryColumns

  const withDisplay = rows => rows.map(r => ({
    ...r, from: r.from || '—', openingDisp: fmtQty(r.opening, r.unit), receiptsDisp: fmtQty(r.receipts, r.unit),
    salesDisp: fmtQty(r.sales, r.unit), closingDisp: fmtQty(r.closing, r.unit),
  }))

  const activeColumns = tab === 'summary' ? summaryColumns : detailColumns
  const activeRows = withDisplay(tab === 'summary' ? summaryRows : detailRows)

  const exportPdf = () => downloadReportPdf({
    filename: `StockSalesReport-${tab === 'summary' ? 'Summary' : 'Detail'}.pdf`,
    title: `Distributor Stock & Sales — ${tab === 'summary' ? 'Summary' : 'Detail'} Report`,
    columns: activeColumns, rows: activeRows,
  })
  const exportExcel = () => downloadReportExcel({
    filename: `StockSalesReport-${tab === 'summary' ? 'Summary' : 'Detail'}.xlsx`,
    sheetName: tab === 'summary' ? 'Summary' : 'Detail',
    columns: activeColumns, rows: activeRows,
  })

  return (
    <div>
      <Card>
        <CH title="Filters" />
        <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Distributor</div>
            <select value={distributorId} onChange={e => setDistributorId(e.target.value)} style={selStyle}>
              <option value="">All</option>
              {distributorOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Product</div>
            <select value={productId} onChange={e => setProductId(e.target.value)} style={selStyle}>
              <option value="">All</option>
              {productOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {multiRep && (
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Sales Rep</div>
              <select value={repId} onChange={e => setRepId(e.target.value)} style={selStyle}>
                <option value="">All</option>
                {scopeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['summary', 'Summary'], ['detail', 'Detail']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tab === key ? '#2563eb' : '#f3f4f6', color: tab === key ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn sm onClick={exportPdf} disabled={activeRows.length === 0}>⬇ PDF</Btn>
          <Btn sm onClick={exportExcel} disabled={activeRows.length === 0}>⬇ Excel</Btn>
        </div>
      </div>

      {data === null && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>}

      {data !== null && (
        <Card>
          <CH title={tab === 'summary' ? 'Summary' : 'Detail'} sub={`${activeRows.length} row(s)`} />
          {activeRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No physical stock takes recorded yet</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {activeColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{r.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.productName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.from}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.to}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.openingDisp}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#15803d' }}>{r.receiptsDisp}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#b91c1c' }}>{r.salesDisp}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{r.closingDisp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
