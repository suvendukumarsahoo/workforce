import { useState } from 'react'
import { useData } from '../hooks/useData.jsx'
import { Tile, Sheet, Btn } from './ui.jsx'
import * as db from '../lib/db.js'
import LoadingScreen from './LoadingScreen.jsx'

export default function LoadingInProgressTile() {
  const { products } = useData()
  const [allocations, setAllocations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [showList, setShowList] = useState(false)
  const [activeLoading, setActiveLoading] = useState(null)

  const loadData = async () => {
    const { data } = await db.fetchInProgressAllocations()
    setAllocations(data || [])
    setLoaded(true)
  }
  if (!loaded) loadData()

  return (
    <>
      <Tile icon="📦" label="Loading In Progress" value={allocations.length} sub="Tap to view" color="#f59e0b" onClick={() => setShowList(true)} />

      {showList && (
        <Sheet title="Loading In Progress" sub={`${allocations.length} vehicle(s)`} onClose={() => setShowList(false)}>
          {allocations.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No loads in progress</div>}
          {allocations.map(a => (
            <div key={a.id} style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.id} — {a.vehicle?.vehicle_number}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                Supervisor: {a.load_supervisor_name} · Stop {(a.current_stop_index || 0) + 1} of {(a.stop_sequence || []).length}
              </div>
              <Btn sm v="pri" onClick={() => { setActiveLoading(a); setShowList(false) }}>Continue Loading</Btn>
            </div>
          ))}
        </Sheet>
      )}

      {activeLoading && (
        <LoadingScreen
          allocation={activeLoading}
          products={products}
          onClose={() => setActiveLoading(null)}
          onAllComplete={() => { setActiveLoading(null); loadData() }}
        />
      )}
    </>
  )
}