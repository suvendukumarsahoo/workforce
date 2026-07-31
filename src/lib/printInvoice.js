const F = n => '₹' + Number(n || 0).toLocaleString('en-IN')

export function printInvoice({ invoice, distributorName, memberName, productName }) {
  const lines = invoice.lines || invoice.invoice_lines || []
  const total = lines.reduce((s, l) => s + l.qty * l.rate, 0)

  const rows = lines.map(l => `
    <tr>
      <td>${productName(l.product_id || l.pid)}</td>
      <td style="text-align:right">${l.qty}</td>
      <td style="text-align:right">${F(l.rate)}</td>
      <td style="text-align:right">${F(l.qty * l.rate)}</td>
    </tr>
  `).join('')

  const html = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoice.id}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 32px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; border-bottom: 2px solid #111827; padding: 8px 6px; font-size: 11px; text-transform: uppercase; }
        th:not(:first-child), td:not(:first-child) { text-align: right; }
        td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; }
        tfoot td { font-weight: 700; border-top: 2px solid #111827; border-bottom: none; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>WorkForce</h1>
      <div class="sub">Invoice</div>
      <div class="meta">
        <div>
          <div><strong>Invoice No:</strong> ${invoice.id}</div>
          <div><strong>Date:</strong> ${invoice.date}</div>
          ${invoice.erp_invoice_number ? `<div><strong>ERP No:</strong> ${invoice.erp_invoice_number}</div>` : ''}
        </div>
        <div>
          <div><strong>Distributor:</strong> ${distributorName}</div>
          ${memberName ? `<div><strong>Sales rep:</strong> ${memberName}</div>` : ''}
        </div>
      </div>
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td>${F(total)}</td></tr></tfoot>
      </table>
    </body>
    </html>
  `

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 300)
}
