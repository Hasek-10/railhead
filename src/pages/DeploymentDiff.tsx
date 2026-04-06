import React, { useState, useEffect } from 'react'
import {
  GitCompare, ChevronDown, Loader2, RefreshCw, ArrowRight,
  CheckCircle2, XCircle, Clock, GitCommit, User, Image,
  AlertCircle, Minus, Plus, Equal,
} from 'lucide-react'
import { prefetchProjects, getCachedProjects } from '../cache'

interface Project { id: string; name: string; environments: { id: string; name: string }[]; services: { id: string; name: string }[] }

interface Deployment {
  id: string
  status: string
  createdAt: string
  commitHash?: string
  commitMessage?: string
  commitAuthor?: string
  deploymentSummary?: string
  image?: string
  url?: string
}

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'text-success bg-success/10',
  ACTIVE: 'text-success bg-success/10',
  FAILED: 'text-error bg-error/10',
  CRASHED: 'text-error bg-error/10',
  BUILDING: 'text-accent bg-accent/10',
  DEPLOYING: 'text-accent bg-accent/10',
  REMOVED: 'text-text-secondary bg-border',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'text-text-secondary bg-border'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

function formatTs(ts: string) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function timeDelta(a: string, b: string): string {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime())
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  if (h > 0) return `${h}h ${m}m apart`
  if (m > 0) return `${m}m ${s}s apart`
  return `${s}s apart`
}

interface DiffRowProps { label: string; a?: string; b?: string }
function DiffRow({ label, a, b }: DiffRowProps) {
  const changed = a !== b
  return (
    <tr className={changed ? 'bg-warning/5' : ''}>
      <td className="py-2 px-3 text-xs text-text-secondary font-medium w-32">{label}</td>
      <td className="py-2 px-3 text-xs font-mono text-text-primary max-w-[200px] truncate" title={a}>{a || <span className="text-text-secondary italic">—</span>}</td>
      <td className="py-2 px-2 text-text-secondary">
        {changed ? <ArrowRight size={12} className="text-warning" /> : <Equal size={12} className="text-border" />}
      </td>
      <td className={`py-2 px-3 text-xs font-mono max-w-[200px] truncate ${changed ? 'text-accent font-semibold' : 'text-text-primary'}`} title={b}>
        {b || <span className="text-text-secondary italic">—</span>}
      </td>
    </tr>
  )
}

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

export default function DeploymentDiff(): React.JSX.Element {
  const _cached = getCachedProjects()
  const _cachedProjs = _cached ? parseCachedProjects(_cached) : []
  const [projects, setProjects] = useState<Project[]>(_cachedProjs)
  const [selectedProject, setSelectedProject] = useState(_cachedProjs[0]?.id ?? '')
  const [selectedEnv, setSelectedEnv] = useState(_cachedProjs[0]?.environments?.[0]?.id ?? '')
  const [selectedService, setSelectedService] = useState(_cachedProjs[0]?.services?.[0]?.id ?? '')
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [deployA, setDeployA] = useState('')
  const [deployB, setDeployB] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(!_cached)
  const [loadingDeployments, setLoadingDeployments] = useState(false)
  const [comparing, setComparing] = useState(false)

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    if (!_cached) setLoadingProjects(true)
    try {
      const r = await prefetchProjects()
      if (r.code === 0) {
        const projs = parseCachedProjects(r)
        setProjects(projs)
        if (projs.length) {
          setSelectedProject(id => id || projs[0].id)
          setSelectedEnv(id => id || projs[0].environments?.[0]?.id || '')
          setSelectedService(id => id || projs[0].services?.[0]?.id || '')
        }
      }
    } catch { /* ignore */ }
    setLoadingProjects(false)
  }

  const loadDeployments = async () => {
    if (!selectedProject || !selectedService || !selectedEnv) return
    setLoadingDeployments(true)
    setDeployA('')
    setDeployB('')
    try {
      const r = await window.railway.deploymentListFull(selectedProject, selectedService, selectedEnv, 30)
      if (r.code === 0 && r.stdout) {
        const raw: any[] = JSON.parse(r.stdout)
        const parsed: Deployment[] = raw.map((d: any) => ({
          id: d.id,
          status: d.status ?? d.state,
          createdAt: d.createdAt,
          commitHash: d.meta?.commitHash ?? d.commitHash,
          commitMessage: d.meta?.commitMessage ?? d.commitMessage,
          commitAuthor: d.meta?.commitAuthor ?? d.commitAuthor,
          image: d.meta?.image ?? d.image,
          url: d.url ?? d.serviceUrl,
        }))
        setDeployments(parsed)
        if (parsed.length >= 2) { setDeployA(parsed[1].id); setDeployB(parsed[0].id) }
        else if (parsed.length === 1) { setDeployA(parsed[0].id) }
      }
    } catch { /* ignore */ }
    setLoadingDeployments(false)
  }

  useEffect(() => {
    if (selectedProject && selectedService && selectedEnv) loadDeployments()
  }, [selectedProject, selectedService, selectedEnv])

  const activeProject = projects.find(p => p.id === selectedProject)
  const dA = deployments.find(d => d.id === deployA)
  const dB = deployments.find(d => d.id === deployB)

  // Parse commit log between two hashes (from commit messages list)
  const commitsInRange = (() => {
    if (!dA || !dB) return []
    const iA = deployments.findIndex(d => d.id === deployA)
    const iB = deployments.findIndex(d => d.id === deployB)
    const [lo, hi] = iA > iB ? [iB, iA] : [iA, iB]
    return deployments.slice(lo, hi + 1).filter(d => d.commitHash)
  })()

  const hasChanges = dA && dB && (
    dA.status !== dB.status ||
    dA.commitHash !== dB.commitHash ||
    dA.image !== dB.image ||
    dA.commitAuthor !== dB.commitAuthor
  )

  return (
    <div className="h-full overflow-y-auto bg-bg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Deployment Diff</h1>
          <p className="text-text-secondary text-sm mt-0.5">Compare any two deployments side by side</p>
        </div>
        <button
          onClick={loadDeployments}
          disabled={loadingDeployments}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-border border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <RefreshCw size={13} className={loadingDeployments ? 'animate-spin' : ''} />
          Reload
        </button>
      </div>

      {/* Selectors */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            {
              label: 'Project', value: selectedProject,
              onChange: (v: string) => {
                setSelectedProject(v)
                const p = projects.find(p => p.id === v)
                setSelectedEnv(p?.environments?.[0]?.id ?? '')
                setSelectedService(p?.services?.[0]?.id ?? '')
              },
              options: projects.map(p => ({ value: p.id, label: p.name })),
            },
            {
              label: 'Environment', value: selectedEnv,
              onChange: setSelectedEnv,
              options: (activeProject?.environments ?? []).map(e => ({ value: e.id, label: e.name })),
            },
            {
              label: 'Service', value: selectedService,
              onChange: setSelectedService,
              options: (activeProject?.services ?? []).map(s => ({ value: s.id, label: s.name })),
            },
          ].map(({ label, value, onChange, options }) => (
            <div key={label}>
              <label className="text-xs text-text-secondary mb-1 block">{label}</label>
              <div className="relative">
                {loadingProjects ? (
                  <div className="h-8 bg-bg border border-border rounded-md flex items-center px-2">
                    <Loader2 size={12} className="animate-spin text-text-secondary" />
                  </div>
                ) : (
                  <>
                    <select
                      value={value}
                      onChange={e => onChange(e.target.value)}
                      className="w-full appearance-none bg-bg border border-border rounded-md px-2 py-1.5 text-xs text-text-primary pr-6"
                    >
                      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Deployment A/B pickers */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Base (A)', value: deployA, onChange: setDeployA },
            { label: 'Compare (B)', value: deployB, onChange: setDeployB },
          ].map(({ label, value, onChange }) => (
            <div key={label}>
              <label className="text-xs text-text-secondary mb-1 block">{label}</label>
              {loadingDeployments ? (
                <div className="h-8 bg-bg border border-border rounded-md flex items-center px-2">
                  <Loader2 size={12} className="animate-spin text-text-secondary" />
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-full appearance-none bg-bg border border-border rounded-md px-2 py-1.5 text-xs text-text-primary pr-6 font-mono"
                  >
                    <option value="">— select deployment —</option>
                    {deployments.map((d, i) => (
                      <option key={d.id} value={d.id}>
                        {i === 0 ? '★ ' : ''}{d.commitHash?.slice(0,7) ?? d.id.slice(0,8)} · {d.status} · {new Date(d.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Diff content */}
      {dA && dB ? (
        <div className="space-y-4">
          {/* Time delta banner */}
          <div className="flex items-center justify-center gap-3 py-2 px-4 bg-surface border border-border rounded-xl">
            <div className="text-xs text-text-secondary font-mono">{formatTs(dA.createdAt)}</div>
            <ArrowRight size={14} className="text-text-secondary" />
            <div className="text-xs text-accent font-mono font-semibold">{timeDelta(dA.createdAt, dB.createdAt)}</div>
            <ArrowRight size={14} className="text-text-secondary" />
            <div className="text-xs text-text-secondary font-mono">{formatTs(dB.createdAt)}</div>
          </div>

          {/* Side-by-side overview cards */}
          <div className="grid grid-cols-2 gap-4">
            {[{ d: dA, label: 'A · Base' }, { d: dB, label: 'B · Compare' }].map(({ d, label }) => (
              <div key={d.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{label}</span>
                  <StatusBadge status={d.status} />
                </div>
                <div className="space-y-2">
                  {d.commitHash && (
                    <div className="flex items-center gap-2">
                      <GitCommit size={12} className="text-text-secondary shrink-0" />
                      <code className="text-xs text-accent font-mono">{d.commitHash.slice(0,7)}</code>
                      <span className="text-xs text-text-primary truncate">{d.commitMessage}</span>
                    </div>
                  )}
                  {d.commitAuthor && (
                    <div className="flex items-center gap-2">
                      <User size={12} className="text-text-secondary shrink-0" />
                      <span className="text-xs text-text-secondary">{d.commitAuthor}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock size={12} className="text-text-secondary shrink-0" />
                    <span className="text-xs text-text-secondary">{formatTs(d.createdAt)}</span>
                  </div>
                  {d.image && (
                    <div className="flex items-center gap-2">
                      <Image size={12} className="text-text-secondary shrink-0" />
                      <code className="text-xs text-text-secondary font-mono truncate">{d.image}</code>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs text-text-secondary font-mono">{d.id.slice(0,8)}…</code>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Metadata diff table */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <GitCompare size={14} className="text-accent" />
              <span className="text-sm font-semibold text-text-primary">Diff</span>
              {hasChanges ? (
                <span className="ml-auto text-xs text-warning bg-warning/10 px-2 py-0.5 rounded-full">Changes detected</span>
              ) : (
                <span className="ml-auto text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">No differences</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs text-text-secondary font-medium w-32">Field</th>
                    <th className="text-left py-2 px-3 text-xs text-text-secondary font-medium">A (Base)</th>
                    <th className="py-2 px-2 w-6" />
                    <th className="text-left py-2 px-3 text-xs text-text-secondary font-medium">B (Compare)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <DiffRow label="Status" a={dA.status} b={dB.status} />
                  <DiffRow label="Commit" a={dA.commitHash?.slice(0,7)} b={dB.commitHash?.slice(0,7)} />
                  <DiffRow label="Message" a={dA.commitMessage} b={dB.commitMessage} />
                  <DiffRow label="Author" a={dA.commitAuthor} b={dB.commitAuthor} />
                  <DiffRow label="Image" a={dA.image} b={dB.image} />
                  <DiffRow label="Deployed" a={formatTs(dA.createdAt)} b={formatTs(dB.createdAt)} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Commits between the two deployments */}
          {commitsInRange.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <GitCommit size={14} className="text-accent" />
                <span className="text-sm font-semibold text-text-primary">Deployments in Range</span>
                <span className="ml-auto text-xs text-text-secondary">{commitsInRange.length} between A and B</span>
              </div>
              <div className="divide-y divide-border/40">
                {commitsInRange.map((d, i) => (
                  <div key={d.id} className={`flex items-center gap-3 px-4 py-2.5 ${i === 0 ? 'opacity-60' : ''}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      d.status === 'SUCCESS' || d.status === 'ACTIVE' ? 'bg-success' :
                      d.status === 'FAILED' || d.status === 'CRASHED' ? 'bg-error' : 'bg-text-secondary'
                    }`} />
                    {d.commitHash && (
                      <code className="text-xs text-accent font-mono shrink-0">{d.commitHash.slice(0,7)}</code>
                    )}
                    <span className="text-xs text-text-primary flex-1 truncate">{d.commitMessage ?? '—'}</span>
                    {d.commitAuthor && (
                      <span className="text-xs text-text-secondary shrink-0">{d.commitAuthor}</span>
                    )}
                    <StatusBadge status={d.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : deployments.length === 0 && !loadingDeployments ? (
        <div className="text-center py-20 text-text-secondary">
          <GitCompare size={36} className="mx-auto mb-3 opacity-40" />
          <p>No deployments found — select a service above</p>
        </div>
      ) : !dA || !dB ? (
        <div className="text-center py-16 text-text-secondary">
          <GitCompare size={32} className="mx-auto mb-3 opacity-40" />
          <p>Select two deployments to compare</p>
        </div>
      ) : null}
    </div>
  )
}
