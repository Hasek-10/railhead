import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  Rocket,
  Settings,
  LogOut,
  User,
  ChevronRight,
  Terminal,
  ScrollText,
  History,
  Server,
  TerminalSquare,
  GitCompare,
  type LucideIcon,
} from 'lucide-react'

function RailheadIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="7" y="6" width="18" height="5" rx="1.5" fill="currentColor" />
      <rect x="13" y="11" width="6" height="12" rx="1" fill="currentColor" />
      <rect x="5" y="23" width="22" height="4" rx="1.5" fill="currentColor" />
    </svg>
  )
}

interface SidebarProps {
  username: string | null
  onLogout: () => void
  currentDirectory: string
  onDirectoryChange: (dir: string) => void
}

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
  { path: '/deploy', label: 'Deploy', icon: Rocket },
  { path: '/logs', label: 'Logs', icon: ScrollText },
  { path: '/environment', label: 'Environment', icon: Terminal },
  { path: '/deployments', label: 'Deployments', icon: History },
  { path: '/diff', label: 'Diff', icon: GitCompare },
  { path: '/services', label: 'Services', icon: Server },
  { path: '/terminal', label: 'Terminal', icon: TerminalSquare },
  { path: '/settings', label: 'Settings', icon: Settings },
]

function Sidebar({ username, onLogout, currentDirectory, onDirectoryChange }: SidebarProps): React.JSX.Element {
  const navigate = useNavigate()

  const handleDirectoryPick = async () => {
    const dir = await window.railway.openDirectoryDialog()
    if (dir) {
      onDirectoryChange(dir)
    }
  }

  return (
    <aside className="flex flex-col w-56 bg-surface border-r border-border h-full shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shrink-0">
          <RailheadIcon size={16} className="text-white" />
        </div>
        <div>
          <h1 className="text-text-primary font-semibold text-sm leading-tight">Railhead</h1>
          <p className="text-text-secondary text-xs">Desktop client for Railway</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-accent text-white font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? 'text-white' : 'text-text-secondary group-hover:text-text-primary'} />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight size={14} className="ml-auto text-white/70" />}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Current Directory */}
      <div className="px-3 py-2 mx-2 mb-2 rounded-md bg-bg border border-border">
        <p className="text-xs text-text-secondary mb-1">Working Directory</p>
        <button
          onClick={handleDirectoryPick}
          className="text-xs text-text-primary font-mono truncate w-full text-left hover:text-accent transition-colors"
          title={currentDirectory}
        >
          {currentDirectory || '~'}
        </button>
      </div>

      {/* User + Logout */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 bg-accent/20 rounded-full flex items-center justify-center shrink-0">
            <User size={13} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-text-primary text-xs font-medium truncate">
              {username || 'Unknown User'}
            </p>
            <p className="text-text-secondary text-xs">Railway</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs text-error hover:bg-error/10 transition-colors"
        >
          <LogOut size={13} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
