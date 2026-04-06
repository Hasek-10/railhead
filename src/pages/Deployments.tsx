import React, { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Loader2, AlertCircle, ChevronDown, GitBranch,
  Github, RotateCcw, Trash2, FileText, Clock, CheckCircle2,
  XCircle, Hammer, Zap, Package, ExternalLink, ScrollText, Filter,
} from 'lucide-react'
import { prefetchProjects, getCachedProjects } from '../cache'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string; name: string
  environments: { id: string; name: string }[]
  services: { id: string; name: string }[]
}

interface Deployment {
  id: string
  status: string
  createdAt: string
  updatedAt?: string
  url?: string
  meta?: {
    repo?: string; branch?: string
    commitMessage?: string; commitHash?: string
    image?: string; type?: string
  }
}

type ActionState = 'idle' | 'loading' | 'success' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDeployments(json: string): Deployment[] {
  try {
    const d = JSON.parse(json)
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function groupByDate(deployments: Deployment[]): { date: string; items: Deployment[] }[] {
  const map = new Map<string, Deployment[]>()
  for (const d of deployments) {
    const key = new Date(d.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(d)
  }
  return [...map.entries()].map(([date, items]) => ({ date, items }))
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() ?? ''
  if (s === 'success' || s === 'complete')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/15 text-success text-xs rounded-full font-medium shrink-0"><CheckCircle2 size={10} />Success</span>
  if (s === 'failed' || s === 'crashed' || s === 'error')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-error/15 text-error text-xs rounded-full font-medium shrink-0"><XCircle size={10} />Failed</span>
  if (s === 'building')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-500/15 text-yellow-400 text-xs rounded-full font-medium shrink-0"><Hammer size={10} className="animate-pulse" />Building</span>
  if (s === 'deploying' || s === 'initializing')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/15 text-accent text-xs rounded-full font-medium shrink-0"><Loader2 size={10} className="animate-spin" />Deploying</span>
  if (s === 'sleeping' || s === 'removed')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-border text-text-secondary text-xs rounded-full font-medium shrink-0"><Clock size={10} />{status}</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-border text-text-secondary text-xs rounded-full font-medium shrink-0">{status || 'unknown'}</span>
}

// ── Selects ───────────────────────────────────────────────────────────────────

function Sel({ value, onChange, children, className = '' }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-surface border border-border rounded-lg pl-3 pr-7 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
      >{children}</select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
    </div>
  )
}

// ── Deployment Card ───────────────────────────────────────────────────────────

function DeploymentCard({
  dep, isLatest, projectId, serviceId, envId,
  onRollback, onRemove, onViewLogs,
}: {
  dep: Deployment
  isLatest: boolean
  projectId: string; serviceId: string; envId: string
  onRollback: (id: string) => void
  onRemove: (id: string) => void
  onViewLogs: (dep: Deployment) => void
}) {
  const [action, setAction] = useState<ActionState>('idle')
  const [actionMsg, setActionMsg] = useState('')

  const handleRollback = async () => {
    if (!confirm(`Rollback to deployment ${dep.id.slice(0, 8)}?`)) return
    setAction('loading'); setActionMsg('')
    const r = await window.railway.deploymentRollback(dep.id)
    if (r.ok) { setAction('success'); setActionMsg('Rollback triggered'); setTimeout(() => { setAction('idle'); onRollback(dep.id) }, 2500) }
    else { setAction('error'); setActionMsg(r.error ?? 'Rollback failed') }
  }

  const handleRemove = async () => {
    if (!confirm(`Remove deployment ${dep.id.slice(0, 8)}? This cannot be undone.`)) return
    setAction('loading'); setActionMsg('')
    const r = await window.railway.deploymentRemove(dep.id)
    if (r.ok) { setAction('success'); setActionMsg('Removed'); setTimeout(() => onRemove(dep.id), 1200) }
    else { setAction('error'); setActionMsg(r.error ?? 'Remove failed') }
  }

  const source = dep.meta
  const commitShort = source?.commitHash?.slice(0, 7)
  const isGit = !!(source?.repo || source?.branch)

  return (
    <div className={`relative flex gap-4 group ${isLatest ? 'opacity-100' : 'opacity-90 hover:opacity-100'} transition-opacity`}>
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center shrink-0 w-8">
        <div className={`w-3 h-3 rounded-full border-2 mt-1.5 shrink-0 z-10 ${
          dep.status?.toLowerCase() === 'success' || dep.status?.toLowerCase() === 'complete'
            ? 'bg-success border-success/50'
            : dep.status?.toLowerCase() === 'failed' || dep.status?.toLowerCase() === 'crashed'
            ? 'bg-error border-error/50'
            : dep.status?.toLowerCase() === 'building' || dep.status?.toLowerCase() === 'deploying'
            ? 'bg-accent border-accent/50 animate-pulse'
            : 'bg-border border-border'
        }`} />
        <div className="w-px flex-1 bg-border/40 mt-1" />
      </div>

      {/* Card */}
      <div className={`flex-1 mb-4 bg-surface border rounded-xl p-4 transition-all ${
        isLatest ? 'border-accent/30 shadow-sm shadow-accent/10' : 'border-border hover:border-border/80'
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={dep.status} />
            {isLatest && (
              <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-full font-medium border border-accent/20">
                Latest
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-text-secondary/60 text-xs shrink-0">
            <Clock size={11} />
            <span title={formatTime(dep.createdAt)}>{timeAgo(dep.createdAt)}</span>
          </div>
        </div>

        {/* Source info */}
        {isGit ? (
          <div className="space-y-1.5 mb-3">
            {source?.commitMessage && (
              <p className="text-text-primary text-sm font-medium leading-snug">{source.commitMessage}</p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {source?.repo && (
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Github size={12} />
                  <span className="font-mono">{source.repo}</span>
                </div>
              )}
              {source?.branch && (
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <GitBranch size={12} />
                  <span>{source.branch}</span>
                </div>
              )}
              {commitShort && (
                <code className="px-1.5 py-0.5 bg-bg border border-border rounded text-xs text-text-secondary font-mono">
                  {commitShort}
                </code>
              )}
            </div>
          </div>
        ) : source?.image ? (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary mb-3">
            <Package size={12} />
            <span className="font-mono truncate">{source.image}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary/50 mb-3">
            <Zap size={12} />
            <span>Manual deploy</span>
          </div>
        )}

        {/* Deployment ID + URL */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="text-text-secondary/50 text-xs font-mono">{dep.id.slice(0, 16)}…</span>
          {dep.url && (
            <a href={dep.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <ExternalLink size={11} />{dep.url.replace('https://', '')}
            </a>
          )}
        </div>

        {/* Action feedback */}
        {action === 'success' && (
          <div className="flex items-center gap-2 p-2 bg-success/10 border border-success/20 rounded-lg mb-2 text-xs text-success">
            <CheckCircle2 size={12} />{actionMsg}
          </div>
        )}
        {action === 'error' && (
          <div className="flex items-center gap-2 p-2 bg-error/10 border border-error/20 rounded-lg mb-2 text-xs text-error">
            <AlertCircle size={12} />{actionMsg}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => onViewLogs(dep)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-white/5 border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-all"
          >
            <ScrollText size={12} />Logs
          </button>
          {!isLatest && (
            <button onClick={handleRollback} disabled={action === 'loading'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-accent/10 border border-border hover:border-accent/30 rounded-lg text-xs text-text-secondary hover:text-accent font-medium transition-all disabled:opacity-40"
            >
              {action === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Rollback to this
            </button>
          )}
          {isLatest && (
            <button onClick={handleRollback} disabled={action === 'loading'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-accent/10 border border-border hover:border-accent/30 rounded-lg text-xs text-text-secondary hover:text-accent font-medium transition-all disabled:opacity-40"
            >
              {action === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Redeploy
            </button>
          )}
          <button onClick={handleRemove} disabled={action === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-error/10 border border-border hover:border-error/30 rounded-lg text-xs text-text-secondary hover:text-error transition-all disabled:opacity-40 ml-auto"
          >
            <Trash2 size={12} />Remove
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Log Drawer ────────────────────────────────────────────────────────────────

function LogDrawer({ dep, projectId, serviceId, envId, onClose }: {
  dep: Deployment; projectId: string; serviceId: string; envId: string; onClose: () => void
}) {
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(true)
  const [logType, setLogType] = useState<'deploy' | 'build'>('deploy')
  const cleanupRef = React.useRef<(() => void) | null>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  const startLogs = useCallback((type: 'deploy' | 'build') => {
    cleanupRef.current?.()
    setLogs('')
    setLoading(true)
    const cleanup = window.railway.streamLogsAdvanced(
      projectId, serviceId, envId,
      { logType: type, lines: 500, latest: false },
      (chunk) => { setLogs((l) => l + chunk); setLoading(false) },
      () => setLoading(false)
    )
    cleanupRef.current = cleanup
  }, [projectId, serviceId, envId])

  useEffect(() => {
    startLogs(logType)
    return () => cleanupRef.current?.()
  }, [logType])

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView()
  }, [logs])

  const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '')

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-[#0d0f14] border-l border-border flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-surface">
          <div>
            <p className="text-text-primary text-sm font-semibold">Deployment Logs</p>
            <p className="text-text-secondary/60 text-xs font-mono mt-0.5">{dep.id.slice(0, 16)}… · {dep.meta?.commitMessage?.slice(0, 40) || timeAgo(dep.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['deploy', 'build'] as const).map((t) => (
                <button key={t} onClick={() => setLogType(t)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${logType === t ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:text-text-primary'}`}
                >
                  {t === 'deploy' ? <span className="flex items-center gap-1"><Zap size={11} />Deploy</span> : <span className="flex items-center gap-1"><Hammer size={11} />Build</span>}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/5">
              ✕
            </button>
          </div>
        </div>

        {/* Log output */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-green-400 leading-relaxed">
          {loading && logs === '' && (
            <div className="flex items-center gap-2 text-text-secondary/60">
              <Loader2 size={13} className="animate-spin" />Fetching logs…
            </div>
          )}
          <pre className="whitespace-pre-wrap break-all">{stripAnsi(logs)}</pre>
          {!loading && logs === '' && <p className="text-text-secondary/40">No logs available for this deployment.</p>}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function parseProjects(r: { stdout: string }): Project[] {
  try {
    const raw: any[] = JSON.parse(r.stdout)
    return raw.map((p) => ({
      id: p.id, name: p.name,
      environments: (p.environments?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name })),
      services: (p.services?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name })),
    }))
  } catch { return [] }
}

export default function Deployments() {
  const _cached = getCachedProjects()
  const [projects, setProjects]       = useState<Project[]>(() => _cached ? parseProjects(_cached) : [])
  const [loadingProjects, setLP]      = useState(!_cached)
  const [projectId, setProjectId]     = useState('')
  const [serviceId, setServiceId]     = useState('')
  const [envId, setEnvId]             = useState('')
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [limit, setLimit]             = useState(30)
  const [statusFilter, setStatusFilter] = useState('all')
  const [logDep, setLogDep]           = useState<Deployment | null>(null)

  // Seed selectors from cache, then await fresh data
  useEffect(() => {
    const seedSelectors = (parsed: Project[]) => {
      if (!parsed.length) return
      const first = parsed[0]
      setProjectId(p => p || first.id)
      const prod = first.environments.find(e => e.name === 'production') || first.environments[0]
      setEnvId(id => id || prod?.id || '')
      setServiceId(id => id || first.services[0]?.id || '')
    }
    if (_cached) {
      const parsed = parseProjects(_cached)
      seedSelectors(parsed)
    }
    prefetchProjects().then((r) => {
      const parsed = parseProjects(r)
      setProjects(parsed)
      seedSelectors(parsed)
    }).catch(() => setError('Failed to load projects')).finally(() => setLP(false))
  }, [])

  const selectedProject = projects.find((p) => p.id === projectId)
  const services = selectedProject?.services ?? []
  const envs = selectedProject?.environments ?? []

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    const p = projects.find((proj) => proj.id === id)
    if (p) {
      const prod = p.environments.find((e) => e.name === 'production') || p.environments[0]
      setEnvId(prod?.id ?? '')
      setServiceId(p.services[0]?.id ?? '')
    }
  }

  const loadDeployments = useCallback(async () => {
    if (!projectId || !serviceId || !envId) return
    setLoading(true); setError('')
    try {
      await window.railway.linkForInspect(projectId, envId)
      const r = await window.railway.deploymentListFull(projectId, serviceId, envId, limit)
      if (r.code !== 0) { setError(r.stderr || 'Failed to load deployments'); return }
      setDeployments(parseDeployments(r.stdout))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [projectId, serviceId, envId, limit])

  useEffect(() => { if (projectId && serviceId && envId) loadDeployments() }, [projectId, serviceId, envId])

  const filtered = deployments.filter((d) =>
    statusFilter === 'all' || d.status?.toLowerCase() === statusFilter
  )

  const groups = groupByDate(filtered)

  const handleRemove = (id: string) => setDeployments((d) => d.filter((x) => x.id !== id))
  const handleRollback = () => setTimeout(loadDeployments, 1500)

  const statusCounts = {
    success: deployments.filter((d) => ['success', 'complete'].includes(d.status?.toLowerCase())).length,
    failed:  deployments.filter((d) => ['failed', 'crashed', 'error'].includes(d.status?.toLowerCase())).length,
    active:  deployments.filter((d) => ['building', 'deploying', 'initializing'].includes(d.status?.toLowerCase())).length,
  }

  if (loadingProjects) return (
    <div className="flex items-center justify-center h-full"><Loader2 size={24} className="text-accent animate-spin" /></div>
  )

  return (
    <div className="flex flex-col h-full bg-bg overflow-hidden">
      {logDep && (
        <LogDrawer dep={logDep} projectId={projectId} serviceId={serviceId} envId={envId} onClose={() => setLogDep(null)} />
      )}

      {/* Toolbar */}
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Sel value={projectId} onChange={handleProjectChange} className="w-44">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Sel>
          <Sel value={serviceId} onChange={setServiceId} className="w-44">
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Sel>
          <Sel value={envId} onChange={setEnvId} className="w-36">
            {envs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Sel>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-text-secondary">Show</span>
            <Sel value={String(limit)} onChange={(v) => setLimit(Number(v))} className="w-20">
              {[10, 30, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </Sel>
            <button onClick={loadDeployments} disabled={loading}
              className="p-1.5 bg-bg hover:bg-white/5 border border-border rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats + status filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'All', value: 'all', count: deployments.length },
            { label: 'Success', value: 'success', count: statusCounts.success, cls: 'text-success' },
            { label: 'Failed',  value: 'failed',  count: statusCounts.failed,  cls: 'text-error'   },
            { label: 'Active',  value: 'building', count: statusCounts.active, cls: 'text-accent'  },
          ].map(({ label, value, count, cls }) => (
            <button key={value} onClick={() => setStatusFilter(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                statusFilter === value
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : 'bg-bg border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              <Filter size={11} />
              {label}
              <span className={`${statusFilter === value ? 'text-accent' : (cls ?? 'text-text-secondary/60')}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg mb-4">
            <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
            <p className="text-error text-xs">{error}</p>
          </div>
        )}

        {loading && deployments.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-accent animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary/40 gap-3">
            <FileText size={32} />
            <p className="text-sm">No deployments found</p>
            {deployments.length > 0 && <p className="text-xs">Try changing the status filter</p>}
          </div>
        )}

        {groups.map(({ date, items }) => (
          <div key={date} className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-text-secondary/60 text-xs font-medium">{date}</span>
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-text-secondary/40 text-xs">{items.length} deployment{items.length !== 1 ? 's' : ''}</span>
            </div>
            {items.map((dep, i) => (
              <DeploymentCard
                key={dep.id}
                dep={dep}
                isLatest={deployments[0]?.id === dep.id}
                projectId={projectId}
                serviceId={serviceId}
                envId={envId}
                onRollback={handleRollback}
                onRemove={handleRemove}
                onViewLogs={setLogDep}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
