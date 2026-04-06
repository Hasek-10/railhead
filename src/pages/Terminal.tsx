import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Plus, X, Terminal as TermIcon, Wifi, Server, Play, Loader2, ChevronDown, AlertCircle } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { prefetchProjects, getCachedProjects } from '../cache'

interface Project {
  id: string
  name: string
  environments: { id: string; name: string }[]
  services: { id: string; name: string }[]
}

interface Session {
  id: string
  title: string
  type: 'shell' | 'ssh' | 'run'
  status: 'connecting' | 'active' | 'exited' | 'error'
  projectId?: string
  environmentId?: string
  exitCode?: number
  errorMsg?: string
}

let sessionCounter = 0
function genId() { return `pty-${Date.now()}-${++sessionCounter}` }

// ── Main Terminal page ────────────────────────────────────────────────────────

function parseCachedProjects(r: { stdout: string }): Project[] {
  try {
    const parsed = JSON.parse(r.stdout)
    const projs: any[] = Array.isArray(parsed) ? parsed : (parsed.projects ?? [])
    return projs.map(p => ({
      id: p.id, name: p.name,
      environments: (p.environments?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name })),
      services: (p.services?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name })),
    }))
  } catch { return [] }
}

// Stores the PTY command keyed by session id so TerminalPane can access it
const sessionCmds = new Map<string, string | null>()

function Terminal(): React.JSX.Element {
  const _cached = getCachedProjects()
  const _cachedProjs = _cached ? parseCachedProjects(_cached) : []

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>(_cachedProjs)
  const [selectedProject, setSelectedProject] = useState<string>(_cachedProjs[0]?.id ?? '')
  const [selectedEnv, setSelectedEnv] = useState<string>(_cachedProjs[0]?.environments?.[0]?.id ?? '')
  const [selectedService, setSelectedService] = useState<string>(_cachedProjs[0]?.services?.[0]?.id ?? '')
  const [customCmd, setCustomCmd] = useState('')
  const [showLauncher, setShowLauncher] = useState(true)
  const [loadingProjects, setLoadingProjects] = useState(!_cached)

  useEffect(() => {
    if (!_cached) setLoadingProjects(true)
    prefetchProjects().then((result) => {
      if (result.code === 0) {
        const projs = parseCachedProjects(result)
        setProjects(projs)
        if (projs.length > 0) {
          setSelectedProject(id => id || projs[0].id)
          if (projs[0].environments?.length) setSelectedEnv(id => id || projs[0].environments[0].id)
          if (projs[0].services?.length) setSelectedService(id => id || projs[0].services[0].id)
        }
      }
    }).catch(() => {}).finally(() => setLoadingProjects(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeProject = projects.find(p => p.id === selectedProject)

  const spawnSession = useCallback((type: Session['type'], cmdOverride?: string | null) => {
    const id = genId()
    let title = 'Shell'
    let cmd: string | null = null

    if (type === 'shell') {
      title = 'Shell'
      cmd = null
    } else if (type === 'ssh') {
      const svc = activeProject?.services?.find(s => s.id === selectedService)
      title = `SSH: ${svc?.name ?? 'service'}`
      cmd = `npx @railway/cli ssh --service ${selectedService} --environment ${selectedEnv}`
    } else if (type === 'run') {
      const c = cmdOverride ?? customCmd
      title = `Run: ${c}`
      cmd = `npx @railway/cli run ${c}`
    }

    sessionCmds.set(id, cmd)
    const session: Session = { id, title, type, status: 'connecting', projectId: selectedProject || undefined, environmentId: selectedEnv || undefined }
    setSessions(prev => [...prev, session])
    setActiveId(id)
    setShowLauncher(false)
  }, [activeProject, selectedService, selectedEnv, customCmd])

  const handleStatusChange = useCallback((id: string, update: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...update } : s))
  }, [])

  const closeSession = useCallback((id: string) => {
    sessionCmds.delete(id)
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      if (activeId === id) {
        const newActive = next.length ? next[next.length - 1].id : null
        setActiveId(newActive)
        if (!newActive) setShowLauncher(true)
      }
      return next
    })
  }, [activeId])

  const switchSession = useCallback((id: string) => {
    setActiveId(id)
    setShowLauncher(false)
  }, [])

  return (
    <div className="flex flex-col h-full bg-bg overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-0 bg-surface border-b border-border min-h-[40px] overflow-x-auto shrink-0">
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => switchSession(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-mono whitespace-nowrap transition-colors ${
              activeId === s.id
                ? 'bg-bg text-text-primary border border-b-0 border-border'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg/50'
            }`}
          >
            {s.status === 'connecting' && <Loader2 size={10} className="animate-spin text-accent" />}
            {s.status === 'active'     && <span className="w-2 h-2 rounded-full bg-success shrink-0" />}
            {s.status === 'exited'     && <span className="w-2 h-2 rounded-full bg-text-secondary shrink-0" />}
            {s.status === 'error'      && <AlertCircle size={10} className="text-error" />}
            <span className="max-w-[120px] truncate">{s.title}</span>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); closeSession(s.id) }}
              className="ml-1 hover:text-error rounded-sm p-0.5"
            >
              <X size={10} />
            </span>
          </button>
        ))}
        <button
          onClick={() => { setShowLauncher(true); setActiveId(null) }}
          className="flex items-center gap-1 px-2 py-1.5 text-text-secondary hover:text-text-primary rounded-md text-xs transition-colors"
          title="New session"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        {/* Launcher panel */}
        {showLauncher && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg p-6 z-10">
            <div className="w-full max-w-lg">
              <div className="flex items-center gap-2 mb-6">
                <TermIcon size={20} className="text-accent" />
                <h2 className="text-text-primary font-semibold text-lg">New Terminal Session</h2>
              </div>

              {/* Project selectors */}
              <div className="grid grid-cols-3 gap-2 mb-6">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Project</label>
                  {loadingProjects ? (
                    <div className="h-8 bg-surface border border-border rounded-md flex items-center px-2">
                      <Loader2 size={12} className="animate-spin text-text-secondary" />
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedProject}
                        onChange={e => {
                          setSelectedProject(e.target.value)
                          const p = projects.find(p => p.id === e.target.value)
                          if (p?.environments?.length) setSelectedEnv(p.environments[0].id)
                          if (p?.services?.length) setSelectedService(p.services[0].id)
                        }}
                        className="w-full appearance-none bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text-primary pr-6"
                      >
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Environment</label>
                  <div className="relative">
                    <select
                      value={selectedEnv}
                      onChange={e => setSelectedEnv(e.target.value)}
                      className="w-full appearance-none bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text-primary pr-6"
                    >
                      {(activeProject?.environments ?? []).map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Service</label>
                  <div className="relative">
                    <select
                      value={selectedService}
                      onChange={e => setSelectedService(e.target.value)}
                      className="w-full appearance-none bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text-primary pr-6"
                    >
                      {(activeProject?.services ?? []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Quick launch buttons */}
              <div className="grid grid-cols-1 gap-2 mb-4">
                <button
                  onClick={() => spawnSession('shell')}
                  className="flex items-center gap-3 p-3 bg-surface hover:bg-border border border-border rounded-lg text-sm text-text-primary transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-accent/20 rounded-lg flex items-center justify-center shrink-0">
                    <TermIcon size={16} className="text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Local Shell</p>
                    <p className="text-text-secondary text-xs">Open a shell session in your working directory</p>
                  </div>
                </button>

                <button
                  onClick={() => spawnSession('ssh')}
                  disabled={!selectedService || !selectedEnv}
                  className="flex items-center gap-3 p-3 bg-surface hover:bg-border border border-border rounded-lg text-sm text-text-primary transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                    <Wifi size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Railway SSH</p>
                    <p className="text-text-secondary text-xs">SSH into the selected service container</p>
                  </div>
                </button>

                <button
                  onClick={() => spawnSession('run', 'connect')}
                  disabled={!selectedService || !selectedEnv}
                  className="flex items-center gap-3 p-3 bg-surface hover:bg-border border border-border rounded-lg text-sm text-text-primary transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center shrink-0">
                    <Server size={16} className="text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Connect Database</p>
                    <p className="text-text-secondary text-xs">Open a database shell via <code className="text-accent">railway connect</code></p>
                  </div>
                </button>
              </div>

              {/* Custom command */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCmd}
                  onChange={e => setCustomCmd(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && customCmd.trim() && spawnSession('run')}
                  placeholder="railway run <command>  (e.g. python manage.py shell)"
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary font-mono focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => customCmd.trim() && spawnSession('run')}
                  disabled={!customCmd.trim()}
                  className="px-3 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
                >
                  <Play size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* One TerminalPane per session — mounted for the full session lifetime */}
        {sessions.map(s => (
          <TerminalPaneWrapper
            key={s.id}
            session={s}
            cmd={sessionCmds.get(s.id) ?? null}
            active={activeId === s.id && !showLauncher}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </div>
  )
}

// Wrapper that passes the resolved cmd into TerminalPane cleanly
function TerminalPaneWrapper({
  session, cmd, active, onStatusChange,
}: {
  session: Session
  cmd: string | null
  active: boolean
  onStatusChange: (id: string, update: Partial<Session>) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const xterm = new XTerm({
      theme: {
        background: '#1b1e27', foreground: '#cdd6f4', cursor: '#cba6f7',
        selectionBackground: '#45475a',
        black: '#45475a', red: '#f38ba8', green: '#a6e3a1',
        yellow: '#f9e2af', blue: '#89b4fa', magenta: '#cba6f7',
        cyan: '#89dceb', white: '#bac2de',
        brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#cba6f7',
        brightCyan: '#89dceb', brightWhite: '#a6adc8',
      },
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 5000,
    })

    const fit = new FitAddon()
    xterm.loadAddon(fit)
    xterm.open(container)
    xtermRef.current = xterm
    fitRef.current = fit

    const rafId = requestAnimationFrame(() => { try { fit.fit() } catch { /* ignore */ } })

    const cleanupPTY = window.railway.spawnTerminal(
      session.id,
      cmd,
      undefined,
      session.projectId,
      session.environmentId,
      (data) => xterm.write(data),
      (code) => {
        onStatusChange(session.id, { status: 'exited', exitCode: code })
        xterm.write(`\r\n\x1b[2m[Process exited with code ${code}]\x1b[0m\r\n`)
      },
      (msg) => {
        onStatusChange(session.id, { status: 'error', errorMsg: msg })
        xterm.write(`\r\n\x1b[31m\x1b[1mTerminal error:\x1b[0m\x1b[31m ${msg}\x1b[0m\r\n`)
      }
    )

    xterm.onData((data) => window.railway.writeTerminal(session.id, data))
    xterm.onResize(({ cols, rows }) => window.railway.resizeTerminal(session.id, cols, rows))

    const resizeObserver = new ResizeObserver(() => { try { fit.fit() } catch { /* ignore */ } })
    resizeObserver.observe(container)

    onStatusChange(session.id, { status: 'active' })

    return () => {
      cancelAnimationFrame(rafId)
      cleanupPTY()
      resizeObserver.disconnect()
      try { xterm.dispose() } catch { /* ignore */ }
      xtermRef.current = null
      fitRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) return
    const raf = requestAnimationFrame(() => {
      try { fitRef.current?.fit(); xtermRef.current?.focus() } catch { /* ignore */ }
    })
    return () => cancelAnimationFrame(raf)
  }, [active])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 p-2"
      style={{
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? 'auto' : 'none',
      }}
    />
  )
}

export default Terminal
