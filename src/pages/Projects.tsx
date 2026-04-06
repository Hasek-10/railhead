import React, { useState, useEffect } from 'react'
import {
  FolderOpen, Plus, RefreshCw, Loader2, AlertCircle,
  Link2, CheckCircle2, X, ChevronDown, Layers, Eye,
} from 'lucide-react'
import ProjectDetail from '../components/ProjectDetail'
import { prefetchProjects, getCachedProjects } from '../cache'

interface ProjectsProps {
  currentDirectory: string
  onDirectoryChange: (dir: string) => void
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
  services: { id: string; name: string }[]
  updatedAt: string
}

function parseProjects(json: string): Project[] {
  try {
    const raw = JSON.parse(json)
    if (!Array.isArray(raw)) return []
    return raw.map((p: any) => ({
      id: p.id,
      name: p.name,
      workspace: p.workspace || { id: '', name: 'Personal' },
      environments: (p.environments?.edges || []).map((e: any) => ({
        id: e.node.id,
        name: e.node.name,
      })),
      services: (p.services?.edges || []).map((e: any) => ({
        id: e.node.id,
        name: e.node.name,
      })),
      updatedAt: p.updatedAt,
    }))
  } catch {
    return []
  }
}

function LinkModal({
  project,
  directory,
  onClose,
  onSuccess,
  onDirectoryChange,
}: {
  project: Project
  directory: string
  onClose: () => void
  onSuccess: (dir: string) => void
  onDirectoryChange: (dir: string) => void
}): React.JSX.Element {
  const [selectedEnv, setSelectedEnv] = useState(
    project.environments.find((e) => e.name === 'production')?.id ||
    project.environments[0]?.id || ''
  )
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')

  const handleBrowse = async () => {
    const dir = await window.railway.openDirectoryDialog()
    if (dir) onDirectoryChange(dir)
  }

  const handleLink = async () => {
    setLinking(true)
    setError('')
    try {
      const result = await window.railway.link(project.id, selectedEnv || undefined, directory)
      if (result.code !== 0) {
        setError(result.stderr || result.stdout || 'Link failed')
      } else {
        await window.railway.setProjectDir(project.id, directory)
        onSuccess(directory)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Link failed')
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-text-primary font-semibold">Link Project</h2>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-3 bg-accent/5 border border-accent/20 rounded-lg mb-4">
          <p className="text-text-primary text-sm font-medium">{project.name}</p>
          <p className="text-text-secondary text-xs mt-0.5">{project.workspace.name}</p>
        </div>

        {/* Directory selector */}
        <div className="mb-4">
          <label className="block text-text-secondary text-xs mb-1.5">Directory</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2 min-w-0">
              <FolderOpen size={13} className="text-text-secondary shrink-0" />
              <span className="text-sm font-mono text-text-primary truncate">{directory || 'Select a directory...'}</span>
            </div>
            <button
              onClick={handleBrowse}
              className="px-3 py-2 bg-bg hover:bg-border border border-border rounded-lg text-text-secondary hover:text-text-primary text-xs transition-colors shrink-0"
            >
              Browse
            </button>
          </div>
        </div>

        {project.environments.length > 0 && (
          <div className="mb-4">
            <label className="block text-text-secondary text-xs mb-1.5">Environment</label>
            <div className="relative">
              <select
                value={selectedEnv}
                onChange={(e) => setSelectedEnv(e.target.value)}
                className="w-full appearance-none bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none pr-8"
              >
                {project.environments.map((env) => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg mb-4">
            <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
            <p className="text-error text-xs">{error}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={linking || !directory}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-60 rounded-lg text-white text-sm font-medium transition-colors"
          >
            {linking ? <><Loader2 size={14} className="animate-spin" />Linking...</> : <><Link2 size={14} />Link Project</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewProjectModal({
  onClose, onSuccess,
}: { onClose: () => void; onSuccess: () => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setIsCreating(true)
    setError('')
    try {
      const result = await window.railway.newProject(name || undefined)
      if (result.code !== 0) {
        setError(result.stderr || 'Failed to create project')
      } else {
        onSuccess()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-text-primary font-semibold">New Project</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors"><X size={18} /></button>
        </div>
        <div className="mb-4">
          <label className="block text-text-secondary text-xs mb-1.5">Project Name (optional)</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="my-project"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
            autoFocus
          />
        </div>
        {error && (
          <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg mb-4">
            <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
            <p className="text-error text-xs">{error}</p>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Cancel</button>
          <button onClick={handleCreate} disabled={isCreating}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-60 rounded-lg text-white text-sm font-medium"
          >
            {isCreating ? <><Loader2 size={14} className="animate-spin" />Creating...</> : <><Plus size={14} />Create</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Projects({ currentDirectory, onDirectoryChange }: ProjectsProps): React.JSX.Element {
  const cached = getCachedProjects()
  const [projects, setProjects] = useState<Project[]>(() => cached ? parseProjects(cached.stdout) : [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [linkTarget, setLinkTarget] = useState<Project | null>(null)
  const [detailProject, setDetailProject] = useState<Project | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [linkDir, setLinkDir] = useState(currentDirectory)
  const [savedDirs, setSavedDirs] = useState<Record<string, string>>({})

  useEffect(() => {
    loadProjects()
    window.railway.getAllProjectDirs().then(setSavedDirs).catch(() => {})
  }, [])

  const loadProjects = async () => {
    if (!getCachedProjects()) setIsLoading(true)
    setError('')
    try {
      const result = await prefetchProjects()
      if (result.code !== 0 && !result.stdout) {
        setError(result.stderr || 'Failed to list projects')
      } else {
        setProjects(parseProjects(result.stdout))
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to list projects')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLinkClick = async (project: Project) => {
    // Pre-populate with saved directory if available, otherwise open dialog
    const saved = savedDirs[project.id]
    if (saved) {
      setLinkDir(saved)
      setLinkTarget(project)
    } else {
      const dir = await window.railway.openDirectoryDialog()
      if (!dir) return
      onDirectoryChange(dir)
      setLinkDir(dir)
      setLinkTarget(project)
    }
  }

  const handleLinkSuccess = (dir: string) => {
    setSavedDirs(prev => ({ ...prev, [linkTarget!.id]: dir }))
    onDirectoryChange(dir)
    setLinkTarget(null)
    setSuccessMsg(`Linked ${linkTarget?.name} successfully!`)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 30) return `${days}d ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
  }

  return (
    <div className="h-full overflow-y-auto bg-bg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Projects</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {projects.length > 0 ? `${projects.length} project${projects.length !== 1 ? 's' : ''}` : 'Manage your Railway projects'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover rounded-lg text-white text-sm font-medium transition-colors"
          >
            <Plus size={14} />New Project
          </button>
          <button onClick={loadProjects}
            className="p-2 bg-surface hover:bg-border rounded-lg text-text-secondary hover:text-text-primary transition-colors border border-border"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg mb-4">
          <CheckCircle2 size={14} className="text-success" />
          <p className="text-success text-sm">{successMsg}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="text-accent animate-spin" />
            <p className="text-text-secondary text-sm">Loading projects...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle size={32} className="text-error mb-3" />
          <p className="text-text-primary font-medium mb-1">Failed to load projects</p>
          <p className="text-text-secondary text-sm text-center max-w-md mb-4">{error}</p>
          <button onClick={loadProjects} className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-white text-sm">Retry</button>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <FolderOpen size={48} className="text-text-secondary/30 mb-4" />
          <p className="text-text-primary font-medium mb-1">No projects found</p>
          <p className="text-text-secondary text-sm mb-6">Create your first Railway project to get started.</p>
          <button onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg text-white text-sm"
          >
            <Plus size={14} />Create New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {projects.map((project) => (
            <div key={project.id} className="bg-surface border border-border hover:border-accent/30 rounded-xl p-4 transition-all group">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 bg-accent/10 group-hover:bg-accent/20 rounded-lg flex items-center justify-center transition-colors shrink-0">
                  <FolderOpen size={18} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-medium text-sm truncate">{project.name}</p>
                  <p className="text-text-secondary text-xs truncate">{project.workspace.name}</p>
                </div>
              </div>

              {project.environments.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {project.environments.map((env) => (
                    <span key={env.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg border border-border rounded-full text-text-secondary text-xs"
                    >
                      <Layers size={10} />
                      {env.name}
                    </span>
                  ))}
                </div>
              )}

              {savedDirs[project.id] && (
                <div className="flex items-center gap-1.5 mb-3 text-xs text-text-secondary">
                  <FolderOpen size={11} className="text-success shrink-0" />
                  <span className="font-mono truncate">{savedDirs[project.id]}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-text-secondary/60 text-xs">Updated {timeAgo(project.updatedAt)}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setDetailProject(project)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-accent/10 border border-border hover:border-accent/40 text-text-secondary hover:text-accent rounded-lg text-xs font-medium transition-all"
                  >
                    <Eye size={12} />
                    View
                  </button>
                  <button
                    onClick={() => handleLinkClick(project)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 hover:bg-accent text-accent hover:text-white rounded-lg text-xs font-medium transition-all"
                  >
                    <Link2 size={12} />
                    {savedDirs[project.id] ? 'Re-link' : 'Link'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {linkTarget && (
        <LinkModal
          project={linkTarget}
          directory={linkDir}
          onClose={() => setLinkTarget(null)}
          onSuccess={handleLinkSuccess}
          onDirectoryChange={(dir) => { setLinkDir(dir); onDirectoryChange(dir) }}
        />
      )}

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onSuccess={() => { setShowNewModal(false); loadProjects() }}
        />
      )}

      {detailProject && (
        <ProjectDetail
          project={detailProject}
          onClose={() => setDetailProject(null)}
        />
      )}
    </div>
  )
}

export default Projects
