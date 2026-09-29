import * as db from './db.js'

// Every print*.js file calls this once (in its async `download*`/`print*` entry point, never inside
// a per-row loop — printSecondaryOrder.js's batch ZIP fetches it once and passes it down to its own
// synchronous builder, rather than once per order) — a single small fetch, the `organization` table
// has exactly one row. Falls back to `{}` (rendered as plain "WorkForce", no address/GSTIN line) if
// OrganizationSetup.jsx hasn't been filled in yet, or the fetch fails for any reason — a missing
// company profile must never block a PDF/print action.
export async function fetchOrgForPdf() {
  const { data } = await db.fetchOrganization()
  return data || {}
}

// Pure data shaping shared by every print*.js file, regardless of whether it renders via jsPDF
// (printDaySummary.js/printSecondaryOrder.js/printSecondaryReport.js) or an HTML template +
// window.print() (printInvoice.js/printJourney.js) — each renderer places these 3 lines with its
// own drawing mechanics, but none of them independently decides which org fields to show or in
// what order, so they can't drift out of sync with each other.
export function orgHeaderLines(org) {
  const name = org?.legal_name || org?.trade_name || 'WorkForce'
  const addressLine = [
    org?.address_line1, org?.address_line2,
    [org?.city, org?.state, org?.pincode].filter(Boolean).join(', '),
  ].filter(Boolean).join(', ')
  const statutoryLine = [org?.gstin && `GSTIN: ${org.gstin}`, org?.pan && `PAN: ${org.pan}`].filter(Boolean).join('   ·   ')
  return { name, addressLine, statutoryLine }
}

// jsPDF renderer — draws the name (+ address/statutory lines, only if set) at (x, startY) and
// returns the Y position the header actually ended on, so callers can shift the rest of their
// (often hand-positioned, fixed-Y) layout down by exactly `returnedY - startY` — 0 when the
// organization profile is still empty, so a PDF built before OrganizationSetup.jsx is ever filled
// in renders pixel-identical to before this existed.
export function drawOrgHeaderJsPdf(doc, org, x = 14, startY = 18) {
  const { name, addressLine, statutoryLine } = orgHeaderLines(org)
  doc.setFontSize(16)
  doc.setTextColor(17, 24, 39)
  doc.text(name, x, startY)
  let y = startY
  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  if (addressLine) { y += 5; doc.text(addressLine, x, y) }
  if (statutoryLine) { y += 4; doc.text(statutoryLine, x, y) }
  doc.setTextColor(17, 24, 39)
  return y
}

// HTML-template renderer (printInvoice.js/printJourney.js) — a string to splice in place of the
// old hardcoded `<h1>WorkForce</h1>`. Callers add matching `.org-address`/`.org-statutory` CSS
// (small, gray — same visual weight as their existing `.sub`/meta text).
export function orgHeaderHtml(org) {
  const { name, addressLine, statutoryLine } = orgHeaderLines(org)
  return `
    <h1>${name}</h1>
    ${addressLine ? `<div class="org-address">${addressLine}</div>` : ''}
    ${statutoryLine ? `<div class="org-statutory">${statutoryLine}</div>` : ''}
  `
}
