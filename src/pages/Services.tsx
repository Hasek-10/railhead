import React, { useState, useEffect, useCallback } from 'react'
import {
  Globe, Plus, X, Trash2, RefreshCw, Loader2, ChevronDown, ExternalLink,
  Copy, Check, AlertCircle, Server, GitBranch, Activity, RotateCcw,
  Play, Link, Shield, Clock,
} from 'lucide-react'
import { prefetchProjects, getCachedProjects } from '../cache'

interface Project {
  id: string
  name: string
  environments: { id: string; name: string }[]
  services: { id: string; name: string }[]
}

interface ServiceDomain {
  id: string
  domain: string
  type: 'railway' | 'custom'
  status?: string
}

interface ServiceInfo {
  id: string
  name: string
  domains: ServiceDomain[]
  status?: string
  replicas?: number
  updatedAt?: string
}

function Toast({ msg, type, onDone }: { msg: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg z-50 ${type === 'success' ? 'bg-success/20 border border-success/30 text-success' : 'bg-error/20 border border-error/30 text-error'}`}>
      {type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
      {msg}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-text-secondary hover:text-accent transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  )
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-success', DEPLOYING: 'text-accent animate-pulse',
  FAILED: 'text-error', CRASHED: 'text-error',
  SLEEPING: 'text-warning', REMOVED: 'text-text-secondary',
}

const DOMAIN_STATUS_COLORS: Record<string, string> = {
  VALID: 'text-success', PENDING: 'text-warning animate-pulse',
  ERROR: 'text-error', CHECKING: 'text-accent',
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

export default function Services(): React.JSX.Element {
  const _cached = getCachedProjects()
  const _cachedProjs = _cached ? parseCachedProjects(_cached) : []
  const [projects, setProjects] = useState<Project[]>(_cachedProjs)
  const [selectedProject, setSelectedProject] = useState(_cachedProjs[0]?.id ?? '')
  const [selectedEnv, setSelectedEnv] = useState(_cachedProjs[0]?.environments?.[0]?.id ?? '')
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(!_cached)
  const [expandedService, setExpandedService] = useState<string | null>(null)
  const [addDomainFor, setAddDomainFor] = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [addingDomain, setAddingDomain] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type })

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    if (!_cached) setLoadingProjects(true)
    try {
      const result = await prefetchProjects()
      if (result.code === 0) {
        const projs = parseCachedProjects(result)
        setProjects(projs)
        if (projs.length > 0) {
          setSelectedProject(id => id || projs[0].id)
          if (projs[0].environments?.length) setSelectedEnv(id => id || projs[0].environments[0].id)
        }
      }
    } catch { /* ignore */ }
    setLoadingProjects(false)
  }

  const loadServices = useCallback(async () => {
    if (!selectedProject || !selectedEnv) return
    setLoading(true)
    try {
      // Get service status from CLI
      const statusResult = await window.railway.serviceStatus(selectedProject, selectedEnv)
      let rawServices: any[] = []
      if (statusResult.code === 0 && statusResult.stdout) {
        try { rawServices = JSON.parse(statusResult.stdout) } catch { /* ignore */ }
      }

      // Get domain info via GraphQL
      const gqlResult = await window.railway.graphql(`
        query GetServiceDomains($projectId: String!, $environmentId: String!) {
          project(id: $projectId) {
            serviceInstances(environmentId: $environmentId) {
              edges {
                node {
                  serviceId
                  domains {
                    serviceDomains { domain }
                    customDomains {
                      edges {
                        node { id domain status }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `, { projectId: selectedProject, environmentId: selectedEnv })

      // Build service info list
      const activeProject = projects.find(p => p.id === selectedProject)
      const domainsByServiceId = new Map<string, ServiceDomain[]>()

      if (gqlResult.ok && gqlResult.data?.project?.serviceInstances?.edges) {
        for (const edge of gqlResult.data.project.serviceInstances.edges) {
          const node = edge.node
          const serviceId = node.serviceId
          const domains: ServiceDomain[] = []

          for (const sd of node.domains?.serviceDomains ?? []) {
            domains.push({ id: sd.domain, domain: sd.domain, type: 'railway' })
          }
          for (const cdEdge of node.domains?.customDomains?.edges ?? []) {
            const cd = cdEdge.node
            domains.push({ id: cd.id, domain: cd.domain, type: 'custom', status: cd.status })
          }
          domainsByServiceId.set(serviceId, domains)
        }
      }

      const infos: ServiceInfo[] = (activeProject?.services ?? []).map(svc => {
        const status = rawServices.find((s: any) => s.id === svc.id || s.name === svc.name)
        return {
          id: svc.id,
          name: svc.name,
          domains: domainsByServiceId.get(svc.id) ?? [],
          status: status?.status,
          replicas: status?.replicas,
          updatedAt: status?.updatedAt,
        }
      })

      setServices(infos)
    } catch (e) {
      showToast('Failed to load services', 'error')
    }
    setLoading(false)
  }, [selectedProject, selectedEnv, projects])

  useEffect(() => {
    if (selectedProject && selectedEnv) loadServices()
  }, [selectedProject, selectedEnv, loadServices])

  const handleAddDomain = async (serviceId: string) => {
    if (!newDomain.trim()) return
    setAddingDomain(true)
    try {
      const result = await window.railway.graphql(`
        mutation CreateCustomDomain($serviceId: String!, $environmentId: String!, $domain: String!) {
          customDomainCreate(input: { serviceId: $serviceId, environmentId: $environmentId, domain: $domain }) {
            id domain status
          }
        }
      `, { serviceId, environmentId: selectedEnv, domain: newDomain.trim() })
      if (result.ok) {
        showToast(`Domain ${newDomain.trim()} added`)
        setNewDomain('')
        setAddDomainFor(null)
        await loadServices()
      } else {
        showToast(result.error ?? 'Failed to add domain', 'error')
      }
    } catch (e: any) {
      showToast(e.message, 'error')
    }
    setAddingDomain(false)
  }

  const handleRemoveDomain = async (domainId: string, domain: string) => {
    if (!confirm(`Remove domain ${domain}?`)) return
    setActionLoading(`del-${domainId}`)
    try {
      const result = await window.railway.graphql(`
        mutation DeleteCustomDomain($id: String!) { customDomainDelete(id: $id) }
      `, { id: domainId })
      if (result.ok) {
        showToast(`Domain ${domain} removed`)
        await loadServices()
      } else {
        showToast(result.error ?? 'Failed to remove domain', 'error')
      }
    } catch (e: any) {
      showToast(e.message, 'error')
    }
    setActionLoading(null)
  }

  const handleRedeploy = async (serviceId: string, serviceName: string) => {
    setActionLoading(`redeploy-${serviceId}`)
    try {
      const result = await window.railway.serviceRedeploy(selectedProject, serviceId, selectedEnv)
      if (result.code === 0) {
        showToast(`${serviceName} redeploy triggered`)
        await loadServices()
      } else {
        showToast(result.stderr || 'Redeploy failed', 'error')
      }
    } catch (e: any) {
      showToast(e.message, 'error')
    }
    setActionLoading(null)
  }

  const handleRestart = async (serviceId: string, serviceName: string) => {
    setActionLoading(`restart-${serviceId}`)
    try {
      const result = await window.railway.serviceRestart(selectedProject, serviceId, selectedEnv)
      if (result.code === 0) {
        showToast(`${serviceName} restarted`)
        await loadServices()
      } else {
        showToast(result.stderr || 'Restart failed', 'error')
      }
    } catch (e: any) {
      showToast(e.message, 'error')
    }
    setActionLoading(null)
  }

  const activeProject = projects.find(p => p.id === selectedProject)

  return (
    <div className="h-full overflow-y-auto bg-bg p-6">
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Services</h1>
          <p className="text-text-secondary text-sm mt-0.5">Manage services, domains, and deployments</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Project selector */}
          {loadingProjects ? (
            <Loader2 size={16} className="animate-spin text-text-secondary" />
          ) : (
            <>
              <div className="relative">
                <select
                  value={selectedProject}
                  onChange={e => {
                    setSelectedProject(e.target.value)
                    const p = projects.find(p => p.id === e.target.value)
                    if (p?.environments?.length) setSelectedEnv(p.environments[0].id)
                  }}
                  className="appearance-none bg-surface border border-border rounded-lg pl-3 pr-7 py-1.5 text-sm text-text-primary"
                >
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={selectedEnv}
                  onChange={e => setSelectedEnv(e.target.value)}
                  className="appearance-none bg-surface border border-border rounded-lg pl-3 pr-7 py-1.5 text-sm text-text-primary"
                >
                  {(activeProject?.environments ?? []).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              </div>
            </>
          )}
          <button
            onClick={loadServices}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-border border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Service cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          <Server size={32} className="mx-auto mb-3 opacity-40" />
          <p>No services found for this project/environment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map(svc => {
            const isExpanded = expandedService === svc.id
            return (
              <div key={svc.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                {/* Service header */}
                <button
                  onClick={() => setExpandedService(isExpanded ? null : svc.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-border/30 transition-colors"
                >
                  <div className="w-8 h-8 bg-accent/20 rounded-lg flex items-center justify-center shrink-0">
                    <Server size={15} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary font-medium text-sm">{svc.name}</span>
                      {svc.status && (
                        <span className={`text-xs font-mono ${STATUS_COLORS[svc.status] ?? 'text-text-secondary'}`}>
                          ● {svc.status}
                        </span>
                      )}
                      {svc.replicas !== undefined && svc.replicas > 0 && (
                        <span className="text-xs text-text-secondary bg-border rounded px-1.5 py-0.5">
                          {svc.replicas} replica{svc.replicas !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-text-secondary font-mono">{svc.id.slice(0, 8)}…</span>
                      {svc.domains.length > 0 && (
                        <span className="text-xs text-accent">
                          {svc.domains.length} domain{svc.domains.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {svc.updatedAt && (
                        <span className="text-xs text-text-secondary flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(svc.updatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); handleRestart(svc.id, svc.name) }}
                      disabled={!!actionLoading}
                      className="p-1.5 text-text-secondary hover:text-accent hover:bg-accent/10 rounded-md transition-colors text-xs"
                      title="Restart"
                    >
                      {actionLoading === `restart-${svc.id}` ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleRedeploy(svc.id, svc.name) }}
                      disabled={!!actionLoading}
                      className="p-1.5 text-text-secondary hover:text-accent hover:bg-accent/10 rounded-md transition-colors text-xs"
                      title="Redeploy"
                    >
                      {actionLoading === `redeploy-${svc.id}` ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    </button>
                    <ChevronDown size={14} className={`text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    {/* Domains section */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Domains</span>
                        <button
                          onClick={() => setAddDomainFor(addDomainFor === svc.id ? null : svc.id)}
                          className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          <Plus size={12} /> Add Custom Domain
                        </button>
                      </div>

                      {svc.domains.length === 0 ? (
                        <p className="text-xs text-text-secondary italic">No domains configured</p>
                      ) : (
                        <div className="space-y-1.5">
                          {svc.domains.map(d => (
                            <div key={d.id} className="flex items-center gap-2 p-2 bg-bg rounded-lg">
                              {d.type === 'railway' ? (
                                <Globe size={13} className="text-accent shrink-0" />
                              ) : (
                                <Shield size={13} className="text-green-400 shrink-0" />
                              )}
                              <a
                                href={`https://${d.domain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-text-primary font-mono hover:text-accent transition-colors flex-1 truncate"
                              >
                                {d.domain}
                              </a>
                              {d.status && (
                                <span className={`text-xs ${DOMAIN_STATUS_COLORS[d.status] ?? 'text-text-secondary'}`}>
                                  {d.status}
                                </span>
                              )}
                              <span className="text-xs text-text-secondary bg-border rounded px-1.5">
                                {d.type === 'railway' ? 'railway' : 'custom'}
                              </span>
                              <CopyButton text={`https://${d.domain}`} />
                              <a
                                href={`https://${d.domain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-text-secondary hover:text-accent transition-colors"
                              >
                                <ExternalLink size={12} />
                              </a>
                              {d.type === 'custom' && (
                                <button
                                  onClick={() => handleRemoveDomain(d.id, d.domain)}
                                  disabled={!!actionLoading}
                                  className="text-text-secondary hover:text-error transition-colors"
                                  title="Remove domain"
                                >
                                  {actionLoading === `del-${d.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add domain input */}
                      {addDomainFor === svc.id && (
                        <div className="flex gap-2 mt-2">
                          <div className="flex-1 relative">
                            <Link size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                            <input
                              type="text"
                              value={newDomain}
                              onChange={e => setNewDomain(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleAddDomain(svc.id)}
                              placeholder="yourdomain.com"
                              autoFocus
                              className="w-full bg-bg border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
                            />
                          </div>
                          <button
                            onClick={() => handleAddDomain(svc.id)}
                            disabled={addingDomain || !newDomain.trim()}
                            className="px-3 py-1.5 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm disabled:opacity-40 transition-colors"
                          >
                            {addingDomain ? <Loader2 size={13} className="animate-spin" /> : 'Add'}
                          </button>
                          <button
                            onClick={() => { setAddDomainFor(null); setNewDomain('') }}
                            className="px-2 py-1.5 text-text-secondary hover:text-text-primary rounded-lg text-sm transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Service metadata */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-bg rounded-lg p-2.5">
                        <p className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                          <Activity size={10} /> Service ID
                        </p>
                        <div className="flex items-center gap-1">
                          <code className="text-xs text-text-primary font-mono">{svc.id}</code>
                          <CopyButton text={svc.id} />
                        </div>
                      </div>
                      {svc.status && (
                        <div className="bg-bg rounded-lg p-2.5">
                          <p className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                            <GitBranch size={10} /> Status
                          </p>
                          <span className={`text-xs font-medium ${STATUS_COLORS[svc.status] ?? 'text-text-secondary'}`}>
                            {svc.status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

