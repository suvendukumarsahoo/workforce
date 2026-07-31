import { useState } from 'react'
import { Tile, Sheet, Btn } from './ui.jsx'
import * as db from '../lib/db.js'
import StartLoadSheet from './StartLoadSheet.jsx'
import LoadingScreen from './LoadingScreen.jsx'
import { useData } from '../hooks/useData.jsx'

export default function VehicleParkedTile() { 
  const [allocations, setAllocations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [showList, setShowList] = useState(false)
  const [startingLoad, setStartingLoad] = useState(null)
  const [activeLoading, setActiveLoading] = useState(null)
const { products } = useData()
  
  const loadData = async () => {
    const { data } = await db.fetchParkedAllocations()
    setAllocations(data || [])
    setLoaded(true)
  }
  if (!loaded) loadData()

  return (
    <>
      <Tile icon="🅿️" label="Vehicle Parked for Loading" value={allocations.length} sub="Tap to view" color="#2563eb" onClick={() => setShowList(true)} />

      {showList && (
        <Sheet title="Vehicle Parked for Loading" sub={`${allocations.length} vehicle(s) waiting`} onClose={() => setShowList(false)}>
          {allocations.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No vehicles parked</div>}
          {allocations.map(a => (
            <div key={a.id} style={{ padding: '12px 4px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.id} — {a.vehicle?.vehicle_number}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                Driver: {a.driver?.name} · Parked at {new Date(a.vehicle_parked_at).toLocaleTimeString('en-IN')}
              </div>
              <Btn sm v="pri" onClick={() => { setStartingLoad(a); setShowList(false) }}>
                Confirm Arrival & Start Load
              </Btn>
            </div>
          ))} 
        </Sheet>
      )}
      {startingLoad && (
        <StartLoadSheet
          allocation={startingLoad}
          onClose={() => setStartingLoad(null)}
          onStarted={async () => {
            await loadData()
            setActiveLoading(startingLoad)
            setStartingLoad(null)
          }}
        />
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