import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { prefetchProjects, prefetchServiceStatus, getCachedProjects, getCachedServiceStatus, invalidateServiceStatus } from '../cache'
import {
  RefreshCw, Loader2, Server, Globe, CheckCircle2, AlertCircle,
  XCircle, Activity, GitBranch, Layers, Zap, Clock, ExternalLink,
  TrendingUp, Box,
} from 'lucide-react'

interface DashboardProps {
  currentDirectory: string
}

interface ServiceStatus {
  id: string
  name: string
  status: string
  url?: string
}

interface ProjectHealth {
  id: string
  name: string
  environments: { id: string; name: string }[]
  services: { id: string; name: string }[]
  serviceStatuses: ServiceStatus[]
  loading: boolean
  error?: string
  activeEnvironmentId: string
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  ACTIVE: { color: 'text-success', bg: 'bg-success/10', icon: <CheckCircle2 size={12} />, label: 'Active' },
  DEPLOYING: { color: 'text-accent', bg: 'bg-accent/10', icon: <Loader2 size={12} className="animate-spin" />, label: 'Deploying' },
  SLEEPING: { color: 'text-warning', bg: 'bg-warning/10', icon: <Clock size={12} />, label: 'Sleeping' },
  CRASHED: { color: 'text-error', bg: 'bg-error/10', icon: <XCircle size={12} />, label: 'Crashed' },
  FAILED: { color: 'text-error', bg: 'bg-error/10', icon: <AlertCircle size={12} />, label: 'Failed' },
  REMOVED: { color: 'text-text-secondary', bg: 'bg-border', icon: <Box size={12} />, label: 'Removed' },
}

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { color: 'text-text-secondary', bg: 'bg-border', icon: <Activity size={12} />, label: status }
}

function ProjectCard({ project, onRefresh }: { project: ProjectHealth; onRefresh: (id: string) => void }) {
  const navigate = useNavigate()
  const allStatuses = project.serviceStatuses
  const activeCount = allStatuses.filter(s => s.status === 'ACTIVE').length
  const failedCount = allStatuses.filter(s => ['CRASHED', 'FAILED'].includes(s.status)).length
  const deployingCount = allStatuses.filter(s => s.status === 'DEPLOYING').length

  const health = failedCount > 0 ? 'degraded' : deployingCount > 0 ? 'deploying' : activeCount === allStatuses.length && allStatuses.length > 0 ? 'healthy' : 'unknown'

  const healthColor = {
    healthy: 'border-success/30 bg-success/5',
    degraded: 'border-error/30 bg-error/5',
    deploying: 'border-accent/30 bg-accent/5',
    unknown: 'border-border',
  }[health]

  const healthDot = {
    healthy: 'bg-success',
    degraded: 'bg-error animate-pulse',
    deploying: 'bg-accent animate-pulse',
    unknown: 'bg-text-secondary',
  }[health]

  return (
    <div className={`bg-surface border rounded-xl overflow-hidden transition-colors ${healthColor}`}>
      {/* Card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${healthDot}`} />
            <div>
              <h3 className="text-text-primary font-semibold text-sm">{project.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-text-secondary">{project.services.length} service{project.services.length !== 1 ? 's' : ''}</span>
                <span className="text-text-secondary">·</span>
                <span className="text-xs text-text-secondary">{project.environments.length} env{project.environments.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onRefresh(project.id)}
              className="p-1 text-text-secondary hover:text-accent rounded-md transition-colors"
              title="Refresh"
            >
              <RefreshCw size={12} className={project.loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => navigate('/projects')}
              className="p-1 text-text-secondary hover:text-accent rounded-md transition-colors"
              title="Open in Projects"
            >
              <ExternalLink size={12} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-3">
          {activeCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 size={10} /> {activeCount} active
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-error">
              <XCircle size={10} /> {failedCount} failed
            </span>
          )}
          {deployingCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-accent">
              <Loader2 size={10} className="animate-spin" /> {deployingCount} deploying
            </span>
          )}
        </div>
      </div>

      {/* Services list */}
      <div className="border-t border-border/50 divide-y divide-border/30">
        {project.loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="animate-spin text-accent" />
          </div>
        ) : project.error ? (
          <div className="px-4 py-3 text-xs text-text-secondary italic">{project.error}</div>
        ) : project.serviceStatuses.length === 0 ? (
          <div className="px-4 py-3 text-xs text-text-secondary italic">No service status available</div>
        ) : (
          project.serviceStatuses.slice(0, 5).map(svc => {
            const cfg = getStatusConfig(svc.status)
            return (
              <div key={svc.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Server size={12} className="text-text-secondary shrink-0" />
                  <span className="text-xs text-text-primary truncate">{svc.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {svc.url && (
                    <a
                      href={svc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-text-secondary hover:text-accent"
                    >
                      <Globe size={11} />
                    </a>
                  )}
                  <span className={`flex items-center gap-1 text-xs ${cfg.color} ${cfg.bg} px-1.5 py-0.5 rounded-full`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>
              </div>
            )
          })
        )}
        {project.serviceStatuses.length > 5 && (
          <div className="px-4 py-2 text-xs text-text-secondary">
            +{project.serviceStatuses.length - 5} more services
          </div>
        )}
      </div>
    </div>
  )
}

function parseStatuses(raw: any[]): ServiceStatus[] {
  return raw.map((s: any) => ({
    id:     s.id ?? s.serviceId ?? s.name,
    name:   s.name ?? s.serviceName ?? 'unknown',
    status: s.status ?? 'UNKNOWN',
    url:    s.url ?? s.serviceUrl,
  }))
}

function parseHealthProjects(result: { code: number; stdout: string }, prefillStatuses = false): ProjectHealth[] {
  if (result.code !== 0) return []
  try {
    const parsed = JSON.parse(result.stdout)
    const projs: any[] = Array.isArray(parsed) ? parsed : (parsed.projects ?? [])
    return projs.map(p => {
      const environments = (p.environments?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name }))
      const services = (p.services?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name }))
      const envId = environments[0]?.id ?? ''
      const cached = prefillStatuses ? getCachedServiceStatus(p.id, envId) : null
      let statuses: ServiceStatus[] = []
      if (cached?.code === 0 && cached.stdout) {
        try { statuses = parseStatuses(JSON.parse(cached.stdout)) } catch { /* ignore */ }
      }
      return {
        id: p.id,
        name: p.name,
        environments,
        services,
        serviceStatuses: statuses,
        loading: !cached,
        activeEnvironmentId: envId,
      }
    })
  } catch {
    return []
  }
}

function Dashboard({ currentDirectory }: DashboardProps): React.JSX.Element {
  const cached = getCachedProjects()
  const [projects, setProjects] = useState<ProjectHealth[]>(() =>
    cached ? parseHealthProjects(cached, true) : []
  )
  const [loadingAll, setLoadingAll] = useState(!cached)
  const [username, setUsername] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    loadAll()
    window.railway.whoami().then(setUsername).catch(() => {})
  }, [])

  const loadAll = async (forceRefresh = false) => {
    if (forceRefresh) setLoadingAll(true)
    try {
      const result = await (forceRefresh
        ? window.railway.list()
        : prefetchProjects())
      if (result.code !== 0) { setLoadingAll(false); return }

      const healthProjects = parseHealthProjects(result, true)
      setProjects(healthProjects)
      setLoadingAll(false)

      // Load service statuses in parallel (uses cache where available)
      await Promise.all(healthProjects.map(async (proj) => {
        if (!proj.activeEnvironmentId) {
          setProjects(prev => prev.map(p => p.id === proj.id ? { ...p, loading: false } : p))
          return
        }
        if (!proj.loading) return // already served from cache
        try {
          const statusResult = await prefetchServiceStatus(proj.id, proj.activeEnvironmentId)
          let statuses: ServiceStatus[] = []
          if (statusResult.code === 0 && statusResult.stdout) {
            try { statuses = parseStatuses(JSON.parse(statusResult.stdout)) } catch { /* ignore */ }
          }
          setProjects(prev => prev.map(p =>
            p.id === proj.id ? { ...p, loading: false, serviceStatuses: statuses } : p
          ))
        } catch {
          setProjects(prev => prev.map(p =>
            p.id === proj.id ? { ...p, loading: false, error: 'Failed to load status' } : p
          ))
        }
      }))
    } catch {
      setLoadingAll(false)
    }
  }

  const refreshProject = async (projectId: string) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, loading: true, error: undefined } : p))
    const proj = projects.find(p => p.id === projectId)
    if (!proj || !proj.activeEnvironmentId) {
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, loading: false } : p))
      return
    }
    invalidateServiceStatus(projectId)
    try {
      const statusResult = await prefetchServiceStatus(proj.id, proj.activeEnvironmentId)
      let statuses: ServiceStatus[] = []
      if (statusResult.code === 0 && statusResult.stdout) {
        try { statuses = parseStatuses(JSON.parse(statusResult.stdout)) } catch { /* ignore */ }
      }
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, loading: false, serviceStatuses: statuses } : p
      ))
    } catch {
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, loading: false, error: 'Failed to load status' } : p
      ))
    }
  }

  // Aggregate stats
  const totalServices = projects.reduce((acc, p) => acc + p.services.length, 0)
  const allStatuses = projects.flatMap(p => p.serviceStatuses)
  const activeServices = allStatuses.filter(s => s.status === 'ACTIVE').length
  const failedServices = allStatuses.filter(s => ['CRASHED', 'FAILED'].includes(s.status)).length
  const deployingServices = allStatuses.filter(s => s.status === 'DEPLOYING').length

  return (
    <div className="h-full overflow-y-auto bg-bg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Health Board</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {username ? `Welcome back, ${username}` : 'All projects overview'}
          </p>
        </div>
        <button
          onClick={() => loadAll(true)}
          disabled={loadingAll}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-border border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <RefreshCw size={13} className={loadingAll ? 'animate-spin' : ''} />
          Refresh All
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Projects', value: projects.length, icon: <Layers size={16} className="text-accent" />, color: 'text-text-primary' },
          { label: 'Services', value: totalServices, icon: <Server size={16} className="text-blue-400" />, color: 'text-text-primary' },
          { label: 'Active', value: activeServices, icon: <CheckCircle2 size={16} className="text-success" />, color: 'text-success' },
          { label: failedServices > 0 ? 'Failed' : deployingServices > 0 ? 'Deploying' : 'Healthy',
            value: failedServices > 0 ? failedServices : deployingServices > 0 ? deployingServices : projects.length,
            icon: failedServices > 0 ? <AlertCircle size={16} className="text-error" /> : deployingServices > 0 ? <Zap size={16} className="text-accent animate-pulse" /> : <TrendingUp size={16} className="text-success" />,
            color: failedServices > 0 ? 'text-error' : deployingServices > 0 ? 'text-accent' : 'text-success',
          },
        ].map(stat => (
          <div key={stat.label} className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-bg rounded-lg flex items-center justify-center shrink-0">
              {stat.icon}
            </div>
            <div>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-text-secondary">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Project grid */}
      {loadingAll ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-accent" />
            <p className="text-text-secondary text-sm">Loading projects…</p>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <GitBranch size={36} className="mx-auto mb-3 text-text-secondary opacity-40" />
          <p className="text-text-secondary">No projects found</p>
          <button
            onClick={() => navigate('/projects')}
            className="mt-3 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/80 transition-colors"
          >
            Go to Projects
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(project => (
            <ProjectCard key={project.id} project={project} onRefresh={refreshProject} />
          ))}
        </div>
      )}
    </div>
  )
}

export default Dashboard
