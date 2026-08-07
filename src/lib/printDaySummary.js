import { jsPDF } from 'jspdf'

// Same jsPDF text/line-call pattern as printSecondaryOrder.js — a real downloadable PDF, not a
// window.print() dialog, since this needs to work as a standalone "receipt" for a completed day's
// retailing. Rs prefix instead of ₹ for the same reason printSecondaryOrder.js uses it: jsPDF's
// built-in fonts don't reliably render the ₹ glyph.
const F = n => 'Rs ' + Number(n || 0).toLocaleString('en-IN')

export function buildDaySummaryPdf({ summary, visits, orders, productName }) {
  const noOrderVisits = (visits || []).filter(v => v.outcome === 'no_order')
  const orderValue = o => (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)

  const productTotals = {}
  ;(orders || []).forEach(o => {
    (o.items || []).forEach(it => {
      const key = it.product_id
      if (!productTotals[key]) productTotals[key] = { name: it.product?.name || productName(key), qty: 0, value: 0 }
      productTotals[key].qty += Number(it.qty) || 0
      productTotals[key].value += (Number(it.qty) || 0) * (Number(it.rate) || 0)
    })
  })
  const productRows = Object.values(productTotals).sort((a, b) => b.value - a.value)
  const totalValue = (orders || []).reduce((s, o) => s + orderValue(o), 0)

  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('WorkForce', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text('Day Summary — Retailing Complete', 14, 24)
  doc.setTextColor(17, 24, 39)

  doc.setFontSize(10)
  doc.text(`Summary ID: ${summary.id}`, 14, 36)
  doc.text(`Date: ${summary.summary_date}`, 14, 42)
  doc.text(`Generated: ${new Date(summary.created_at).toLocaleString('en-IN')}`, 120, 36)

  let y = 56
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Outlet-wise', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.line(14, y + 2, 196, y + 2)
  y += 8

  ;(orders || []).forEach(o => {
    doc.text(String(o.outlet?.name || o.outlet_id), 14, y)
    doc.text('Ordered', 130, y)
    doc.text(F(orderValue(o)), 196, y, { align: 'right' })
    y += 7
  })
  noOrderVisits.forEach(v => {
    doc.text(String(v.outlet?.name || v.outlet_id), 14, y)
    doc.text(`No Order — ${v.no_order_reason || ''}`, 130, y)
    y += 7
  })
  if ((orders || []).length === 0 && noOrderVisits.length === 0) {
    doc.setTextColor(107, 114, 128)
    doc.text('No visits recorded', 14, y)
    doc.setTextColor(17, 24, 39)
    y += 7
  }

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.text('Product-wise', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.line(14, y + 2, 196, y + 2)
  y += 8
  productRows.forEach(p => {
    doc.text(String(p.name), 14, y)
    doc.text(String(p.qty), 130, y, { align: 'right' })
    doc.text(F(p.value), 196, y, { align: 'right' })
    y += 7
  })
  if (productRows.length === 0) {
    doc.setTextColor(107, 114, 128)
    doc.text('No orders', 14, y)
    doc.setTextColor(17, 24, 39)
    y += 7
  }

  y += 4
  doc.line(14, y, 196, y)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.text(`Outlets Visited: ${(visits || []).length}`, 14, y)
  doc.text(`Orders: ${(orders || []).length}`, 90, y)
  doc.text(`Total Value: ${F(totalValue)}`, 196, y, { align: 'right' })

  return doc
}

export function downloadDaySummaryPdf(args) {
  buildDaySummaryPdf(args).save(`DaySummary-${args.summary.id}.pdf`)
}
