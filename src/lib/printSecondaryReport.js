import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// PDF/Excel export for the Distributor Secondary Order Report (Summary + Detail tabs) — this
// app's first genuine multi-row/multi-column TABLE export. Every existing PDF here
// (printInvoice.js/printSecondaryOrder.js/printDaySummary.js/printJourney.js) hand-positions a
// small, bounded number of rows via jsPDF's own text()/line() calls; a filtered report can run to
// many rows, so this uses jsPDF's official `jspdf-autotable` plugin for automatic pagination
// instead — first use of that plugin in this app, same "first X" flag as recharts/jspdf/jszip.
// `columns`: [{ header, key }]. `rows`: plain objects keyed by `key`.

export function buildReportPdf({ title, sub, columns, rows }) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })

  doc.setFontSize(16)
  doc.text('WorkForce', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text(title, 14, 24)
  if (sub) doc.text(sub, 14, 29)
  doc.setTextColor(17, 24, 39)

  autoTable(doc, {
    startY: sub ? 36 : 32,
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => r[c.key] ?? '')),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
  })

  return doc
}

export function downloadReportPdf({ filename, ...args }) {
  buildReportPdf(args).save(filename)
}

export function downloadReportExcel({ filename, sheetName, columns, rows }) {
  const mapped = rows.map(r => Object.fromEntries(columns.map(c => [c.header, r[c.key] ?? ''])))
  const ws = XLSX.utils.json_to_sheet(mapped)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Report')
  XLSX.writeFile(wb, filename)
}
