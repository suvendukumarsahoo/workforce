import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet, F } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { downloadReportPdf, downloadReportExcel } from '../../lib/printSecondaryReport.js'
import { computeStockLedger, round1 } from '../../lib/stockReport.js'
import { getCurrentPeriod, monthRangeForPeriod } from '../../lib/period.js'

const selStyle = { padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }
const uniqById = arr => Object.values(Object.fromEntries((arr || []).filter(Boolean).map(x => [x.id, x])))
const fmtQty = (n, unit) => (n === null || n === undefined ? '—' : `${round1(n)} ${unit || ''}`.trim())
// A qty total is only meaningful when every summed row shares one unit (summing "3 Litres + 5
// Units" is nonsense) — value (₹) has no such restriction, so a totals row always sums value but
// only sums quantity when the rows in scope happen to be all one unit (e.g. a single-product filter).
const allSameUnit = rows => rows.length > 0 && rows.every(r => (r.unit || '') === (rows[0].unit || ''))
const sumBy = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)

// Stacked qty (primary) + value (secondary, currency) — used for every Opening/Receipts/Sales/
// Closing cell in this report, so quantity and value are always shown together without doubling the
// on-screen column count (exports still get them as separate flat columns, see exportColumns below).
const QtyValue = ({ qty, value, unit }) => (
  <div>
    <div>{fmtQty(qty, unit)}</div>
    {value !== null && value !== undefined && <div style={{ fontSize: 10, color: '#9ca3af' }}>{F(value)}</div>}
  </div>
)

// A plain date-range ledger — has NOTHING to do with physical stock-take dates (that machinery, and
// the "Discrepancy Report" it generates, is entirely separate; see stockReport.js's own header
// comment, since this exact conflation has been the recurring mistake in this report's history).
// From/To are real, freely-editable dates (default: current calendar month, same convention as
// DistributorSecondaryReport.jsx) — Closing is always the calculated figure (Opening+Receipts-Sales)
// for whatever range is picked; this report never touches a physical count. Opening Stock (one-time
// baseline entry, Manager→Admin approval) is managed inline here rather than a separate page — it
// only ever matters in the context of this report, and "entered once ever" per distributor means
// there's no ongoing workflow to justify its own menu.
export default function DistributorStockSalesReport({ onNavigate }) {
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

  const defaultRange = monthRangeForPeriod(getCurrentPeriod())
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [distributorId, setDistributorId] = useState('')
  const [productId, setProductId] = useState('')
  const [rawInvoices, setRawInvoices] = useState(null)
  const [rawSecondaryOrders, setRawSecondaryOrders] = useState(null)
  const [openingStocks, setOpeningStocks] = useState(null)
  const [discrepancyReports, setDiscrepancyReports] = useState(null)
  const [viewReport, setViewReport] = useState(null)
  const [tab, setTab] = useState('summary')
  const [enterFor, setEnterFor] = useState(null) // distributor currently getting its one-time Opening Stock entry
  const [entryQtys, setEntryQtys] = useState({})
  const [busy, setBusy] = useState(false)

  // Receipts/Sales are fetched all-time (unbounded) — changing From/To is a pure client-side
  // recompute below, no refetch needed. Only the rep-team scope actually needs a fresh fetch.
  const load = async () => {
    setRawInvoices(null)
    setRawSecondaryOrders(null)
    const [{ data: invoices }, { data: secondaryOrders }, { data: os }, { data: sdr }] = await Promise.all([
      db.fetchReceiptsForStockReport({ distributorIds: scopeDistributorIds }),
      db.fetchDeliveredSecondaryOrdersForStockReport({ distributorIds: scopeDistributorIds }),
      db.fetchOpeningStocks({ distributorIds: scopeDistributorIds }),
      db.fetchDiscrepancyReports({ distributorIds: scopeDistributorIds }),
    ])
    setRawInvoices(invoices || [])
    setRawSecondaryOrders(secondaryOrders || [])
    setOpeningStocks(os || [])
    setDiscrepancyReports(sdr || [])
  }
  useEffect(() => { if (scopeDistributorIds.length) load() }, [repId, scopeDistributorIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const ledger = (rawInvoices && rawSecondaryOrders && openingStocks)
    ? computeStockLedger({
      invoices: rawInvoices, secondaryOrders: rawSecondaryOrders, openingStocks, products: products || [],
      distributorIds: scopeDistributorIds, productIds: null, from, to,
    })
    : null

  const distributorName = id => (distributors || []).find(d => d.id === id)?.name || id
  const distributorOptions = uniqById(scopeDistributors)
  const productOptions = uniqById(products || [])
  const openingStockFor = distId => (openingStocks || []).find(os => os.distributor_id === distId)

  // Every Summary cell drills into whatever explains that number, so a figure is never a dead end.
  // Opening/Receipts/Closing stay on THIS report — they narrow the Distributor+Product filters and
  // flip to the Detail tab, which already lists every real Receipt/Sale transaction behind them (no
  // separate "Receipts report" exists to send Receipts to). Sales is different: it's sourced from
  // delivered secondary orders, which already have their own dedicated report — so Sales instead
  // navigates there (Secondary Order Report), pre-filtered to this row's distributor + this report's
  // active date range, rather than staying inside the Detail tab.
  const drillToDetail = row => { setDistributorId(row.distributorId); setProductId(row.productId); setTab('detail') }
  const drillToSales = row => onNavigate?.('distributorSecondaryReport', { distributorId: row.distributorId, from, to })

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
  // approved entry simply means Opening defaults to 0 for that distributor — never a blocker, just
  // an optional baseline.
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

  const filterRow = r => (!distributorId || r.distributorId === distributorId) && (!productId || r.productId === productId)
  const summaryRows = (ledger?.summary || []).filter(filterRow).map(r => ({ ...r, distributorName: distributorName(r.distributorId) }))
  const detailRows = (ledger?.detail || []).filter(filterRow).map(r => ({ ...r, distributorName: distributorName(r.distributorId) }))

  const summaryColumns = [
    { header: 'Distributor', key: 'distributorName' }, { header: 'Product', key: 'productName' },
    { header: 'Opening', key: 'opening' }, { header: 'Receipts', key: 'receipts' },
    { header: 'Delivered Sales', key: 'sales' }, { header: 'Closing', key: 'closing' },
  ]
  const detailColumns = [
    { header: 'Distributor', key: 'distributorName' }, { header: 'Date', key: 'date' },
    { header: 'Type', key: 'type' }, { header: 'Product', key: 'productName' },
    { header: 'Qty', key: 'qtyDisp' }, { header: 'Value', key: 'valueDisp' },
  ]

  const withDetailDisplay = rows => rows.map(r => ({ ...r, qtyDisp: fmtQty(r.qty, r.unit), valueDisp: F(r.value) }))
  const withSummaryExportDisplay = rows => rows.map(r => ({
    ...r,
    openingQtyDisp: fmtQty(r.opening, r.unit), openingValueDisp: r.openingValue == null ? '—' : F(r.openingValue),
    receiptsQtyDisp: fmtQty(r.receipts, r.unit), receiptsValueDisp: r.receiptsValue == null ? '—' : F(r.receiptsValue),
    salesQtyDisp: fmtQty(r.sales, r.unit), salesValueDisp: r.salesValue == null ? '—' : F(r.salesValue),
    closingQtyDisp: fmtQty(r.closing, r.unit), closingValueDisp: r.closingValue == null ? '—' : F(r.closingValue),
  }))
  const summaryExportColumns = [
    { header: 'Distributor', key: 'distributorName' }, { header: 'Product', key: 'productName' },
    { header: 'Opening Qty', key: 'openingQtyDisp' }, { header: 'Opening Value', key: 'openingValueDisp' },
    { header: 'Receipts Qty', key: 'receiptsQtyDisp' }, { header: 'Receipts Value', key: 'receiptsValueDisp' },
    { header: 'Delivered Sales Qty', key: 'salesQtyDisp' }, { header: 'Delivered Sales Value', key: 'salesValueDisp' },
    { header: 'Closing Qty', key: 'closingQtyDisp' }, { header: 'Closing Value', key: 'closingValueDisp' },
  ]

  const activeRows = tab === 'summary' ? summaryRows : withDetailDisplay(detailRows)
  const rangeLabel = `${from}_to_${to}`

  const exportPdf = () => tab === 'summary'
    ? downloadReportPdf({ filename: `StockSalesReport-Summary-${rangeLabel}.pdf`, title: `Distributor Stock & Sales — Summary (${from} to ${to})`, columns: summaryExportColumns, rows: withSummaryExportDisplay(summaryRows) })
    : downloadReportPdf({ filename: `StockSalesReport-Detail-${rangeLabel}.pdf`, title: `Distributor Stock & Sales — Detail (${from} to ${to})`, columns: detailColumns, rows: activeRows })
  const exportExcel = () => tab === 'summary'
    ? downloadReportExcel({ filename: `StockSalesReport-Summary-${rangeLabel}.xlsx`, sheetName: 'Summary', columns: summaryExportColumns, rows: withSummaryExportDisplay(summaryRows) })
    : downloadReportExcel({ filename: `StockSalesReport-Detail-${rangeLabel}.xlsx`, sheetName: 'Detail', columns: detailColumns, rows: activeRows })

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
          {tab !== 'discrepancy' && (
            <>
              <div>
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>From</div>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={selStyle} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>To</div>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={selStyle} />
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

      {ledger === null && tab !== 'discrepancy' && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>}

      {ledger !== null && tab === 'summary' && (
        <Card>
          <CH title="Summary" sub={`${from} to ${to} · ${summaryRows.length} row(s)`} />
          {summaryRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No purchase/sale activity on record for this range</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {summaryColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{r.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.productName}</td>
                    <td onClick={() => drillToDetail(r)} title="View Receipt/Sale detail behind this Opening balance" style={{ padding: '8px 10px', fontSize: 12, cursor: 'pointer' }}><QtyValue qty={r.opening} value={r.openingValue} unit={r.unit} /></td>
                    <td onClick={() => drillToDetail(r)} title="View Receipt detail" style={{ padding: '8px 10px', fontSize: 12, color: '#15803d', cursor: 'pointer' }}><QtyValue qty={r.receipts} value={r.receiptsValue} unit={r.unit} /></td>
                    <td onClick={() => drillToSales(r)} title="View the delivered orders behind this Sales figure — Secondary Order Report" style={{ padding: '8px 10px', fontSize: 12, color: '#b91c1c', cursor: 'pointer' }}><QtyValue qty={r.sales} value={r.salesValue} unit={r.unit} /></td>
                    <td onClick={() => drillToDetail(r)} title="View Receipt/Sale detail behind this Closing balance" style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><QtyValue qty={r.closing} value={r.closingValue} unit={r.unit} /></td>
                  </tr>
                ))}
              </tbody>
              {summaryRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }} colSpan={2}>Total</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                      <QtyValue qty={allSameUnit(summaryRows) ? sumBy(summaryRows, 'opening') : null} value={sumBy(summaryRows, 'openingValue')} unit={summaryRows[0].unit} />
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#15803d' }}>
                      <QtyValue qty={allSameUnit(summaryRows) ? sumBy(summaryRows, 'receipts') : null} value={sumBy(summaryRows, 'receiptsValue')} unit={summaryRows[0].unit} />
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>
                      <QtyValue qty={allSameUnit(summaryRows) ? sumBy(summaryRows, 'sales') : null} value={sumBy(summaryRows, 'salesValue')} unit={summaryRows[0].unit} />
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                      <QtyValue qty={allSameUnit(summaryRows) ? sumBy(summaryRows, 'closing') : null} value={sumBy(summaryRows, 'closingValue')} unit={summaryRows[0].unit} />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {ledger !== null && tab === 'detail' && (
        <Card>
          <CH title="Detail" sub={`${from} to ${to} · ${detailRows.length} transaction(s)`} />
          {detailRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No purchase/sale transactions in this range</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {detailColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {withDetailDisplay(detailRows).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{r.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.date}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: r.type === 'Receipt' ? '#15803d' : '#b91c1c' }}>{r.type}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.productName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.qtyDisp}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{r.valueDisp}</td>
                  </tr>
                ))}
              </tbody>
              {detailRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }} colSpan={4}>Total</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{allSameUnit(detailRows) ? fmtQty(sumBy(detailRows, 'qty'), detailRows[0].unit) : '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>{F(sumBy(detailRows, 'value'))}</td>
                  </tr>
                </tfoot>
              )}
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
          {/* Deliberately just the closing-stock comparison — Opening/Receipts/Sales already live in
              the Stock & Sales Report itself; repeating them here would just duplicate that report. */}
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
              {(viewReport.items || []).length > 0 && (() => {
                const items = (viewReport.items || []).map(it => ({ ...it, unit: it.product?.unit }))
                const sameUnit = allSameUnit(items)
                const varianceValueTotal = sumBy(items, 'variance_value')
                return (
                  <tfoot>
                    <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>Total</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                        <QtyValue qty={sameUnit ? sumBy(items, 'calculated_closing') : null} value={sumBy(items, 'calculated_closing_value')} unit={items[0].unit} />
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>
                        <QtyValue qty={sameUnit ? sumBy(items, 'physical_closing') : null} value={sumBy(items, 'physical_closing_value')} unit={items[0].unit} />
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: varianceValueTotal === 0 ? '#15803d' : (varianceValueTotal < 0 ? '#b91c1c' : '#b45309') }}>
                        <QtyValue qty={sameUnit ? sumBy(items, 'variance') : null} value={varianceValueTotal} unit={items[0].unit} />
                      </td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>
        </Sheet>
      )}
    </div>
  )
}
