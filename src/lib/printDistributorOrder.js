import { jsPDF } from 'jspdf'
import { fetchOrgForPdf, drawOrgHeaderJsPdf } from './printOrgHeader.js'
import { getOrderStageLabel } from '../components/orderStageLabel.js'

// jsPDF's built-in fonts don't reliably render the ₹ glyph, same reasoning as printSecondaryOrder.js.
const F = n => 'Rs ' + Number(n || 0).toLocaleString('en-IN')

// The primary Distributor Order pipeline's own PDF (distributor_orders) — same layout spirit as
// printSecondaryOrder.js (a purchase-order-style document: header/meta block + line-items table +
// total), which only ever covered the separate Distributor Secondary cart-based orders. Reachable
// from OrderFullDetail.jsx at any stage of the order, not gated on invoicing — unlike that
// component's existing "Download PDF" button, which is specifically the Invoice, generated only
// once one exists. Quantity shown is final_qty once picking has actually started (same "best known
// quantity so far" reasoning OrderFullDetail.jsx's own Items table already uses), order_qty before
// that — `org` is a plain param, not fetched in here, same convention as every other build*Pdf here.
// `categoryName` follows the same shape/fallback as OrderApproval.jsx's own local resolver
// (`cid => (categories || []).find(c => c.id === cid)?.name || 'Uncategorized'`) — the category
// summary below is deliberately the same qty+value-per-category grouping that screen already shows
// on-screen for this exact order data (its own `categorySummary`/`grandTotal`), just added here too.
export function buildDistributorOrderPdf({ order, productName, categoryName, org }) {
  const activeItems = (order.items || []).filter(it => !it.cancelled)
  const pickingStarted = ['picking_done', 'ready_for_load'].includes(order.picking_status) || !!order.load_id
  const qtyFor = it => pickingStarted ? it.final_qty : it.order_qty
  const totalQty = activeItems.reduce((s, it) => s + qtyFor(it), 0)
  const total = activeItems.reduce((s, it) => s + it.rate * qtyFor(it), 0)

  const categoryGroups = {}
  activeItems.forEach(it => {
    const key = categoryName ? categoryName(it.category_id) : 'Uncategorized'
    const qty = qtyFor(it)
    if (!categoryGroups[key]) categoryGroups[key] = { qty: 0, value: 0 }
    categoryGroups[key].qty += qty
    categoryGroups[key].value += it.rate * qty
  })

  const doc = new jsPDF()

  const headerY = drawOrgHeaderJsPdf(doc, org, 14, 18)
  const offset = headerY - 18
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text('Distributor Order', 14, 24 + offset)
  doc.setTextColor(17, 24, 39)

  doc.setFontSize(10)
  doc.text(`Order No: ${order.id}`, 14, 36 + offset)
  doc.text(`Created: ${new Date(order.order_date).toLocaleString('en-IN')}`, 14, 42 + offset)
  doc.text(`Status: ${getOrderStageLabel(order)}`, 14, 48 + offset)
  doc.text(`Distributor: ${order.distributor?.name || order.distributor_id}`, 120, 36 + offset)
  doc.text(`Sales Rep: ${order.member?.name || '—'}`, 120, 42 + offset)

  let y = 62 + offset
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Product', 14, y)
  doc.text('Qty', 130, y, { align: 'right' })
  doc.text('Rate', 162, y, { align: 'right' })
  doc.text('Amount', 196, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.line(14, y + 2, 196, y + 2)
  y += 8

  activeItems.forEach(it => {
    const qty = qtyFor(it)
    doc.text(String(productName(it.product_id)), 14, y)
    doc.text(String(qty), 130, y, { align: 'right' })
    doc.text(F(it.rate), 162, y, { align: 'right' })
    doc.text(F(it.rate * qty), 196, y, { align: 'right' })
    y += 7
  })

  doc.line(14, y, 196, y)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.text('Total', 14, y)
  doc.text(String(totalQty), 130, y, { align: 'right' })
  doc.text(F(total), 196, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  y += 16
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Category Summary', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.line(14, y + 2, 196, y + 2)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.text('Category', 14, y)
  doc.text('Qty', 130, y, { align: 'right' })
  doc.text('Value', 196, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += 6

  Object.entries(categoryGroups).forEach(([cat, g]) => {
    doc.text(cat, 14, y)
    doc.text(String(g.qty), 130, y, { align: 'right' })
    doc.text(F(g.value), 196, y, { align: 'right' })
    y += 7
  })

  return doc
}

export async function downloadDistributorOrderPdf(args) {
  const org = await fetchOrgForPdf()
  buildDistributorOrderPdf({ ...args, org }).save(`DistributorOrder-${args.order.id}.pdf`)
}
