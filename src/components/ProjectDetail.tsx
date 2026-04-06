import React, { useState, useEffect, useRef } from 'react'
import {
  X, RefreshCw, Loader2, AlertCircle, Server, GitBranch,
  Github, RotateCcw, Play, FileText, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Clock, Layers, ExternalLink, Terminal, Monitor,
} from 'lucide-react'

interface Service {
  id: string
  name: string
}

interface Environment {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
  workspace: { id: string; name: string }
  environments: Environment[]
  services: Service[]
}

interface ServiceStatus {
  serviceId: string
  serviceName: string
  status: string
  url?: string
}

interface Deployment {
  id: string
  status: string
  createdAt: string
  url?: string
  meta?: {
    repo?: string
    branch?: string
    commitMessage?: string
    commitHash?: string
    image?: string
  }
}

interface ServiceDetail {
  service: Service
  status: ServiceStatus | null
  deployments: Deployment[]
  loadingDeps: boolean
  logsOpen: boolean
  logs: string
  logsLoading: boolean
  actionStatus: 'idle' | 'loading' | 'success' | 'error'
  actionMsg: string
}

function statusBadge(status: string) {
  const s = status?.toLowerCase() || ''
  if (s === 'success' || s === 'active' || s === 'running' || s === 'healthy')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/15 text-success text-xs rounded-full font-medium"><CheckCircle2 size={10} />{status}</span>
  if (s === 'failed' || s === 'error' || s === 'crashed')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-error/15 text-error text-xs rounded-full font-medium"><XCircle size={10} />{status}</span>
  if (s === 'building' || s === 'deploying' || s === 'initializing')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning/15 text-warning text-xs rounded-full font-medium"><Loader2 size={10} className="animate-spin" />{status}</span>
  if (s === 'sleeping' || s === 'removed')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-border text-text-secondary text-xs rounded-full font-medium"><Clock size={10} />{status}</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-border text-text-secondary text-xs rounded-full font-medium">{status || 'unknown'}</span>
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function parseServiceStatuses(json: string): ServiceStatus[] {
  try {
    const data = JSON.parse(json)
    if (Array.isArray(data)) return data
    return []
  } catch { return [] }
}

function parseDeployments(json: string): Deployment[] {
  try {
    const data = JSON.parse(json)
    if (Array.isArray(data)) return data
    return []
  } catch { return [] }
}

function LogPanel({ logs, loading }: { logs: string; loading: boolean }) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs])

  return (
    <div className="mt-3 bg-[#0d0f14] border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Terminal size={12} className="text-accent" />
        <span className="text-text-secondary text-xs">Logs</span>
        {loading && <Loader2 size={11} className="animate-spin text-accent ml-auto" />}
      </div>
      <pre
        ref={ref}
        className="text-xs font-mono text-green-400 p-3 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed"
      >
        {logs || (loading ? 'Fetching logs...' : 'No logs available')}
      </pre>
    </div>
  )
}

interface Props {
  project: Project
  onClose: () => void
}

export default function ProjectDetail({ project, onClose }: Props) {
  const [selectedEnv, setSelectedEnv] = useState<Environment>(
    project.environments.find((e) => e.name === 'production') || project.environments[0]
  )
  const [linking, setLinking] = useState(true)
  const [linkError, setLinkError] = useState('')
  const [hasGithubDesktop, setHasGithubDesktop] = useState(false)
  const [serviceDetails, setServiceDetails] = useState<ServiceDetail[]>(
    project.services.map((s) => ({
      service: s,
      status: null,
      deployments: [],
      loadingDeps: false,
      logsOpen: false,
      logs: '',
      logsLoading: false,
      actionStatus: 'idle',
      actionMsg: '',
    }))
  )
  const logCleanups = useRef<Map<string, () => void>>(new Map())

  useEffect(() => {
    window.railway.hasGithubDesktop().then(setHasGithubDesktop).catch(() => {})
    linkAndLoad()
    return () => {
      logCleanups.current.forEach((cleanup) => cleanup())
    }
  }, [selectedEnv])

  const linkAndLoad = async () => {
    setLinking(true)
    setLinkError('')
    try {
      await window.railway.linkForInspect(project.id, selectedEnv.id)
      await loadServiceStatuses()
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : 'Failed to connect to project')
    } finally {
      setLinking(false)
    }
  }

  const loadServiceStatuses = async () => {
    const result = await window.railway.serviceStatus(project.id, selectedEnv.id)
    const statuses = parseServiceStatuses(result.stdout)
    setServiceDetails((prev) =>
      prev.map((sd) => ({
        ...sd,
        status: statuses.find((s) => s.serviceId === sd.service.id || s.serviceName === sd.service.name) || null,
      }))
    )
    // Load deployments for each service in parallel
    project.services.forEach((svc) => loadDeployments(svc.id))
  }

  const loadDeployments = async (serviceId: string) => {
    setServiceDetails((prev) =>
      prev.map((sd) => sd.service.id === serviceId ? { ...sd, loadingDeps: true } : sd)
    )
    try {
      const result = await window.railway.deploymentList(project.id, serviceId, selectedEnv.id)
      const deps = parseDeployments(result.stdout)
      setServiceDetails((prev) =>
        prev.map((sd) => sd.service.id === serviceId ? { ...sd, deployments: deps, loadingDeps: false } : sd)
      )
    } catch {
      setServiceDetails((prev) =>
        prev.map((sd) => sd.service.id === serviceId ? { ...sd, loadingDeps: false } : sd)
      )
    }
  }

  const toggleLogs = (serviceId: string) => {
    setServiceDetails((prev) => {
      const sd = prev.find((s) => s.service.id === serviceId)!
      if (sd.logsOpen) {
        // Close — kill stream
        const cleanup = logCleanups.current.get(serviceId)
        if (cleanup) { cleanup(); logCleanups.current.delete(serviceId) }
        return prev.map((s) => s.service.id === serviceId ? { ...s, logsOpen: false, logs: '', logsLoading: false } : s)
      } else {
        // Open — start streaming
        setServiceDetails((p) => p.map((s) => s.service.id === serviceId ? { ...s, logsOpen: true, logsLoading: true, logs: '' } : s))
        const cleanup = window.railway.streamLogs(
          project.id, serviceId, selectedEnv.id,
          (chunk) => setServiceDetails((p) => p.map((s) => s.service.id === serviceId ? { ...s, logs: s.logs + chunk, logsLoading: false } : s)),
          () => setServiceDetails((p) => p.map((s) => s.service.id === serviceId ? { ...s, logsLoading: false } : s))
        )
        logCleanups.current.set(serviceId, cleanup)
        return prev
      }
    })
  }

  const runAction = async (serviceId: string, action: 'redeploy' | 'restart') => {
    setServiceDetails((prev) =>
      prev.map((sd) => sd.service.id === serviceId ? { ...sd, actionStatus: 'loading', actionMsg: '' } : sd)
    )
    try {
      const result = action === 'redeploy'
        ? await window.railway.serviceRedeploy(project.id, serviceId, selectedEnv.id)
        : await window.railway.serviceRestart(project.id, serviceId, selectedEnv.id)
      const success = result.code === 0
      setServiceDetails((prev) =>
        prev.map((sd) => sd.service.id === serviceId
          ? { ...sd, actionStatus: success ? 'success' : 'error', actionMsg: success ? `${action} triggered` : (result.stderr || result.stdout || `${action} failed`) }
          : sd)
      )
      if (success) setTimeout(() => {
        setServiceDetails((prev) => prev.map((sd) => sd.service.id === serviceId ? { ...sd, actionStatus: 'idle', actionMsg: '' } : sd))
        loadDeployments(serviceId)
      }, 2500)
    } catch (err: unknown) {
      setServiceDetails((prev) =>
        prev.map((sd) => sd.service.id === serviceId ? { ...sd, actionStatus: 'error', actionMsg: err instanceof Error ? err.message : 'failed' } : sd)
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl bg-bg border-l border-border flex flex-col h-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border shrink-0">
          <div>
            <h2 className="text-text-primary font-bold text-lg">{project.name}</h2>
            <p className="text-text-secondary text-sm mt-0.5">{project.workspace.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Environment switcher */}
            {project.environments.length > 1 && (
              <div className="relative">
                <select
                  value={selectedEnv.id}
                  onChange={(e) => {
                    const env = project.environments.find((ev) => ev.id === e.target.value)!
                    setSelectedEnv(env)
                  }}
                  className="appearance-none bg-surface border border-border rounded-lg pl-3 pr-7 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  {project.environments.map((env) => (
                    <option key={env.id} value={env.id}>{env.name}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              </div>
            )}
            <button
              onClick={linkAndLoad}
              disabled={linking}
              className="p-1.5 bg-surface hover:bg-border border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
            >
              <RefreshCw size={14} className={linking ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-surface rounded-lg text-text-secondary hover:text-text-primary transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {linkError && (
            <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg">
              <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
              <p className="text-error text-xs">{linkError}</p>
            </div>
          )}

          {linking && (
            <div className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/20 rounded-lg">
              <Loader2 size={14} className="text-accent animate-spin" />
              <p className="text-text-secondary text-xs">Connecting to project...</p>
            </div>
          )}

          {serviceDetails.map((sd) => {
            const latestDep = sd.deployments[0]
            const repoInfo = latestDep?.meta?.repo
            const branch = latestDep?.meta?.branch
            const commit = latestDep?.meta?.commitMessage
            const commitHash = latestDep?.meta?.commitHash?.slice(0, 7)
            const image = latestDep?.meta?.image

            return (
              <div key={sd.service.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                {/* Service header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center shrink-0">
                        <Server size={15} className="text-accent" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-text-primary font-semibold text-sm truncate">{sd.service.name}</p>
                        <p className="text-text-secondary/60 text-xs font-mono truncate">{sd.service.id}</p>
                      </div>
                    </div>
                    {sd.status && statusBadge(sd.status.status)}
                  </div>

                  {/* GitHub / source info */}
                  {sd.loadingDeps && (
                    <div className="flex items-center gap-2 text-text-secondary/60 text-xs mb-2">
                      <Loader2 size={11} className="animate-spin" />
                      Loading deployment info...
                    </div>
                  )}

                  {!sd.loadingDeps && (repoInfo || image) && (
                    <div className="space-y-1.5 mb-3">
                      {repoInfo && (
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <Github size={13} className="text-text-secondary shrink-0" />
                          <span className="text-text-primary font-mono">{repoInfo}</span>
                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              onClick={() => window.railway.openRepoInBrowser(repoInfo)}
                              title="Open in browser"
                              className="flex items-center gap-1 px-2 py-1 bg-bg hover:bg-accent/10 border border-border hover:border-accent/40 rounded text-text-secondary hover:text-accent transition-all"
                            >
                              <ExternalLink size={11} />
                              <span className="text-xs">Browser</span>
                            </button>
                            {hasGithubDesktop && (
                              <button
                                onClick={() => window.railway.openRepoInGithubDesktop(repoInfo)}
                                title="Open in GitHub Desktop"
                                className="flex items-center gap-1 px-2 py-1 bg-bg hover:bg-accent/10 border border-border hover:border-accent/40 rounded text-text-secondary hover:text-accent transition-all"
                              >
                                <Monitor size={11} />
                                <span className="text-xs">GitHub Desktop</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {branch && (
                        <div className="flex items-center gap-2 text-xs">
                          <GitBranch size={13} className="text-text-secondary shrink-0" />
                          <span className="text-text-secondary">{branch}</span>
                          {commitHash && (
                            <code className="px-1.5 py-0.5 bg-bg border border-border rounded text-text-secondary font-mono">{commitHash}</code>
                          )}
                        </div>
                      )}
                      {commit && (
                        <div className="flex items-center gap-2 text-xs">
                          <FileText size={13} className="text-text-secondary shrink-0" />
                          <span className="text-text-secondary truncate max-w-xs" title={commit}>{commit}</span>
                        </div>
                      )}
                      {image && !repoInfo && (
                        <div className="flex items-center gap-2 text-xs">
                          <Layers size={13} className="text-text-secondary shrink-0" />
                          <span className="text-text-secondary font-mono truncate">{image}</span>
                        </div>
                      )}
                      {latestDep && (
                        <div className="flex items-center gap-2 text-xs text-text-secondary/60">
                          <Clock size={11} />
                          Last deployed {timeAgo(latestDep.createdAt)} · {statusBadge(latestDep.status)}
                        </div>
                      )}
                    </div>
                  )}

                  {sd.status?.url && (
                    <a
                      href={sd.status.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mb-3"
                    >
                      <ExternalLink size={11} />
                      {sd.status.url}
                    </a>
                  )}

                  {/* Action feedback */}
                  {sd.actionStatus === 'success' && (
                    <div className="flex items-center gap-2 p-2 bg-success/10 border border-success/20 rounded-lg mb-2 text-xs text-success">
                      <CheckCircle2 size={12} />{sd.actionMsg}
                    </div>
                  )}
                  {sd.actionStatus === 'error' && (
                    <div className="flex items-center gap-2 p-2 bg-error/10 border border-error/20 rounded-lg mb-2 text-xs text-error">
                      <AlertCircle size={12} />{sd.actionMsg}
                    </div>
                  )}

                  {/* Controls */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => toggleLogs(sd.service.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${sd.logsOpen ? 'bg-accent text-white border-accent' : 'bg-bg border-border text-text-secondary hover:text-text-primary hover:border-accent/40'}`}
                    >
                      {sd.logsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      Logs
                    </button>
                    <button
                      onClick={() => runAction(sd.service.id, 'redeploy')}
                      disabled={sd.actionStatus === 'loading'}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-accent/10 border border-border hover:border-accent/40 rounded-lg text-xs text-text-secondary hover:text-accent font-medium transition-all disabled:opacity-50"
                    >
                      {sd.actionStatus === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Redeploy
                    </button>
                    <button
                      onClick={() => runAction(sd.service.id, 'restart')}
                      disabled={sd.actionStatus === 'loading'}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-accent/10 border border-border hover:border-accent/40 rounded-lg text-xs text-text-secondary hover:text-accent font-medium transition-all disabled:opacity-50"
                    >
                      <Play size={12} />
                      Restart
                    </button>
                  </div>
                </div>

                {/* Logs panel */}
                {sd.logsOpen && (
                  <div className="px-4 pb-4">
                    <LogPanel logs={sd.logs} loading={sd.logsLoading} />
                  </div>
                )}
              </div>
            )
          })}

          {!linking && serviceDetails.length === 0 && (
            <div className="text-center py-12 text-text-secondary text-sm">No services found in this project.</div>
          )}
        </div>
      </div>
    </div>
  )
}
