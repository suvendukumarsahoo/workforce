import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, F } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { downloadReportPdf, downloadReportExcel } from '../../lib/printSecondaryReport.js'
import { computeStockTakePeriods, round1 } from '../../lib/stockReport.js'

const selStyle = { padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }
const uniqById = arr => Object.values(Object.fromEntries((arr || []).filter(Boolean).map(x => [x.id, x])))
const fmtQty = (n, unit) => (n === null || n === undefined ? '—' : `${round1(n)} ${unit || ''}`.trim())

// Stacked qty (primary) + value (secondary, currency) — used for every Opening/Receipts/Sales/
// Closing cell in both this report and the Discrepancy Reports tab, so quantity and value are always
// shown together without doubling the on-screen column count (exports still get them as separate
// flat columns, see exportColumns below).
const QtyValue = ({ qty, value, unit }) => (
  <div>
    <div>{fmtQty(qty, unit)}</div>
    {value !== null && value !== undefined && <div style={{ fontSize: 10, color: '#9ca3af' }}>{F(value)}</div>}
  </div>
)

// Periods are anchored to real stock-take dates, not a user-chosen date range. Period joins
// Distributor/Product/Sales Rep as a real filter (not a column grouping/header) — its options are
// scoped to whichever Distributor is currently selected, since a period only means anything for one
// specific distributor's own take-to-take timeline. Closing shown throughout is the CALCULATED
// figure (Opening+Receipts-Sales) — the physical count and its variance against Calculated Closing
// live in the Discrepancy Reports tab instead (one snapshot per physical stock take, generated
// automatically by StockTakeEntry.jsx, no date filter there either — it's already just a flat
// chronological list of discrete events). Opening Stock (one-time baseline entry, Manager→Admin
// approval) is managed inline here rather than a separate page — it only ever matters in the context
// of this report, and "entered once ever" per distributor means there's no ongoing workflow to
// justify its own menu.
export default function DistributorStockSalesReport() {
  const { currentUser, role } = useAuth()
  const { members, users, distributors, products } = useData()

  const isOwnView = role?.id === 'r5'
  const multiRep = !isOwnView
  const isManager = role?.id === 'r2'
  const isAdmin = role?.id === 'r1'
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
  const [periodTakeId, setPeriodTakeId] = useState('')
  const [data, setData] = useState(null) // { periods, latest }
  const [openingStocks, setOpeningStocks] = useState(null)
  const [discrepancyReports, setDiscrepancyReports] = useState(null)
  const [viewReport, setViewReport] = useState(null)
  const [tab, setTab] = useState('summary')
  const [enterFor, setEnterFor] = useState(null) // distributor currently getting its one-time Opening Stock entry
  const [entryQtys, setEntryQtys] = useState({})
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setData(null)
    const [{ data: stockTakes }, { data: invoices }, { data: secondaryOrders }, { data: os }, { data: sdr }] = await Promise.all([
      db.fetchStockTakesForDistributors({ distributorIds: scopeDistributorIds }),
      db.fetchReceiptsForStockReport({ distributorIds: scopeDistributorIds }),
      db.fetchDeliveredSecondaryOrdersForStockReport({ distributorIds: scopeDistributorIds }),
      db.fetchOpeningStocks({ distributorIds: scopeDistributorIds }),
      db.fetchDiscrepancyReports({ distributorIds: scopeDistributorIds }),
    ])
    setOpeningStocks(os || [])
    setDiscrepancyReports(sdr || [])
    setData(computeStockTakePeriods({
      stockTakes: stockTakes || [], invoices: invoices || [], secondaryOrders: secondaryOrders || [], openingStocks: os || [],
      products: products || [], distributorIds: scopeDistributorIds, productIds: null,
    }))
  }
  useEffect(() => { if (scopeDistributorIds.length) load() }, [repId, scopeDistributorIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const distributorName = id => (distributors || []).find(d => d.id === id)?.name || id
  const distributorOptions = uniqById(scopeDistributors)
  const productOptions = uniqById(products || [])
  const periodOptions = distributorId
    ? uniqById((data?.periods || []).filter(p => p.distributorId === distributorId).map(p => ({ id: p.takeId, from: p.from, to: p.to })))
      .sort((a, b) => new Date(b.to) - new Date(a.to))
    : []
  // A period's From boundary is defined as the previous stock take's date, not an independently
  // choosable value — so "To" is the real selector (pick which stock take you're viewing) and "From"
  // just displays whatever that period's own start turns out to be.
  const selectedPeriod = periodOptions.find(p => p.id === periodTakeId) || null
  const openingStockFor = distId => (openingStocks || []).find(os => os.distributor_id === distId)

  const submitEntry = async () => {
    if (!enterFor) return
    setBusy(true)
    const items = (products || []).map(p => ({ product_id: p.id, qty: Number(entryQtys[p.id]) || 0 }))
    const { error } = await db.submitOpeningStock({ distributorId: enterFor.id, enteredBy: currentUser?.id, items })
    setBusy(false)
    setEnterFor(null)
    setEntryQtys({})
    if (!error) load()
  }

  const approveManager = async (distId) => {
    setBusy(true)
    await db.approveOpeningStockManager(distId, currentUser?.id)
    setBusy(false)
    load()
  }
  const approveAdmin = async (distId) => {
    setBusy(true)
    await db.approveOpeningStockAdmin(distId, currentUser?.id)
    setBusy(false)
    load()
  }

  // Only distributors needing this viewer's attention: no entry yet (anyone can start one), or
  // awaiting the stage this specific role can act on (Manager for 'pending', Admin for
  // 'manager_approved'). Already-approved ones aren't shown — nothing left to do. Missing an
  // approved entry simply means Opening defaults to 0 for that distributor's first period — never a
  // blocker, just an optional baseline.
  const openingStockActionRows = scopeDistributors.map(d => {
    const os = openingStockFor(d.id)
    if (!os) return { distributor: d, state: 'missing' }
    // Strictly sequential — Admin must not see (let alone act on) a 'pending' entry, or clicking
    // "Approve" there would record an Admin as the Manager-stage approver, defeating the point of
    // having two distinct stages at all.
    if (os.status === 'pending' && isManager) return { distributor: d, state: 'awaiting_manager' }
    if (os.status === 'manager_approved' && isAdmin) return { distributor: d, state: 'awaiting_admin' }
    return null
  }).filter(Boolean)

  const filterRow = r => (!distributorId || r.distributorId === distributorId) && (!productId || r.productId === productId) && (!periodTakeId || r.takeId === periodTakeId)
  const summaryRows = (data?.latest || []).filter(filterRow).map(r => ({ ...r, distributorName: distributorName(r.distributorId) }))
  const detailRows = (data?.periods || []).filter(filterRow).map(r => ({ ...r, distributorName: distributorName(r.distributorId) }))
    .sort((a, b) => new Date(b.to) - new Date(a.to))

  const withDisplay = rows => rows.map(r => ({ ...r, periodDisp: `${r.from || 'First'} → ${r.to}` }))
  const summaryDisp = withDisplay(summaryRows)
  const detailDisp = withDisplay(detailRows)

  // Screen columns: qty+value stacked per cell (QtyValue). Export columns: flat, qty and value as
  // their own separate columns — a PDF/Excel consumer wants that, not a display convenience collapsed
  // into one cell.
  const screenColumns = [
    { header: 'Distributor', key: 'distributorName' }, { header: 'Product', key: 'productName' },
    { header: 'Period', key: 'periodDisp' }, { header: 'Opening', key: 'opening' },
    { header: 'Receipts', key: 'receipts' }, { header: 'Delivered Sales', key: 'sales' },
    { header: 'Closing', key: 'closing' },
  ]
  const exportColumns = [
    { header: 'Distributor', key: 'distributorName' }, { header: 'Product', key: 'productName' },
    { header: 'Period', key: 'periodDisp' },
    { header: 'Opening Qty', key: 'openingQtyDisp' }, { header: 'Opening Value', key: 'openingValueDisp' },
    { header: 'Receipts Qty', key: 'receiptsQtyDisp' }, { header: 'Receipts Value', key: 'receiptsValueDisp' },
    { header: 'Delivered Sales Qty', key: 'salesQtyDisp' }, { header: 'Delivered Sales Value', key: 'salesValueDisp' },
    { header: 'Closing Qty', key: 'closingQtyDisp' }, { header: 'Closing Value', key: 'closingValueDisp' },
  ]
  const withExportDisplay = rows => rows.map(r => ({
    ...r,
    openingQtyDisp: fmtQty(r.opening, r.unit), openingValueDisp: r.openingValue == null ? '—' : F(r.openingValue),
    receiptsQtyDisp: fmtQty(r.receipts, r.unit), receiptsValueDisp: r.receiptsValue == null ? '—' : F(r.receiptsValue),
    salesQtyDisp: fmtQty(r.sales, r.unit), salesValueDisp: r.salesValue == null ? '—' : F(r.salesValue),
    closingQtyDisp: fmtQty(r.calculatedClosing, r.unit), closingValueDisp: r.calculatedClosingValue == null ? '—' : F(r.calculatedClosingValue),
  }))

  const activeRows = tab === 'summary' ? summaryDisp : detailDisp

  const exportPdf = () => downloadReportPdf({
    filename: `StockSalesReport-${tab === 'summary' ? 'Summary' : 'Detail'}.pdf`,
    title: `Distributor Stock & Sales — ${tab === 'summary' ? 'Summary' : 'Detail'} Report`,
    columns: exportColumns, rows: withExportDisplay(activeRows),
  })
  const exportExcel = () => downloadReportExcel({
    filename: `StockSalesReport-${tab === 'summary' ? 'Summary' : 'Detail'}.xlsx`,
    sheetName: tab === 'summary' ? 'Summary' : 'Detail',
    columns: exportColumns, rows: withExportDisplay(activeRows),
  })

  const reportRows = (discrepancyReports || []).filter(r => !distributorId || r.distributor_id === distributorId)
  const varianceCount = r => (r.items || []).filter(it => Number(it.variance) !== 0).length
  const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div>
      {openingStockActionRows.length > 0 && (
        <Card>
          <CH title="Opening Stock" sub={`${openingStockActionRows.length} distributor(s) need attention`} />
          {openingStockActionRows.map(({ distributor, state }) => (
            <div key={distributor.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{distributor.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {state === 'missing' && 'No opening stock entered yet — defaults to 0 until entered'}
                  {state === 'awaiting_manager' && 'Awaiting Manager approval'}
                  {state === 'awaiting_admin' && 'Awaiting Admin approval'}
                </div>
              </div>
              {state === 'missing' && <Btn sm v="pri" onClick={() => setEnterFor(distributor)}>Enter Opening Stock</Btn>}
              {state === 'awaiting_manager' && <Btn sm v="ok" disabled={busy} onClick={() => approveManager(distributor.id)}>Approve (Manager)</Btn>}
              {state === 'awaiting_admin' && <Btn sm v="ok" disabled={busy} onClick={() => approveAdmin(distributor.id)}>Approve (Admin)</Btn>}
            </div>
          ))}
        </Card>
      )}

      <Card>
        <CH title="Filters" />
        <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Distributor</div>
            {/* Changing (or clearing) the distributor invalidates whatever Period was selected — a
                period only means anything for one specific distributor's own take-to-take timeline. */}
            <select value={distributorId} onChange={e => { setDistributorId(e.target.value); setPeriodTakeId('') }} style={selStyle}>
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
          {tab !== 'discrepancy' && (
            <>
              <div>
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Period From</div>
                {/* Derived, not independently selectable — a period's start is always the previous
                    stock take's date, fixed by whichever "To" is chosen. */}
                <select value={selectedPeriod?.from || ''} disabled style={selStyle}>
                  <option value="">{selectedPeriod ? (selectedPeriod.from || 'First') : '—'}</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>Period To</div>
                <select value={periodTakeId} onChange={e => setPeriodTakeId(e.target.value)} style={selStyle} disabled={!distributorId}>
                  <option value="">{distributorId ? 'All' : 'Pick a distributor first'}</option>
                  {periodOptions.map(p => <option key={p.id} value={p.id}>{p.to}</option>)}
                </select>
              </div>
            </>
          )}
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
          {[['summary', 'Summary'], ['detail', 'Detail'], ['discrepancy', 'Discrepancy Reports']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tab === key ? '#2563eb' : '#f3f4f6', color: tab === key ? '#fff' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
        {tab !== 'discrepancy' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn sm onClick={exportPdf} disabled={activeRows.length === 0}>⬇ PDF</Btn>
            <Btn sm onClick={exportExcel} disabled={activeRows.length === 0}>⬇ Excel</Btn>
          </div>
        )}
      </div>

      {data === null && tab !== 'discrepancy' && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>}

      {data !== null && tab !== 'discrepancy' && (
        <Card>
          <CH title={tab === 'summary' ? 'Summary' : 'Detail'} sub={`${activeRows.length} row(s)`} />
          {activeRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No physical stock takes recorded yet</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {screenColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{r.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.productName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.periodDisp}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}><QtyValue qty={r.opening} value={r.openingValue} unit={r.unit} /></td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#15803d' }}><QtyValue qty={r.receipts} value={r.receiptsValue} unit={r.unit} /></td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#b91c1c' }}><QtyValue qty={r.sales} value={r.salesValue} unit={r.unit} /></td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}><QtyValue qty={r.calculatedClosing} value={r.calculatedClosingValue} unit={r.unit} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'discrepancy' && (
        <Card>
          <CH title="Discrepancy Reports" sub={`${reportRows.length} report(s) — one per physical stock take`} />
          {discrepancyReports === null && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>Loading...</div>}
          {discrepancyReports !== null && reportRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No discrepancy reports yet — one is generated automatically every time a physical stock take is submitted</div>
          )}
          {reportRows.map(r => (
            <div key={r.id} onClick={() => setViewReport(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.id} — {r.distributor?.name || r.distributor_id}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Period: {r.from_date || 'First'} → {r.report_date}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: varianceCount(r) > 0 ? '#b91c1c' : '#15803d' }}>
                {varianceCount(r) > 0 ? `${varianceCount(r)} variance(s)` : 'No variance'}
              </div>
            </div>
          ))}
        </Card>
      )}

      {enterFor && (
        <Sheet title={`Opening Stock — ${enterFor.name}`} sub="One-time entry, needs Manager then Admin approval" onClose={() => { setEnterFor(null); setEntryQtys({}) }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Enter the starting quantity on hand for each product (leave 0 for products not stocked). Distributors with no entry default to Opening = 0.</div>
          {(products || []).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 13 }}>{p.name} <span style={{ color: '#9ca3af' }}>({p.unit})</span></div>
              <input
                type="number" min={0} step="any"
                value={entryQtys[p.id] ?? ''}
                onChange={e => setEntryQtys(q => ({ ...q, [p.id]: e.target.value }))}
                placeholder="0"
                style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
            </div>
          ))}
          <Btn v="pri" full disabled={busy} onClick={submitEntry} style={{ marginTop: 12 }}>Submit for Approval</Btn>
        </Sheet>
      )}

      {viewReport && (
        <Sheet title={`${viewReport.id} — ${viewReport.distributor?.name || viewReport.distributor_id}`}
          sub={`Period: ${viewReport.from_date || 'First'} → ${viewReport.report_date} · Stock take: ${fmtDateTime(viewReport.take?.created_at)}`}
          onClose={() => setViewReport(null)} zIndex={320}>
          {/* Deliberately just the closing-stock comparison (Calculated vs Physical vs Variance) —
              Opening/Receipts/Sales already live in the Stock & Sales Report itself; repeating them
              here would just duplicate that report inside this one. */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Product', 'Calculated Closing', 'Physical Closing', 'Variance'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(viewReport.items || []).map(it => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{it.product?.name || it.product_id}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}><QtyValue qty={it.calculated_closing} value={it.calculated_closing_value} unit={it.product?.unit} /></td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}><QtyValue qty={it.physical_closing} value={it.physical_closing_value} unit={it.product?.unit} /></td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: Number(it.variance) === 0 ? '#15803d' : (Number(it.variance) < 0 ? '#b91c1c' : '#b45309') }}>
                      {it.variance === null ? '—' : <QtyValue qty={it.variance} value={it.variance_value} unit={it.product?.unit} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      )}
    </div>
  )
}
