import { jsPDF } from 'jspdf'
import JSZip from 'jszip'

// jsPDF's built-in fonts don't reliably render the ₹ glyph, so amounts use an "Rs" prefix here —
// same reasoning would apply to any non-Latin glyph in the default fonts.
const F = n => 'Rs ' + Number(n || 0).toLocaleString('en-IN')

// Builds one secondary order as a jsPDF document — same layout spirit as printInvoice.js's HTML
// table (header/meta block + line-items table + total), just drawn via jsPDF's own text/line calls
// instead of window.print(), since this needs to produce a real downloadable file (single or
// bundled into a batch ZIP), not just open a print dialog.
export function buildSecondaryOrderPdf({ order, outletName, productName }) {
  const items = order.items || []
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)

  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('WorkForce', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text('Secondary Order', 14, 24)
  doc.setTextColor(17, 24, 39)

  doc.setFontSize(10)
  doc.text(`Order No: ${order.id}`, 14, 36)
  doc.text(`Date: ${order.order_date}`, 14, 42)
  doc.text(`Outlet: ${outletName}`, 120, 36)

  let y = 56
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Product', 14, y)
  doc.text('Qty', 130, y, { align: 'right' })
  doc.text('Rate', 162, y, { align: 'right' })
  doc.text('Amount', 196, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.line(14, y + 2, 196, y + 2)
  y += 8

  items.forEach(it => {
    doc.text(String(productName(it.product_id)), 14, y)
    doc.text(String(it.qty), 130, y, { align: 'right' })
    doc.text(F(it.rate), 162, y, { align: 'right' })
    doc.text(F((Number(it.qty) || 0) * (Number(it.rate) || 0)), 196, y, { align: 'right' })
    y += 7
  })

  doc.line(14, y, 196, y)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.text('Total', 162, y, { align: 'right' })
  doc.text(F(total), 196, y, { align: 'right' })

  return doc
}

export function downloadSecondaryOrderPdf(args) {
  buildSecondaryOrderPdf(args).save(`Order-${args.order.id}.pdf`)
}

// Bundles every order's individual PDF into one ZIP — real separate files, not one combined
// multi-page document, per the explicit ask for a genuine batch of individual PDFs.
export async function downloadSecondaryOrdersBatch(orders, { outletName, productName }) {
  const zip = new JSZip()
  orders.forEach(order => {
    const doc = buildSecondaryOrderPdf({ order, outletName: outletName(order), productName })
    zip.file(`Order-${order.id}.pdf`, doc.output('blob'))
  })
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Secondary-Orders-${orders[0]?.order_date || 'batch'}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
