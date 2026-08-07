import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Sheet, Card, CH, Btn, Inp } from './ui.jsx'
import * as db from '../lib/db.js'

export default function LoadingScreen({ allocation, products, onClose, onAllComplete }) {
      const { currentUser } = useAuth()
      const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [stopIndex, setStopIndex] = useState(allocation.current_stop_index || 0)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [progress, setProgress] = useState({}) // order_item_id -> progress row
  const [liftStackInput, setLiftStackInput] = useState('')
  const [pauseReason, setPauseReason] = useState('')
  const [showPauseInput, setShowPauseInput] = useState(false)
  const [busy, setBusy] = useState(false)

  const stopSequence = allocation.stop_sequence || []
  const currentOrderId = stopSequence[stopIndex]

  useEffect(() => {
    (async () => {
      const { data } = await db.fetchAllocationOrders(allocation.id)
      setOrders(data || [])
      const { data: prog } = await db.fetchLoadItemProgress(allocation.id)
      const map = {}
      ;(prog || []).forEach(p => { map[p.order_item_id] = p })
      setProgress(map)      
      setLoading(false)
    })()
  }, [])

  const currentOrder = orders.find(o => o.id === currentOrderId)
  const activeItems = (currentOrder?.items || []).filter(it => !it.cancelled)

  const itemStatus = (item) => progress[item.id]?.status || 'pending'
  const itemLoadedQty = (item) => progress[item.id]?.loaded_qty || 0
  const itemBalance = (item) => item.final_qty - itemLoadedQty(item)

  const stopFullyLoaded = activeItems.length > 0 && activeItems.every(it => itemStatus(it) === 'complete')

  const selectedItem = activeItems.find(it => it.id === selectedItemId)
  const selectedProgress = selectedItemId ? progress[selectedItemId] : null

  const startLoadingItem = async (item) => {
    const lift = Number(liftStackInput)
    if (!lift || lift <= 0) return
    const { data } = await db.createLoadItemProgress(allocation.id, item.id, lift)
    setProgress(p => ({ ...p, [item.id]: data }))
    setSelectedItemId(item.id)
    setLiftStackInput('')
  }

  const clickLiftButton = async (buttonIndex, buttonQty) => {
    if (!selectedProgress || busy) return
    setBusy(true)
    const newLoaded = Math.min(selectedProgress.loaded_qty + buttonQty, selectedItem.final_qty)
    const isComplete = newLoaded >= selectedItem.final_qty
    const { data } = await db.updateLoadItemProgress(selectedProgress.id, {
      loaded_qty: newLoaded,
      status: isComplete ? 'complete' : 'loading',
      completed_at: isComplete ? new Date().toISOString() : null,
    })
    setProgress(p => ({ ...p, [selectedItem.id]: data }))
    setBusy(false)
    if (isComplete) setSelectedItemId(null)
  }

  const togglePause = async () => {
    if (!selectedProgress) return
    if (selectedProgress.status === 'paused') {
      const { data } = await db.updateLoadItemProgress(selectedProgress.id, { status: 'loading', pause_reason: null })
      setProgress(p => ({ ...p, [selectedItem.id]: data }))
    } else {
      setShowPauseInput(true)
    }
  }

  const confirmPause = async () => {
    if (!pauseReason.trim()) return
    const { data } = await db.updateLoadItemProgress(selectedProgress.id, { status: 'paused', pause_reason: pauseReason.trim() })
    setProgress(p => ({ ...p, [selectedItem.id]: data }))
    setShowPauseInput(false)
    setPauseReason('')
  }

  const [waitingDriverConfirm, setWaitingDriverConfirm] = useState(false)

  const confirmStopComplete = async () => {
    setBusy(true)
    await db.markOrderWmLoaded(currentOrderId)
    setBusy(false)
    setWaitingDriverConfirm(true)
  }

  useEffect(() => {
    if (!waitingDriverConfirm) return
    const interval = setInterval(async () => {
      const { data } = await db.fetchOrderLoadingStage(currentOrderId)
      if (data?.loading_stage === 'driver_confirmed') {
        clearInterval(interval)
        setWaitingDriverConfirm(false)
        const nextIndex = stopIndex + 1
        if (nextIndex >= stopSequence.length) {
          await db.markLoadingComplete(allocation.id)
          db.logActivity(currentUser?.id, 'update', 'allocation', `Loading complete — allocation #${allocation.id}`, allocation.id)
          const distNames = orders.map(o => o.distributor?.name).filter(Boolean).join(', ')
          await db.createNotification({
            target_roles: ['r1', 'r3'],
            title: 'Loading Complete',
            body: `${distNames || 'Load #' + allocation.id} — ready for invoicing`,
            type: 'loading_complete',
            ref_id: String(allocation.id),
          })
          onAllComplete()
        } else {
          await db.advanceStopIndex(allocation.id, nextIndex)
          setStopIndex(nextIndex)
          setSelectedItemId(null)
        }
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [waitingDriverConfirm, currentOrderId])

  const liftStackButtons = () => {
    if (!selectedItem || !selectedProgress) return []
    const total = selectedItem.final_qty
    const lift = selectedProgress.lift_stack_qty
    const count = Math.ceil(total / lift)
    return Array.from({ length: count }, (_, i) => {
      const qty = Math.min(lift, total - i * lift)
      return { index: i, qty }
    })
  }

  if (loading) {
    return (
      <Sheet title="Loading..." onClose={onClose}>
        <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading order data...</div>
      </Sheet>
    )
  }

  if (!currentOrder) {
    return (
      <Sheet title="No more stops" onClose={onClose}>
        <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Nothing to load</div>
      </Sheet>
    )
  }

  const stopsRemaining = stopSequence.length - stopIndex
  const isLastStop = stopIndex === stopSequence.length - 1

  return (
    <Sheet
      title={`${isLastStop ? 'Load First' : `Stop ${stopIndex + 1} of ${stopSequence.length}`} — ${currentOrder.distributor?.name}`}
      sub={`${currentOrder.distributor?.area || ''}${currentOrder.distributor?.town ? `, ${currentOrder.distributor.town}` : ''} · ${stopsRemaining} stop(s) remaining to load`}
      onClose={onClose}
    >
      {selectedItem ? (
        <>
          <Card style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <div style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
{(products || []).find(p => p.id === selectedItem.product_id)?.name || selectedItem.product_id}
              </div>
              <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>
                Loaded: {itemLoadedQty(selectedItem)} / {selectedItem.final_qty} · Balance: {itemBalance(selectedItem)}
              </div>
              {selectedProgress?.status === 'paused' && (
                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>⏸ Paused — {selectedProgress.pause_reason}</div>
              )}
            </div>
          </Card>

          <Card>
            <CH title="Lift Stack" sub={`${selectedProgress.lift_stack_qty} cartons per lift`} />
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(64px,1fr))', gap: 8 }}>
              {liftStackButtons().map((btn, i) => {
                const alreadyLoaded = i * selectedProgress.lift_stack_qty < itemLoadedQty(selectedItem)
                return (
                  <button
                    key={btn.index}
                    disabled={alreadyLoaded || selectedProgress.status === 'paused' || busy}
                    onClick={() => clickLiftButton(btn.index, btn.qty)}
                    style={{
                      aspectRatio: '1', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13,
                      background: alreadyLoaded ? '#10b981' : '#ef4444', color: '#fff',
                      cursor: alreadyLoaded || selectedProgress.status === 'paused' ? 'default' : 'pointer',
                      opacity: selectedProgress.status === 'paused' && !alreadyLoaded ? 0.5 : 1,
                    }}
                  >
                    {btn.qty}
                  </button>
                )
              })}
            </div>
          </Card>

          {showPauseInput ? (
            <Card>
              <div style={{ padding: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Reason for pause</label>
                <textarea value={pauseReason} onChange={e => setPauseReason(e.target.value)} rows={2}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Btn v="pri" full onClick={confirmPause}>Confirm Pause</Btn>
                  <Btn full onClick={() => setShowPauseInput(false)}>Cancel</Btn>
                </div>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn full onClick={togglePause}>{selectedProgress?.status === 'paused' ? 'Resume' : 'Pause'}</Btn>
              <Btn full onClick={() => setSelectedItemId(null)}>Back to Items</Btn>
            </div>
          )}
        </>
      ) : (
        <>
          <Card>
            <CH title="Items to Load" />
            {activeItems.map(it => {
              const status = itemStatus(it)
              return (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
<div style={{ fontWeight: 600, fontSize: 13 }}>{(products || []).find(p => p.id === it.product_id)?.name || it.product_id}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      Qty {it.final_qty} · {status === 'complete' ? `Loaded ${itemLoadedQty(it)}` : status === 'loading' || status === 'paused' ? `${itemLoadedQty(it)} / ${it.final_qty} loaded` : 'Not started'}
                    </div>
                  </div>
                  {status === 'complete' ? (
                    <span style={{ color: '#10b981', fontWeight: 700, fontSize: 12 }}>✓ Loaded</span>
                  ) : status === 'loading' || status === 'paused' ? (
                    <Btn sm v="pri" onClick={() => setSelectedItemId(it.id)}>Continue</Btn>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" placeholder="Lift stack" value={liftStackInput} onChange={e => setLiftStackInput(e.target.value)}
                        style={{ width: 70, padding: '5px 7px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
                      <Btn sm v="pri" onClick={() => startLoadingItem(it)}>Start</Btn>
                    </div>
                  )}
                </div>
              )
            })}
          </Card>

          {waitingDriverConfirm ? (
            <div style={{ textAlign: 'center', padding: 14, color: '#f59e0b', fontWeight: 600, fontSize: 13, background: '#fffbeb', borderRadius: 10 }}>
              ⏳ Waiting for Driver to confirm loaded quantity...
            </div>
          ) : (
            <Btn v="pri" full disabled={!stopFullyLoaded || busy} onClick={confirmStopComplete}>
              {busy ? 'Processing...' : (stopFullyLoaded ? 'Send for Driver Confirmation' : 'Load all items to continue')}
            </Btn>
          )}
        </>
      )}
    </Sheet>
  )
}