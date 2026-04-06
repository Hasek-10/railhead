import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  Rocket, FolderOpen, Play, Square, CheckCircle2, XCircle,
  Loader2, GitBranch, GitCommit, GitMerge, ArrowUp, ArrowDown,
  AlertTriangle, FileText, Upload, RefreshCw, ChevronDown, Pencil,
} from 'lucide-react'
import TerminalComponent, { TerminalHandle } from '../components/Terminal'
import { prefetchProjects, getCachedProjects } from '../cache'

interface Project {
  id: string
  name: string
  services: { id: string; name: string }[]
}

function parseCachedProjects(r: { stdout: string }): Project[] {
  try {
    const parsed = JSON.parse(r.stdout)
    const projs: any[] = Array.isArray(parsed) ? parsed : (parsed.projects ?? [])
    return projs.map(p => ({
      id: p.id, name: p.name,
      services: (p.services?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name })),
    }))
  } catch { return [] }
}

interface DeployProps {
  currentDirectory: string
  onDirectoryChange: (dir: string) => void
}

type DeployMode = 'local' | 'commit-deploy' | 'push-deploy'
type DeployStatus = 'idle' | 'deploying' | 'success' | 'error'

interface GitStatus {
  isRepo: boolean
  branch?: string
  staged?: number
  modified?: number
  untracked?: number
  clean?: boolean
  commits?: { hash: string; short: string; message: string; relativeTime: string; author: string }[]
  remoteUrl?: string
  ahead?: number
  behind?: number
}

function GitStatusPanel({
  status,
  loading,
  onRefresh,
}: {
  status: GitStatus | null
  loading: boolean
  onRefresh: () => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-secondary text-xs py-2">
        <Loader2 size={12} className="animate-spin" /> Checking git status…
      </div>
    )
  }
  if (!status?.isRepo) {
    return (
      <div className="flex items-center gap-2 text-text-secondary text-xs py-2">
        <AlertTriangle size={12} className="text-warning" />
        Not a git repository
      </div>
    )
  }

  const totalChanges = (status.staged ?? 0) + (status.modified ?? 0) + (status.untracked ?? 0)

  return (
    <div className="flex items-center gap-4 text-xs flex-wrap">
      {/* Branch */}
      <div className="flex items-center gap-1.5 text-text-primary">
        <GitBranch size={12} className="text-accent" />
        <span className="font-mono font-medium">{status.branch}</span>
      </div>

      {/* Ahead/behind */}
      {(status.ahead ?? 0) > 0 && (
        <div className="flex items-center gap-1 text-accent">
          <ArrowUp size={11} />
          <span>{status.ahead} ahead</span>
        </div>
      )}
      {(status.behind ?? 0) > 0 && (
        <div className="flex items-center gap-1 text-warning">
          <ArrowDown size={11} />
          <span>{status.behind} behind</span>
        </div>
      )}

      {/* Changes */}
      {status.clean ? (
        <div className="flex items-center gap-1 text-success">
          <CheckCircle2 size={11} />
          <span>Clean</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-warning">
          <FileText size={11} />
          <span>
            {totalChanges} change{totalChanges !== 1 ? 's' : ''}
            {status.staged ? ` (${status.staged} staged)` : ''}
            {status.modified ? `, ${status.modified} modified` : ''}
            {status.untracked ? `, ${status.untracked} untracked` : ''}
          </span>
        </div>
      )}

      {/* Last commit */}
      {status.commits?.[0] && (
        <div className="flex items-center gap-1.5 text-text-secondary">
          <GitCommit size={11} />
          <code className="text-accent">{status.commits[0].short}</code>
          <span className="truncate max-w-[180px]">{status.commits[0].message}</span>
          <span className="text-text-secondary/60">{status.commits[0].relativeTime}</span>
        </div>
      )}

      <button
        onClick={onRefresh}
        className="ml-auto text-text-secondary hover:text-accent transition-colors"
        title="Refresh git status"
      >
        <RefreshCw size={11} />
      </button>
    </div>
  )
}

function Deploy({ currentDirectory, onDirectoryChange }: DeployProps): React.JSX.Element {
  const _cached = getCachedProjects()
  const _cachedProjs = _cached ? parseCachedProjects(_cached) : []

  const [deployStatus, setDeployStatus] = useState<DeployStatus>('idle')
  const [mode, setMode] = useState<DeployMode>('local')
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [commitError, setCommitError] = useState('')
  const [gitOpStatus, setGitOpStatus] = useState('')
  const [showCommitLog, setShowCommitLog] = useState(false)
  const [projects, setProjects] = useState<Project[]>(_cachedProjs)
  const [selectedProject, setSelectedProject] = useState<string>(_cachedProjs[0]?.id ?? '')
  const [selectedService, setSelectedService] = useState<string>(_cachedProjs[0]?.services?.[0]?.id ?? '')
  const [loadingProjects, setLoadingProjects] = useState(!_cached)
  const terminalRef = useRef<TerminalHandle>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    loadGitStatus()
    return () => { cleanupRef.current?.() }
  }, [currentDirectory])

  useEffect(() => {
    prefetchProjects().then(result => {
      if (result.code === 0) {
        const projs = parseCachedProjects(result)
        setProjects(projs)
        if (projs.length > 0) {
          setSelectedProject(id => id || projs[0].id)
          setSelectedService(id => id || (projs[0].services?.[0]?.id ?? ''))
        }
      }
    }).catch(() => {}).finally(() => setLoadingProjects(false))
  }, [])

  const loadGitStatus = async () => {
    if (!currentDirectory) return
    setGitLoading(true)
    try {
      const s = await window.railway.gitStatus(currentDirectory)
      setGitStatus(s)
    } catch { setGitStatus(null) }
    setGitLoading(false)
  }

  const handlePickDirectory = async () => {
    const dir = await window.railway.openDirectoryDialog()
    if (dir) onDirectoryChange(dir)
  }

  // Core deploy runner — always ends with `railway up`
  const runDeploy = useCallback((prefix?: string, serviceId?: string) => {
    setDeployStatus('deploying')
    terminalRef.current?.clear()
    if (prefix) terminalRef.current?.write(prefix)
    terminalRef.current?.write(`\x1b[36mDeploying from: ${currentDirectory}\x1b[0m\r\n`)
    const cmd = serviceId ? `railway up --service ${serviceId}` : 'railway up'
    terminalRef.current?.write(`\x1b[36mRunning: ${cmd}\x1b[0m\r\n\r\n`)

    const cleanup = window.railway.up(
      (chunk) => terminalRef.current?.write(chunk),
      (code) => {
        cleanupRef.current = null
        if (code === 0) {
          setDeployStatus('success')
          terminalRef.current?.write('\r\n\x1b[32m✓ Deployment complete!\x1b[0m\r\n')
          loadGitStatus()
        } else {
          setDeployStatus('error')
          terminalRef.current?.write(`\r\n\x1b[31m✗ Deployment failed (exit ${code})\x1b[0m\r\n`)
        }
        setTimeout(() => setDeployStatus('idle'), 3000)
      },
      currentDirectory,
      serviceId
    )
    cleanupRef.current = cleanup
  }, [currentDirectory])

  const handleLocalDeploy = useCallback(() => {
    if (deployStatus === 'deploying') {
      cleanupRef.current?.()
      cleanupRef.current = null
      setDeployStatus('idle')
      terminalRef.current?.write('\r\n\x1b[33m[Cancelled]\x1b[0m\r\n')
      return
    }
    runDeploy(undefined, selectedService || undefined)
  }, [deployStatus, runDeploy, selectedService])

  const handleCommitAndDeploy = async () => {
    if (!commitMsg.trim()) { setCommitError('Commit message is required'); return }
    setCommitError('')
    setGitOpStatus('Staging & committing…')
    terminalRef.current?.clear()
    terminalRef.current?.write(`\x1b[36mgit add -A && git commit -m "${commitMsg}"\x1b[0m\r\n`)

    const commitRes = await window.railway.gitCommit(currentDirectory, commitMsg)
    terminalRef.current?.write(commitRes.stdout || commitRes.stderr)

    if (commitRes.code !== 0) {
      setGitOpStatus('')
      terminalRef.current?.write(`\r\n\x1b[31m✗ Commit failed\x1b[0m\r\n`)
      return
    }

    setGitOpStatus('')
    setCommitMsg('')
    await loadGitStatus()
    runDeploy('\x1b[32m✓ Committed\x1b[0m\r\n\r\n', selectedService || undefined)
  }

  const handlePushAndDeploy = async () => {
    setGitOpStatus('Pushing…')
    terminalRef.current?.clear()
    terminalRef.current?.write('\x1b[36mgit push\x1b[0m\r\n')

    const pushRes = await window.railway.gitPush(currentDirectory)
    terminalRef.current?.write(pushRes.stdout || pushRes.stderr)

    if (pushRes.code !== 0) {
      setGitOpStatus('')
      terminalRef.current?.write(`\r\n\x1b[31m✗ Push failed\x1b[0m\r\n`)
      return
    }

    setGitOpStatus('')
    await loadGitStatus()
    runDeploy('\x1b[32m✓ Pushed\x1b[0m\r\n\r\n', selectedService || undefined)
  }

  const deployBtnClass = (s: DeployStatus) => {
    const base = 'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md'
    return `${base} ${
      s === 'deploying' ? 'bg-warning hover:bg-warning/90 text-white shadow-warning/25' :
      s === 'success'   ? 'bg-success hover:bg-success/90 text-white shadow-success/25' :
      s === 'error'     ? 'bg-error hover:bg-error/90 text-white shadow-error/25' :
                          'bg-accent hover:bg-accent/80 text-white shadow-accent/25'
    }`
  }

  return (
    <div className="h-full flex flex-col bg-bg overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden p-5 gap-3">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-text-primary">Deploy</h1>
          <p className="text-text-secondary text-sm mt-0.5">Build and deploy your project to Railway</p>
        </div>

        {/* Directory + Git status */}
        <div className="bg-surface border border-border rounded-xl p-4 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2 min-w-0">
              <FolderOpen size={13} className="text-text-secondary shrink-0" />
              <span className="text-sm font-mono text-text-primary truncate">{currentDirectory || '~'}</span>
            </div>
            <button
              onClick={handlePickDirectory}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-border border border-border rounded-lg text-text-secondary hover:text-text-primary text-sm transition-colors shrink-0"
            >
              <FolderOpen size={13} />
              Browse
            </button>
          </div>

          {/* Project + Service selectors */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              {loadingProjects ? (
                <div className="h-8 bg-bg border border-border rounded-lg flex items-center px-2 gap-2">
                  <Loader2 size={11} className="animate-spin text-text-secondary" />
                  <span className="text-xs text-text-secondary">Loading projects…</span>
                </div>
              ) : (
                <>
                  <select
                    value={selectedProject}
                    onChange={e => {
                      setSelectedProject(e.target.value)
                      const p = projects.find(p => p.id === e.target.value)
                      setSelectedService(p?.services?.[0]?.id ?? '')
                    }}
                    className="w-full appearance-none bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary pr-6"
                  >
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                </>
              )}
            </div>
            <div className="relative flex-1">
              <select
                value={selectedService}
                onChange={e => setSelectedService(e.target.value)}
                className="w-full appearance-none bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary pr-6"
              >
                {(projects.find(p => p.id === selectedProject)?.services ?? []).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            </div>
          </div>

          <GitStatusPanel status={gitStatus} loading={gitLoading} onRefresh={loadGitStatus} />

          {/* Recent commits toggle */}
          {gitStatus?.isRepo && (gitStatus.commits?.length ?? 0) > 0 && (
            <button
              onClick={() => setShowCommitLog(!showCommitLog)}
              className="flex items-center gap-1 mt-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronDown size={11} className={`transition-transform ${showCommitLog ? 'rotate-180' : ''}`} />
              {showCommitLog ? 'Hide' : 'Show'} recent commits
            </button>
          )}
          {showCommitLog && gitStatus?.commits && (
            <div className="mt-2 space-y-1 pl-2 border-l border-border">
              {gitStatus.commits.slice(0, 6).map(c => (
                <div key={c.hash} className="flex items-center gap-2 text-xs">
                  <code className="text-accent font-mono shrink-0">{c.short}</code>
                  <span className="text-text-primary truncate flex-1">{c.message}</span>
                  <span className="text-text-secondary shrink-0">{c.relativeTime}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 shrink-0">
          {([
            { id: 'local', label: 'Deploy Local', icon: Rocket },
            { id: 'commit-deploy', label: 'Commit & Deploy', icon: GitMerge },
            { id: 'push-deploy', label: 'Push & Deploy', icon: Upload },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                mode === id ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Mode-specific controls */}
        <div className="bg-surface border border-border rounded-xl p-4 shrink-0">
          {mode === 'local' && (
            <div className="flex items-center gap-3">
              <button onClick={handleLocalDeploy} className={deployBtnClass(deployStatus)}>
                {deployStatus === 'deploying' ? (
                  <><Square size={15} /> Stop</>
                ) : deployStatus === 'success' ? (
                  <><CheckCircle2 size={15} /> Deployed!</>
                ) : deployStatus === 'error' ? (
                  <><XCircle size={15} /> Failed – Retry</>
                ) : (
                  <><Rocket size={15} /> Deploy (railway up)</>
                )}
              </button>
              <p className="text-xs text-text-secondary">
                Runs <code className="bg-bg px-1 rounded text-text-primary">railway up</code> from the current directory
              </p>
            </div>
          )}

          {mode === 'commit-deploy' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Commit message</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2">
                    <Pencil size={12} className="text-text-secondary shrink-0" />
                    <input
                      type="text"
                      value={commitMsg}
                      onChange={e => { setCommitMsg(e.target.value); setCommitError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleCommitAndDeploy()}
                      placeholder="feat: describe your changes"
                      className="flex-1 bg-transparent text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleCommitAndDeploy}
                    disabled={deployStatus === 'deploying' || !!gitOpStatus}
                    className={deployBtnClass(deployStatus)}
                  >
                    {gitOpStatus ? <><Loader2 size={14} className="animate-spin" /> {gitOpStatus}</> :
                     deployStatus === 'deploying' ? <><Loader2 size={14} className="animate-spin" /> Deploying…</> :
                     <><GitMerge size={14} /> Commit & Deploy</>}
                  </button>
                </div>
                {commitError && <p className="text-xs text-error mt-1">{commitError}</p>}
              </div>
              <p className="text-xs text-text-secondary">
                Stages all changes, commits with the message, then runs <code className="bg-bg px-1 rounded text-text-primary">railway up</code>
              </p>
            </div>
          )}

          {mode === 'push-deploy' && (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePushAndDeploy}
                disabled={deployStatus === 'deploying' || !!gitOpStatus || !gitStatus?.isRepo}
                className={deployBtnClass(deployStatus)}
              >
                {gitOpStatus ? <><Loader2 size={14} className="animate-spin" /> {gitOpStatus}</> :
                 deployStatus === 'deploying' ? <><Loader2 size={14} className="animate-spin" /> Deploying…</> :
                 <><Upload size={14} /> Push & Deploy</>}
              </button>
              <div className="text-xs text-text-secondary space-y-0.5">
                <p>Runs <code className="bg-bg px-1 rounded text-text-primary">git push</code>, then <code className="bg-bg px-1 rounded text-text-primary">railway up</code></p>
                {(gitStatus?.ahead ?? 0) > 0 && (
                  <p className="flex items-center gap-1 text-accent">
                    <ArrowUp size={10} /> {gitStatus!.ahead} commit{gitStatus!.ahead !== 1 ? 's' : ''} ahead of remote
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Terminal output */}
        <div className="flex-1 min-h-0">
          <TerminalComponent ref={terminalRef} className="h-full" />
        </div>
      </div>
    </div>
  )
}

export default Deploy
