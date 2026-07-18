import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useData } from '../hooks/useData.jsx'
import { Btn, Av } from '../components/ui.jsx'

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
}

export default function WebApp() {
  const { currentUser, logout, hasMenu } = useAuth()
  const { goals, expenses }              = useData()
  const [sideOpen, setSideOpen]          = useState(false)

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
