import { useState } from 'react'
import { useData } from '../../hooks/useData.jsx'
import { Card, CH, Sheet } from '../../components/ui.jsx'
import OrderFullDetail from '../../components/OrderFullDetail.jsx'
import * as db from '../../lib/db.js'

export default function PickingDoneReport() {
  const { products } = useData()
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState(null)

  const loadData = async () => {
    const { data } = await db.fetchAllOrdersWithItems()
    setOrders((data || []).filter(o => o.picking_status === 'ready_for_load' && !o.load_id))
    const { data: payData } = await db.fetchOrderPayments()
    setPayments(payData || [])
    setLoaded(true)
  }
  if (!loaded) loadData()

  return (
    <div>
      <Card>
        <CH title="Picking Done Report" sub={`${orders.length} order(s) waiting for load creation`} />
        {orders.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No orders waiting for load creation</div>}
        {orders.map(o => (
          <div key={o.id} onClick={() => setSelected(o)} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Order #{o.id} — {o.distributor?.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(o.order_date).toLocaleString('en-IN')}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>Waiting for Load Creation</div>
          </div>
        ))}
      </Card>

      {selected && (
        <OrderFullDetail
          order={selected} payment={payments.find(p => p.order_id === selected.id)} products={products}
          onClose={() => setSelected(null)}
          onChanged={async () => { await loadData(); setSelected(null) }}
        />
      )}
    </div>
  )
}