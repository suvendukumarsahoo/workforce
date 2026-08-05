import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useData } from '../hooks/useData.jsx'
import { Btn, Av } from '../components/ui.jsx'
import NotificationBell from '../components/NotificationBell.jsx'

// Pages
import Dashboard     from './shared/Dashboard.jsx'
import Parameters    from './manager/Parameters.jsx'
import GoalApprovals from './manager/GoalApprovals.jsx'
import Targets       from './shared/Targets.jsx'
import ExpApprovals  from './shared/ExpApprovals.jsx'
import Invoices      from './shared/Invoices.jsx'
import Customers     from './shared/Distributors.jsx'
import Products      from './shared/Products.jsx'
import Categories    from './shared/Categories.jsx'
import Attendance    from './shared/Attendance.jsx'
import Employees     from './admin/Employees.jsx'
import Payroll       from './shared/Payroll.jsx'
import Settings      from './admin/Settings.jsx'
import NewCustomerVisit from './shared/NewCustomerVisit.jsx'
import DistributorApproval from './manager/DistributorApproval.jsx'
import DistributorOrder from './shared/DistributorOrder.jsx'
import WMDashboard from './shared/WMDashboard.jsx'
import OrderApproval from './manager/OrderApproval.jsx'
import Vehicles from './shared/Vehicles.jsx'
import PickingDoneReport from './shared/PickingDoneReport.jsx'
import OrderStatus from './shared/OrderStatus.jsx'
import Warehouses from './shared/Warehouses.jsx'
import LoadCreatedList from './manager/LoadCreatedList.jsx'
import AssignedLoads from './shared/AssignedLoads.jsx'
import DriverOrderConfirmTile from '../components/DriverOrderConfirmTile.jsx'
import AllocationJourneyTile from '../components/AllocationJourneyTile.jsx'
import VehicleLiveMap from './shared/VehicleLiveMap.jsx'
import JourneyApprovals from './admin/JourneyApprovals.jsx'
import StockUpdate from './shared/StockUpdate.jsx'
import ProductionIssues from './shared/ProductionIssues.jsx'
import DistributorPresenceMap from './shared/DistributorPresenceMap.jsx'

const ALL_MENUS = [
  { id:'dashboard',     label:'Dashboard',        icon:'📊', sec:'Overview'  },
  { id:'parameters',    label:'Set Parameters',   icon:'⚙️',  sec:'Targets'   },
  { id:'goalApprovals', label:'Goal Approvals',   icon:'✅', sec:'Targets'   },
  { id:'targets',       label:'Targets',          icon:'🎯', sec:'Targets'   },
  { id:'expApprovals',  label:'Expense Approvals',icon:'💳', sec:'Finance'   },
  { id:'invoices',      label:'Invoices',         icon:'🧾', sec:'Finance'   },
  { id:'customers',     label:'Distributors',     icon:'🤝', sec:'Master'    },  
  { id:'products',      label:'Products',         icon:'📦', sec:'Master'    },
  { id:'categories',    label:'Categories',       icon:'🗂️',  sec:'Master'    },
  { id:'attendance',    label:'Attendance',       icon:'📅', sec:'HR'        },
  { id:'employees',     label:'Employees',        icon:'👥', sec:'HR'        },
  { id:'payroll',       label:'Payroll',          icon:'💰', sec:'HR'        },
  { id:'settings',      label:'Settings',         icon:'🔧', sec:'Admin'     },
  { id:'newCustomerVisit', label:'New Customer Visit', icon:'🚶', sec:'Distributor Functions' },
  { id:'distributorApproval', label:'New Distributor Approval', icon:'📋', sec:'Distributor Functions' },
  { id:'distributorOrder', label:'Distributor Order', icon:'🛒', sec:'Distributor Functions' },
  { id:'orderApproval', label:'Order Approval', icon:'📝', sec:'Distributor Functions' },
  { id:'wmDashboard', label:'Dashboard', icon:'📊', sec:'Overview' },
 { id:'picking', label:'Picking', icon:'📋', sec:'Overview' },
 { id:'stockUpdate', label:'Daily Stock Update', icon:'📦', sec:'Overview' },
 { id:'productionIssues', label:'Production Issues', icon:'⚠️', sec:'Overview' },
 { id:'vehicles', label:'Vehicles', icon:'🚚', sec:'Master' },
 { id:'warehouses', label:'Warehouses', icon:'🏭', sec:'Master' },
 { id:'pickingDoneReport', label:'Picking Done Report', icon:'📦', sec:'Distributor Functions' },
 { id:'orderStatus', label:'Order Status', icon:'\ud83d\udcca', sec:'Distributor Functions' },
{ id:'loadCreatedList', label:'Load Created List', icon:'📋', sec:'Distributor Functions' },
{ id:'vehicleLiveMap', label:'Live Tracking', icon:'📍', sec:'Distributor Functions' },
{ id:'geoBusinessView', label:'Geographical Business View', icon:'🗺️', sec:'Distributor Functions' },
{ id:'journeyApprovals', label:'Journey Approvals', icon:'🏁', sec:'Distributor Functions' },
{ id:'assignedLoads', label:'My Loads', icon:'🚚', sec:'Overview' },
{ id:'driverLoadingConfirm', label:'Confirm Loading', icon:'📦', sec:'Overview' },
{ id:'driverJourney', label:'Journey', icon:'🧭', sec:'Overview' },
]

const PAGE_MAP = {
  dashboard:     Dashboard,
  parameters:    Parameters,
  goalApprovals: GoalApprovals,
  targets:       Targets,
  expApprovals:  ExpApprovals,
  invoices:      Invoices,
  customers:     Customers,
  products:      Products,
  categories:    Categories,
  attendance:    Attendance,
  employees:     Employees,
  payroll:       Payroll,
  settings:      Settings,
  newCustomerVisit: NewCustomerVisit,
  distributorApproval: DistributorApproval,
  distributorOrder: DistributorOrder,
  orderApproval: OrderApproval,
  wmDashboard: WMDashboard,
  vehicles: Vehicles,
  warehouses: Warehouses, 
  pickingDoneReport: PickingDoneReport,
  orderStatus: OrderStatus,
loadCreatedList: LoadCreatedList,
vehicleLiveMap: VehicleLiveMap,
geoBusinessView: DistributorPresenceMap,
journeyApprovals: JourneyApprovals,
stockUpdate: StockUpdate,
productionIssues: ProductionIssues,
assignedLoads: AssignedLoads,
driverLoadingConfirm: DriverOrderConfirmTile,
driverJourney: AllocationJourneyTile,
}

export default function WebApp() {
  const { currentUser, role, logout, hasMenu } = useAuth()
  const { goals, expenses }              = useData()
  const [sideOpen, setSideOpen]          = useState(false)
  const isDriver = role?.id === 'r7'

  // First allowed menu is the default page
  const allowedMenus = ALL_MENUS.filter(m => hasMenu(m.id))
  const [nav, setNav] = useState(allowedMenus[0]?.id || 'dashboard')

  const pendingGoals = Object.values(goals  || {}).filter(g => g.status === 'pending' || g.status === 'partial').length
  const pendingExp   = (expenses || []).filter(e => e.status === 'pending').length

  const badge = { goalApprovals: pendingGoals, expApprovals: pendingExp }

  const sections = [...new Set(allowedMenus.map(m => m.sec))]

  const goTo = id => { setNav(id); setSideOpen(false) }

  const SideContent = () => (
    <>
      <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>🏢 WorkForce</div>
        <div style={{ color: '#475569', fontSize: 11, marginTop: 2, textTransform: 'capitalize' }}>
          {currentUser?.role?.name} portal
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {sections.map(sec => (
          <div key={sec}>
            <div style={{ padding: '10px 14px 3px', fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {sec}
            </div>
            {allowedMenus.filter(m => m.sec === sec).map(m => (
              <button key={m.id} onClick={() => goTo(m.id)} style={{
                width: '100%', textAlign: 'left',
                background: nav === m.id ? '#1e293b' : 'none',
                border: 'none',
                borderLeft: `3px solid ${nav === m.id ? '#3b82f6' : 'transparent'}`,
                color: nav === m.id ? '#fff' : '#94a3b8',
                padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 9,
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <span>{m.icon}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
                {badge[m.id] > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 700 }}>
                    {badge[m.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 14px', borderTop: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Av av={currentUser?.avatar || '?'} color={currentUser?.color || '#6b7280'} sz={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser?.name}
            </div>
            <div style={{ color: '#475569', fontSize: 10, textTransform: 'capitalize' }}>
              {currentUser?.role?.name}
            </div>
          </div>
          <button onClick={logout} title="Sign out" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>⏻</button>
        </div>
      </div>
    </>
  )

  const PageComponent = PAGE_MAP[nav] || Dashboard
  const curLabel      = allowedMenus.find(m => m.id === nav)?.label || ''

  if (isDriver) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ background: '#0f172a', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Av av={currentUser?.avatar || '?'} color={currentUser?.color || '#6b7280'} sz={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{curLabel}</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>{currentUser?.name}</div>
          </div>
          <NotificationBell onNavigate={goTo} />
          <button onClick={logout} title="Sign out" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>⏻</button>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <PageComponent onNavigate={goTo} />
        </div>

        {/* Bottom tab bar */}
        <div style={{
          display: 'flex', flexShrink: 0, background: '#fff', borderTop: '1px solid #e5e7eb',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {allowedMenus.map(m => (
            <button key={m.id} onClick={() => goTo(m.id)} style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '8px 4px 6px', position: 'relative',
              color: nav === m.id ? '#2563eb' : '#9ca3af',
            }}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <span style={{ fontSize: 10, fontWeight: nav === m.id ? 700 : 500 }}>{m.label}</span>
              {badge[m.id] > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: '28%', background: '#ef4444', color: '#fff',
                  fontSize: 9, minWidth: 14, height: 14, borderRadius: 7, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>
                  {badge[m.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", overflow: 'hidden' }}>

      {/* Mobile sidebar overlay */}
      {sideOpen && (
        <div onClick={() => setSideOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 230, height: '100%', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
            <SideContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div style={{ width: 220, background: '#0f172a', display: 'flex', flexDirection: 'column', flexShrink: 0 }} className="wf-desktop-sidebar">
        <SideContent />
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={() => setSideOpen(true)} className="wf-hamburger" style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>☰</button>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{curLabel}</div>
          <NotificationBell onNavigate={goTo} />
          <div style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '3px 8px', borderRadius: 6 }}>
            {new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <PageComponent onNavigate={goTo} />
        </div>
      </div>

      <style>{`
        @media(min-width:768px){
          .wf-desktop-sidebar{ display:flex !important }
          .wf-hamburger{ display:none !important }
        }
        @media(max-width:767px){
          .wf-desktop-sidebar{ display:none !important }
          .wf-hamburger{ display:block !important }
        }
      `}</style>
    </div>
  )
}
