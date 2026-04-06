import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play, Square, Trash2, Download, Search, ChevronDown,
  Loader2, AlertCircle, Globe, Hammer, Zap, Filter, Clock,
  RefreshCw, Wifi, WifiOff,
} from 'lucide-react'
import { prefetchProjects, getCachedProjects } from '../cache'

// ── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  environments: { id: string; name: string }[]
  services: { id: string; name: string }[]
}

type LogType = 'deploy' | 'build' | 'http'

interface LogLine {
  id: number
  raw: string
  parsed?: HttpLog
  ts?: string
  level?: 'error' | 'warn' | 'info' | 'debug'
}

interface HttpLog {
  method: string
  path: string
  status: number
  duration: number
  srcIp?: string
}

const SINCE_OPTIONS = [
  { label: 'Last 15 min', value: '15m' },
  { label: 'Last 30 min', value: '30m' },
  { label: 'Last 1 hr',   value: '1h'  },
  { label: 'Last 6 hr',   value: '6h'  },
  { label: 'Last 24 hr',  value: '1d'  },
  { label: 'Last 7 days', value: '7d'  },
]

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

let lineIdCounter = 0

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripAnsi(s: string) {
  return s.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

function detectLevel(line: string): LogLine['level'] {
  const l = line.toLowerCase()
  if (l.includes('\x1b[31m') || l.includes('error') || l.includes('err ') || l.includes('fatal')) return 'error'
  if (l.includes('\x1b[33m') || l.includes('warn')) return 'warn'
  if (l.includes('debug')) return 'debug'
  return 'info'
}

function tryParseHttpJson(raw: string): HttpLog | undefined {
  try {
    const d = JSON.parse(raw)
    if (d.method && d.path && d.httpStatus !== undefined) {
      return { method: d.method, path: d.path, status: d.httpStatus, duration: d.totalDuration ?? d.responseTime ?? 0, srcIp: d.srcIp }
    }
  } catch { /* not json */ }
}

function parseChunk(chunk: string, logType: LogType, useJson: boolean): LogLine[] {
  return chunk
    .split('\n')
    .filter((l) => l.trim())
    .map((raw) => {
      const line: LogLine = { id: ++lineIdCounter, raw }
      if (logType === 'http' && useJson) {
        line.parsed = tryParseHttpJson(stripAnsi(raw))
      }
      line.level = detectLevel(raw)
      // extract timestamp if present
      const tsMatch = stripAnsi(raw).match(/^(\d{4}-\d{2}-\d{2}T[\d:.Z+-]+)/)
      if (tsMatch) line.ts = tsMatch[1]
      return line
    })
}

function statusColor(code: number) {
  if (code >= 500) return 'text-error bg-error/15'
  if (code >= 400) return 'text-warning bg-warning/15'
  if (code >= 300) return 'text-blue-400 bg-blue-400/15'
  return 'text-success bg-success/15'
}

function methodColor(m: string) {
  const map: Record<string, string> = {
    GET: 'text-success', POST: 'text-accent', PUT: 'text-warning',
    PATCH: 'text-orange-400', DELETE: 'text-error', HEAD: 'text-blue-400', OPTIONS: 'text-text-secondary',
  }
  return map[m] ?? 'text-text-secondary'
}

function levelColor(l?: LogLine['level']) {
  if (l === 'error') return 'text-error'
  if (l === 'warn')  return 'text-warning'
  if (l === 'debug') return 'text-text-secondary/60'
  return 'text-green-400'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Select({ value, onChange, children, className = '' }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-surface border border-border rounded-lg pl-3 pr-7 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
      >
        {children}
      </select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
    </div>
  )
}

function HttpLogRow({ line }: { line: LogLine }) {
  const p = line.parsed
  const plain = stripAnsi(line.raw)
  if (!p) return (
    <div className="font-mono text-xs text-text-secondary/70 px-4 py-0.5 hover:bg-white/[0.02]">{plain}</div>
  )
  return (
    <div className="flex items-center gap-3 px-4 py-1 hover:bg-white/[0.03] font-mono text-xs border-b border-border/30">
      <span className={`w-14 shrink-0 font-bold ${methodColor(p.method)}`}>{p.method}</span>
      <span className={`px-1.5 py-0.5 rounded text-xs font-bold shrink-0 ${statusColor(p.status)}`}>{p.status}</span>
      <span className="text-text-primary flex-1 truncate">{p.path}</span>
      <span className="text-text-secondary/60 shrink-0">{p.duration}ms</span>
      {p.srcIp && <span className="text-text-secondary/40 shrink-0 text-xs">{p.srcIp}</span>}
    </div>
  )
}

function DeployLogRow({ line }: { line: LogLine }) {
  const plain = stripAnsi(line.raw)
  const ts = line.ts ? line.ts.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : null
  const msg = ts ? plain.replace(line.ts!, '').trim() : plain
  return (
    <div className="flex items-start gap-3 px-4 py-0.5 hover:bg-white/[0.02] group">
      {ts && <span className="text-text-secondary/40 text-xs font-mono shrink-0 mt-0.5 tabular-nums">{ts}</span>}
      <span className={`text-xs font-mono whitespace-pre-wrap break-all ${levelColor(line.level)}`}>{msg || plain}</span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function parseProjects(raw: any[]): Project[] {
  return raw.map((p: any) => ({
    id: p.id,
    name: p.name,
    environments: (p.environments?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name })),
    services: (p.services?.edges || []).map((e: any) => ({ id: e.node.id, name: e.node.name })),
  }))
}

function seedSelectors(parsed: Project[], setProjectId: (v: string) => void, setEnvId: (v: string) => void, setServiceId: (v: string) => void) {
  if (!parsed.length) return
  const first = parsed[0]
  setProjectId(first.id)
  const prodEnv = first.environments.find(e => e.name === 'production') || first.environments[0]
  if (prodEnv) setEnvId(prodEnv.id)
  if (first.services.length) setServiceId(first.services[0].id)
}

export default function Logs() {
  const _cached = getCachedProjects()
  const _cachedProjects = _cached ? (() => { try { return parseProjects(JSON.parse(_cached.stdout)) } catch { return [] } })() : []
  const [projects, setProjects]         = useState<Project[]>(_cachedProjects)
  const [loadingProjects, setLoadingProjects] = useState(!_cached)
  const [projectId, setProjectId]       = useState('')
  const [serviceId, setServiceId]       = useState('')
  const [envId, setEnvId]               = useState('')
  const [logType, setLogType]           = useState<LogType>('deploy')
  const [streaming, setStreaming]       = useState(false)
  const [live, setLive]                 = useState(true)
  const [since, setSince]               = useState('1h')
  const [lines, setLines]               = useState(200)
  const [filter, setFilter]             = useState('')
  const [httpMethod, setHttpMethod]     = useState('')
  const [httpStatus, setHttpStatus]     = useState('')
  const [httpPath, setHttpPath]         = useState('')
  const [logLines, setLogLines]         = useState<LogLine[]>([])
  const [autoScroll, setAutoScroll]     = useState(true)
  const [error, setError]               = useState('')
  const cleanupRef  = useRef<(() => void) | null>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Seed selectors from cache immediately, then stay subscribed for fresh data
  useEffect(() => {
    if (_cachedProjects.length) seedSelectors(_cachedProjects, setProjectId, setEnvId, setServiceId)

    prefetchProjects().then((r) => {
      try {
        const parsed = parseProjects(JSON.parse(r.stdout))
        setProjects(parsed)
        if (!_cachedProjects.length) seedSelectors(parsed, setProjectId, setEnvId, setServiceId)
      } catch { setError('Failed to parse project list') }
    }).catch(() => setError('Failed to load projects')).finally(() => setLoadingProjects(false))

    return () => { cleanupRef.current?.() }
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logLines, autoScroll])

  const selectedProject = projects.find((p) => p.id === projectId)
  const services = selectedProject?.services ?? []
  const envs = selectedProject?.environments ?? []

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    const p = projects.find((proj) => proj.id === id)
    if (p) {
      const prodEnv = p.environments.find((e) => e.name === 'production') || p.environments[0]
      setEnvId(prodEnv?.id ?? '')
      setServiceId(p.services[0]?.id ?? '')
    }
  }

  const startStream = useCallback(async () => {
    if (!projectId || !serviceId || !envId) return
    cleanupRef.current?.()
    setLogLines([])
    setError('')
    setStreaming(true)

    // Ensure project is linked in our temp dir
    await window.railway.linkForInspect(projectId, envId).catch(() => {})

    const opts = {
      logType,
      filter:  filter.trim() || undefined,
      since:   live ? undefined : since,
      lines:   live ? undefined : lines,
      method:  logType === 'http' && httpMethod ? httpMethod : undefined,
      status:  logType === 'http' && httpStatus ? httpStatus : undefined,
      path:    logType === 'http' && httpPath.trim() ? httpPath.trim() : undefined,
      latest:  true,
      json:    logType === 'http',
    }

    const cleanup = window.railway.streamLogsAdvanced(
      projectId, serviceId, envId, opts,
      (chunk) => setLogLines((prev) => [...prev, ...parseChunk(chunk, logType, !!opts.json)]),
      () => setStreaming(false)
    )
    cleanupRef.current = () => { cleanup(); setStreaming(false) }
  }, [projectId, serviceId, envId, logType, filter, live, since, lines, httpMethod, httpStatus, httpPath])

  const stopStream = () => { cleanupRef.current?.(); setStreaming(false) }

  const clearLogs = () => { stopStream(); setLogLines([]) }

  const exportLogs = () => {
    const text = logLines.map((l) => stripAnsi(l.raw)).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `railway-logs-${serviceId}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  const logTypeTab = (type: LogType, Icon: React.FC<{size: number; className?: string}>, label: string) => (
    <button
      onClick={() => { cleanupRef.current?.(); setStreaming(false); setLogType(type); setLogLines([]) }}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
        logType === type
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  )

  if (loadingProjects) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="text-accent animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-bg overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="shrink-0 border-b border-border bg-surface px-4 py-3 space-y-3">
        {/* Row 1: selectors + stream control */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={projectId} onChange={handleProjectChange} className="w-44">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={serviceId} onChange={setServiceId} className="w-44">
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={envId} onChange={setEnvId} className="w-36">
            {envs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>

          <div className="flex items-center gap-1 ml-auto">
            {/* Live / Historical toggle */}
            <button
              onClick={() => setLive(!live)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                live ? 'bg-success/10 border-success/30 text-success' : 'bg-surface border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {live ? <Wifi size={13} /> : <WifiOff size={13} />}
              {live ? 'Live' : 'Historical'}
            </button>

            {streaming ? (
              <button onClick={stopStream}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 hover:bg-error/20 border border-error/30 rounded-lg text-xs text-error font-medium transition-all"
              >
                <Square size={13} />Stop
              </button>
            ) : (
              <button onClick={startStream} disabled={!projectId || !serviceId || !envId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-lg text-xs text-white font-medium transition-all"
              >
                <Play size={13} />Stream
              </button>
            )}

            <button onClick={clearLogs} title="Clear" className="p-1.5 bg-surface hover:bg-border border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors">
              <Trash2 size={14} />
            </button>
            <button onClick={exportLogs} disabled={logLines.length === 0} title="Export" className="p-1.5 bg-surface hover:bg-border border border-border rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors">
              <Download size={14} />
            </button>
          </div>
        </div>

        {/* Row 2: historical options */}
        {!live && (
          <div className="flex items-center gap-2 flex-wrap">
            <Clock size={13} className="text-text-secondary" />
            <Select value={since} onChange={setSince} className="w-36">
              {SINCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <label className="text-xs text-text-secondary ml-2">Lines</label>
            <input
              type="number" value={lines} onChange={(e) => setLines(Number(e.target.value))}
              min={10} max={1000}
              className="w-20 bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {/* Row 3: filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              value={filter} onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startStream()}
              placeholder={logType === 'http' ? '@httpStatus:>=400, @path:/api, @level:error…' : '@level:error, "search term"…'}
              className="w-full pl-8 pr-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
            />
          </div>

          {/* HTTP-specific filters */}
          {logType === 'http' && (
            <>
              <Select value={httpMethod} onChange={setHttpMethod} className="w-28">
                <option value="">Any method</option>
                {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
              <input
                value={httpStatus} onChange={(e) => setHttpStatus(e.target.value)}
                placeholder="Status (e.g. >=400)"
                className="w-36 px-2.5 py-1.5 bg-bg border border-border rounded-lg text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
              />
              <input
                value={httpPath} onChange={(e) => setHttpPath(e.target.value)}
                placeholder="Path (e.g. /api)"
                className="w-32 px-2.5 py-1.5 bg-bg border border-border rounded-lg text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Log type tabs ── */}
      <div className="flex items-center border-b border-border bg-surface shrink-0 px-4">
        {logTypeTab('deploy', Zap, 'Deploy')}
        {logTypeTab('build', Hammer, 'Build')}
        {logTypeTab('http', Globe, 'HTTP')}
        <div className="ml-auto flex items-center gap-2 py-2">
          {streaming && (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              Streaming
            </span>
          )}
          <span className="text-xs text-text-secondary/60">{logLines.length} lines</span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
            className={`p-1 rounded text-xs transition-colors ${autoScroll ? 'text-accent' : 'text-text-secondary/40'}`}
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── Log output ── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-[#0d0f14] font-mono"
      >
        {error && (
          <div className="flex items-center gap-2 p-4 text-error text-sm">
            <AlertCircle size={16} />{error}
          </div>
        )}

        {!streaming && logLines.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary/40 gap-3">
            <Filter size={32} />
            <p className="text-sm">Select a service and click <strong className="text-text-secondary/60">Stream</strong> to start</p>
            <p className="text-xs">Switch between Deploy, Build, and HTTP log types above</p>
          </div>
        )}

        {logType === 'http'
          ? logLines.map((line) => <HttpLogRow key={line.id} line={line} />)
          : logLines.map((line) => <DeployLogRow key={line.id} line={line} />)
        }

        {streaming && logLines.length === 0 && (
          <div className="flex items-center gap-2 p-4 text-text-secondary/60 text-xs">
            <Loader2 size={13} className="animate-spin" />
            Waiting for logs…
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
