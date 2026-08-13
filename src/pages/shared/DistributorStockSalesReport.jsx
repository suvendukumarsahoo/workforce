import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Btn, Sheet } from '../../components/ui.jsx'
import * as db from '../../lib/db.js'
import { downloadReportPdf, downloadReportExcel } from '../../lib/printSecondaryReport.js'
import { computeStockTakePeriods, round1 } from '../../lib/stockReport.js'

const selStyle = { padding: '6px 9px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }
const uniqById = arr => Object.values(Object.fromEntries((arr || []).filter(Boolean).map(x => [x.id, x])))
const fmtQty = (n, unit) => (n === null || n === undefined ? '—' : `${round1(n)} ${unit || ''}`.trim())

// Periods are anchored to real stock-take dates, not a user-chosen date range — no From/To filter
// here, unlike DistributorSecondaryReport.jsx. Summary = latest period per (distributor,product);
// Detail = every stock-take-to-stock-take period ever recorded, grouped under a period header rather
// than repeating From/To on every row. Closing shown throughout is the CALCULATED figure
// (Opening+Receipts-Sales) — the physical count and its variance against Calculated Closing now live
// exclusively in the Discrepancy Reports tab (one snapshot per physical stock take, generated
// automatically by StockTakeEntry.jsx). Opening Stock (one-time baseline entry, Manager→Admin
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
      distributorIds: scopeDistributorIds, productIds: null,
    }))
  }
  useEffect(() => { if (scopeDistributorIds.length) load() }, [repId, scopeDistributorIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const distributorName = id => (distributors || []).find(d => d.id === id)?.name || id
  const distributorOptions = uniqById(scopeDistributors)
  const productOptions = uniqById(products || [])
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

  const filterRow = r => (!distributorId || r.distributorId === distributorId) && (!productId || r.productId === productId)
  const summaryRows = (data?.latest || []).filter(filterRow).map(r => ({ ...r, distributorName: distributorName(r.distributorId) }))
  const detailRows = (data?.periods || []).filter(filterRow).map(r => ({ ...r, distributorName: distributorName(r.distributorId) }))

  const withDisplay = rows => rows.map(r => ({
    ...r, periodDisp: `${r.from || 'First'} → ${r.to}`,
    openingDisp: fmtQty(r.opening, r.unit), receiptsDisp: fmtQty(r.receipts, r.unit),
    salesDisp: fmtQty(r.sales, r.unit), closingDisp: fmtQty(r.calculatedClosing, r.unit),
  }))

  const summaryColumns = [
    { header: 'Distributor', key: 'distributorName' }, { header: 'Product', key: 'productName' },
    { header: 'Period', key: 'periodDisp' }, { header: 'Opening', key: 'openingDisp' },
    { header: 'Receipts', key: 'receiptsDisp' }, { header: 'Delivered Sales', key: 'salesDisp' },
    { header: 'Closing', key: 'closingDisp' },
  ]
  // Detail's on-screen table groups rows under a period header instead of repeating it per row —
  // this is the row shape within one such group (no Period column, it's the group's own header).
  const detailRowColumns = [
    { header: 'Distributor', key: 'distributorName' }, { header: 'Product', key: 'productName' },
    { header: 'Opening', key: 'openingDisp' }, { header: 'Receipts', key: 'receiptsDisp' },
    { header: 'Delivered Sales', key: 'salesDisp' }, { header: 'Closing', key: 'closingDisp' },
  ]

  const summaryDisp = withDisplay(summaryRows)
  const detailDisp = withDisplay(detailRows)

  // Exports stay flat (Period as its own column) regardless of how Detail groups on screen —
  // that's a display convenience, not something a PDF/Excel consumer wants collapsed away. Same
  // column shape for both tabs (summaryColumns), only the row set differs.
  const activeColumns = summaryColumns
  const activeRows = tab === 'summary' ? summaryDisp : detailDisp

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

  // Detail tab: group by period, keyed on takeId — not the from/to date strings. Two stock takes
  // (for the same distributor, or different ones) can share a calendar date, and a date-string key
  // would incorrectly merge their rows into one section (or worse, conflate two different
  // distributors' periods together, since dates alone say nothing about which distributor). takeId
  // is unique per take and inherently distributor-specific already. Most recent first.
  const periodGroups = {}
  detailDisp.forEach(r => {
    if (!periodGroups[r.takeId]) periodGroups[r.takeId] = { takeId: r.takeId, from: r.from, to: r.to, distributorName: r.distributorName, rows: [] }
    periodGroups[r.takeId].rows.push(r)
  })
  const periodGroupList = Object.values(periodGroups).sort((a, b) => new Date(b.to) - new Date(a.to))

  const reportRows = (discrepancyReports || []).filter(r => !distributorId || r.distributor_id === distributorId)
  const varianceCount = r => (r.items || []).filter(it => Number(it.variance) !== 0).length

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

      {data !== null && tab === 'summary' && (
        <Card>
          <CH title="Summary" sub={`${summaryDisp.length} row(s)`} />
          {summaryDisp.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No physical stock takes recorded yet</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {summaryColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {summaryDisp.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{r.distributorName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.productName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.periodDisp}</td>
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

      {data !== null && tab === 'detail' && (
        <>
          {periodGroupList.length === 0 && (
            <Card><div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>No physical stock takes recorded yet</div></Card>
          )}
          {periodGroupList.map(g => (
            <Card key={g.takeId}>
              <CH title={`${g.distributorName} — Period: ${g.from || 'First'} → ${g.to}`} sub={`${g.rows.length} row(s)`} />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {detailRowColumns.map(c => <th key={c.key} style={{ padding: '8px 10px', fontSize: 10, textAlign: 'left', textTransform: 'uppercase', color: '#6b7280' }}>{c.header}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{r.distributorName}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12 }}>{r.productName}</td>
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
          ))}
        </>
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
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.id}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.distributor?.name || r.distributor_id} · {r.report_date}</div>
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
        <Sheet title={viewReport.id} sub={`${viewReport.distributor?.name || viewReport.distributor_id} · ${viewReport.report_date}`} onClose={() => setViewReport(null)} zIndex={320}>
          {(viewReport.items || []).map(it => (
            <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.product?.name || it.product_id}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b7280', marginTop: 3, flexWrap: 'wrap' }}>
                <span>Opening: {fmtQty(it.opening, it.product?.unit)}</span>
                <span style={{ color: '#15803d' }}>Receipts: {fmtQty(it.receipts, it.product?.unit)}</span>
                <span style={{ color: '#b91c1c' }}>Sales: {fmtQty(it.sales, it.product?.unit)}</span>
                <span>Calculated: {fmtQty(it.calculated_closing, it.product?.unit)}</span>
                <span style={{ fontWeight: 700 }}>Physical: {fmtQty(it.physical_closing, it.product?.unit)}</span>
                <span style={{ fontWeight: 700, color: Number(it.variance) === 0 ? '#15803d' : (Number(it.variance) < 0 ? '#b91c1c' : '#b45309') }}>
                  Variance: {it.variance === null ? '—' : `${it.variance > 0 ? '+' : ''}${round1(it.variance)} ${it.product?.unit || ''}`.trim()}
                </span>
              </div>
            </div>
          ))}
        </Sheet>
      )}
    </div>
  )
}
