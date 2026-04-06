import React, { useState, useEffect, useRef } from 'react'
import {
  Eye, EyeOff, Copy, Check, Search, RefreshCw, Plus, Trash2,
  Download, Upload, GitCompare, Loader2, AlertCircle, ChevronDown,
  X, Pencil, Save, SkipForward, Filter,
} from 'lucide-react'
import { prefetchProjects, getCachedProjects } from '../cache'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  environments: { id: string; name: string }[]
  services: { id: string; name: string }[]
}

interface EnvVar {
  key: string
  value: string
  revealed: boolean
  editing: boolean
  editValue: string
  dirty: boolean
}

type DiffStatus = 'same' | 'different' | 'only-left' | 'only-right'

interface DiffRow {
  key: string
  left?: string
  right?: string
  status: DiffStatus
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseVarJson(json: string): { key: string; value: string }[] {
  try {
    const data = JSON.parse(json)
    // Railway returns { KEY: "value", ... }
    if (typeof data === 'object' && !Array.isArray(data)) {
      return Object.entries(data).map(([key, value]) => ({ key, value: String(value) }))
    }
  } catch { /* fall through */ }
  return []
}

function toEnvFile(vars: { key: string; value: string }[]): string {
  return vars
    .map(({ key, value }) => {
      // Quote values that contain spaces or special chars
      const needsQuote = /[\s"'\\#]/.test(value)
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      return needsQuote ? `${key}="${escaped}"` : `${key}=${value}`
    })
    .join('\n')
}

function parseEnvFile(content: string): { key: string; value: string }[] {
  const result: { key: string; value: string }[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    if (key) result.push({ key, value })
  }
  return result
}

function buildDiff(
  left: { key: string; value: string }[],
  right: { key: string; value: string }[]
): DiffRow[] {
  const lMap = new Map(left.map((v) => [v.key, v.value]))
  const rMap = new Map(right.map((v) => [v.key, v.value]))
  const keys = [...new Set([...lMap.keys(), ...rMap.keys()])].sort()
  return keys.map((key) => {
    const l = lMap.get(key)
    const r = rMap.get(key)
    let status: DiffStatus = 'same'
    if (l === undefined) status = 'only-right'
    else if (r === undefined) status = 'only-left'
    else if (l !== r) status = 'different'
    return { key, left: l, right: r, status }
  })
}

// ── Small components ──────────────────────────────────────────────────────────

function Sel({ value, onChange, children, className = '' }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-surface border border-border rounded-lg pl-3 pr-7 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
      >
        {children}
      </select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
    </div>
  )
}

function MaskedValue({ value, revealed }: { value: string; revealed: boolean }) {
  if (revealed) return <span className="font-mono text-xs text-text-primary break-all">{value}</span>
  return <span className="font-mono text-xs text-text-secondary tracking-widest select-none">{'•'.repeat(Math.min(value.length, 20))}</span>
}

// ── Main ──────────────────────────────────────────────────────────────────────

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

export default function Environment({ currentDirectory }: { currentDirectory: string }) {
  const _cached = getCachedProjects()
  const [projects, setProjects]     = useState<Project[]>(() => _cached ? parseProjects(_cached) : [])
  const [loading, setLoading]       = useState(!_cached)
  const [projectId, setProjectId]   = useState('')
  const [serviceId, setServiceId]   = useState('')
  const [envId, setEnvId]           = useState('')
  const [vars, setVars]             = useState<EnvVar[]>([])
  const [loadingVars, setLoadingVars] = useState(false)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [showDiff, setShowDiff]     = useState(false)
  const [diffEnvId, setDiffEnvId]   = useState('')
  const [diffVars, setDiffVars]     = useState<{ key: string; value: string }[]>([])
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [skipDeploys, setSkipDeploys] = useState(false)
  const [savingKey, setSavingKey]   = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [addingNew, setAddingNew]   = useState(false)
  const [newKey, setNewKey]         = useState('')
  const [newValue, setNewValue]     = useState('')
  const [importing, setImporting]   = useState(false)
  const [importPreview, setImportPreview] = useState<{ key: string; value: string; exists: boolean }[]>([])
  const [showImportPreview, setShowImportPreview] = useState(false)
  const copiedRef = useRef<string | null>(null)
  const [copiedKey, setCopiedKey]   = useState<string | null>(null)

  // Load projects — seed from cache immediately, refresh in background
  useEffect(() => {
    const seedSelectors = (parsed: Project[]) => {
      if (!parsed.length) return
      const first = parsed[0]
      setProjectId(id => id || first.id)
      const prod = first.environments.find(e => e.name === 'production') || first.environments[0]
      if (prod) {
        setEnvId(id => id || prod.id)
        setDiffEnvId(id => id || (first.environments[1]?.id || prod.id))
      }
      setServiceId(id => id || first.services[0]?.id || '')
    }
    if (_cached) seedSelectors(parseProjects(_cached))
    prefetchProjects().then((r) => {
      const parsed = parseProjects(r)
      setProjects(parsed)
      seedSelectors(parsed)
    }).catch(() => setError('Failed to load projects')).finally(() => setLoading(false))
  }, [])

  const selectedProject = projects.find((p) => p.id === projectId)
  const services = selectedProject?.services ?? []
  const envs = selectedProject?.environments ?? []

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Load vars whenever selectors change
  useEffect(() => {
    if (projectId && serviceId && envId) loadVars()
  }, [projectId, serviceId, envId])

  const loadVars = async () => {
    setLoadingVars(true)
    setError('')
    try {
      await window.railway.linkForInspect(projectId, envId)
      const r = await window.railway.varList(projectId, serviceId, envId)
      if (r.code !== 0) { setError(r.stderr || 'Failed to load variables'); setVars([]); return }
      const parsed = parseVarJson(r.stdout)
      setVars(parsed.map((v) => ({ ...v, revealed: false, editing: false, editValue: v.value, dirty: false })))
    } catch (e: any) {
      setError(e.message || 'Failed to load variables')
    } finally {
      setLoadingVars(false)
    }
  }

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    const p = projects.find((proj) => proj.id === id)
    if (p) {
      const prod = p.environments.find((e) => e.name === 'production') || p.environments[0]
      setEnvId(prod?.id ?? '')
      setDiffEnvId(p.environments[1]?.id || prod?.id || '')
      setServiceId(p.services[0]?.id ?? '')
    }
  }

  // Var actions
  const toggleReveal = (key: string) =>
    setVars((v) => v.map((x) => x.key === key ? { ...x, revealed: !x.revealed } : x))

  const revealAll = () => {
    const anyHidden = vars.some((v) => !v.revealed)
    setVars((v) => v.map((x) => ({ ...x, revealed: anyHidden })))
  }

  const startEdit = (key: string) =>
    setVars((v) => v.map((x) => x.key === key ? { ...x, editing: true, editValue: x.value } : x))

  const cancelEdit = (key: string) =>
    setVars((v) => v.map((x) => x.key === key ? { ...x, editing: false, editValue: x.value, dirty: false } : x))

  const updateEditValue = (key: string, val: string) =>
    setVars((v) => v.map((x) => x.key === key ? { ...x, editValue: val, dirty: val !== x.value } : x))

  const saveVar = async (key: string) => {
    const v = vars.find((x) => x.key === key)
    if (!v || !v.dirty) return
    setSavingKey(key)
    try {
      const r = await window.railway.varSet(projectId, serviceId, envId, key, v.editValue, skipDeploys)
      if (r.code !== 0) { showToast(r.stderr || 'Save failed', 'error'); return }
      setVars((prev) => prev.map((x) => x.key === key ? { ...x, value: v.editValue, editing: false, dirty: false } : x))
      showToast(`${key} saved`)
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const deleteVar = async (key: string) => {
    if (!confirm(`Delete variable "${key}"?`)) return
    setDeletingKey(key)
    try {
      const r = await window.railway.varDelete(projectId, serviceId, envId, key)
      if (r.code !== 0) { showToast(r.stderr || 'Delete failed', 'error'); return }
      setVars((v) => v.filter((x) => x.key !== key))
      showToast(`${key} deleted`)
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setDeletingKey(null)
    }
  }

  const addVar = async () => {
    if (!newKey.trim()) return
    setSavingKey('__new__')
    try {
      const r = await window.railway.varSet(projectId, serviceId, envId, newKey.trim(), newValue, skipDeploys)
      if (r.code !== 0) { showToast(r.stderr || 'Failed to add variable', 'error'); return }
      setVars((v) => [...v, { key: newKey.trim(), value: newValue, revealed: false, editing: false, editValue: newValue, dirty: false }])
      setNewKey(''); setNewValue(''); setAddingNew(false)
      showToast(`${newKey.trim()} added`)
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const copyValue = (key: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedKey(key)
    copiedRef.current = key
    setTimeout(() => { if (copiedRef.current === key) setCopiedKey(null) }, 1500)
  }

  const copyAll = () => {
    const text = vars.map((v) => `${v.key}=${v.value}`).join('\n')
    navigator.clipboard.writeText(text)
    showToast('All variables copied')
  }

  // Export
  const exportEnv = async () => {
    const content = toEnvFile(vars.map((v) => ({ key: v.key, value: v.value })))
    const svc = services.find((s) => s.id === serviceId)
    await window.railway.saveEnvFile(content, `.env.${svc?.name || 'railway'}`)
  }

  // Import
  const importEnv = async () => {
    const content = await window.railway.readEnvFile()
    if (!content) return
    const parsed = parseEnvFile(content)
    const existingKeys = new Set(vars.map((v) => v.key))
    setImportPreview(parsed.map((v) => ({ ...v, exists: existingKeys.has(v.key) })))
    setShowImportPreview(true)
  }

  const confirmImport = async () => {
    setImporting(true)
    let ok = 0, fail = 0
    for (const v of importPreview) {
      try {
        const r = await window.railway.varSet(projectId, serviceId, envId, v.key, v.value, skipDeploys)
        if (r.code === 0) ok++; else fail++
      } catch { fail++ }
    }
    setShowImportPreview(false)
    setImporting(false)
    showToast(`Imported ${ok} variable${ok !== 1 ? 's' : ''}${fail ? `, ${fail} failed` : ''}`, fail ? 'error' : 'success')
    await loadVars()
  }

  // Diff
  const loadDiff = async () => {
    if (!diffEnvId || diffEnvId === envId) return
    setLoadingDiff(true)
    try {
      await window.railway.linkForInspect(projectId, diffEnvId)
      const r = await window.railway.varList(projectId, serviceId, diffEnvId)
      setDiffVars(parseVarJson(r.stdout))
    } catch { /* ignore */ } finally {
      setLoadingDiff(false)
    }
  }

  useEffect(() => { if (showDiff && diffEnvId) loadDiff() }, [showDiff, diffEnvId, serviceId])

  const filtered = vars.filter((v) =>
    !search || v.key.toLowerCase().includes(search.toLowerCase()) || v.value.toLowerCase().includes(search.toLowerCase())
  )

  const diffRows = buildDiff(
    vars.map((v) => ({ key: v.key, value: v.value })),
    diffVars
  )

  const currentEnvName = envs.find((e) => e.id === envId)?.name ?? ''
  const diffEnvName    = envs.find((e) => e.id === diffEnvId)?.name ?? ''

  if (loading) return (
    <div className="flex items-center justify-center h-full"><Loader2 size={24} className="text-accent animate-spin" /></div>
  )

  return (
    <div className="flex flex-col h-full bg-bg overflow-hidden">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all
          ${toast.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'}`}>
          {toast.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Import Preview Modal */}
      {showImportPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-text-primary font-semibold">Import Preview</h2>
              <button onClick={() => setShowImportPreview(false)} className="text-text-secondary hover:text-text-primary"><X size={18} /></button>
            </div>
            <p className="text-text-secondary text-xs mb-3">{importPreview.length} variables will be set. Existing values will be overwritten.</p>
            <div className="flex-1 overflow-y-auto space-y-1 mb-4">
              {importPreview.map((v) => (
                <div key={v.key} className="flex items-center gap-3 px-3 py-2 bg-bg rounded-lg">
                  <span className={`text-xs font-mono font-semibold ${v.exists ? 'text-warning' : 'text-success'}`}>{v.key}</span>
                  {v.exists && <span className="text-xs text-warning/70 shrink-0">overwrites existing</span>}
                  <span className="text-xs text-text-secondary/60 font-mono truncate ml-auto">{v.value.slice(0, 30)}{v.value.length > 30 ? '…' : ''}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowImportPreview(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Cancel</button>
              <button onClick={confirmImport} disabled={importing}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-60 rounded-lg text-white text-sm font-medium"
              >
                {importing ? <><Loader2 size={14} className="animate-spin" />Importing…</> : <><Upload size={14} />Confirm Import</>}
              </button>
            </div>
          </div>
        </div>
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

          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-lg cursor-pointer hover:border-accent/40 transition-colors">
              <input type="checkbox" checked={skipDeploys} onChange={(e) => setSkipDeploys(e.target.checked)} className="accent-accent w-3 h-3" />
              <SkipForward size={12} className="text-text-secondary" />
              <span className="text-xs text-text-secondary">Skip deploy</span>
            </label>
            <button onClick={() => { setShowDiff(!showDiff); if (!showDiff) loadDiff() }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${showDiff ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-bg border-border text-text-secondary hover:text-text-primary'}`}
            >
              <GitCompare size={13} />Diff
            </button>
            <button onClick={importEnv} className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-surface border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors">
              <Upload size={13} />Import .env
            </button>
            <button onClick={exportEnv} disabled={!vars.length} className="flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-surface border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors">
              <Download size={13} />Export .env
            </button>
            <button onClick={loadVars} className="p-1.5 bg-bg hover:bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Search + add */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search variables…"
              className="w-full pl-8 pr-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
            />
          </div>
          <span className="text-xs text-text-secondary/60 shrink-0">{filtered.length} / {vars.length} vars</span>
          <button onClick={revealAll} className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors">
            {vars.some((v) => !v.revealed) ? <Eye size={13} /> : <EyeOff size={13} />}
            {vars.some((v) => !v.revealed) ? 'Reveal all' : 'Hide all'}
          </button>
          <button onClick={copyAll} className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors">
            <Copy size={13} />Copy all
          </button>
          <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-lg text-xs text-white font-medium transition-colors">
            <Plus size={13} />Add variable
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg">
          <AlertCircle size={14} className="text-error shrink-0 mt-0.5" />
          <p className="text-error text-xs">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex">

        {/* Main variable table */}
        <div className={`flex flex-col flex-1 overflow-hidden ${showDiff ? 'border-r border-border' : ''}`}>
          {loadingVars ? (
            <div className="flex items-center justify-center flex-1"><Loader2 size={20} className="text-accent animate-spin" /></div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Add new row */}
              {addingNew && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-accent/5">
                  <input autoFocus value={newKey} onChange={(e) => setNewKey(e.target.value)}
                    placeholder="KEY" onKeyDown={(e) => e.key === 'Enter' && addVar()}
                    className="w-48 bg-bg border border-accent/40 rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
                  />
                  <span className="text-text-secondary/40">=</span>
                  <input value={newValue} onChange={(e) => setNewValue(e.target.value)}
                    placeholder="value" onKeyDown={(e) => e.key === 'Enter' && addVar()}
                    className="flex-1 bg-bg border border-accent/40 rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
                  />
                  <button onClick={addVar} disabled={savingKey === '__new__' || !newKey.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg text-xs text-white font-medium"
                  >
                    {savingKey === '__new__' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Add
                  </button>
                  <button onClick={() => { setAddingNew(false); setNewKey(''); setNewValue('') }}
                    className="p-1.5 text-text-secondary hover:text-text-primary"
                  ><X size={14} /></button>
                </div>
              )}

              {/* Table header */}
              <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-surface/50 sticky top-0 z-10">
                <span className="text-xs text-text-secondary font-medium w-48 shrink-0">KEY</span>
                <span className="text-xs text-text-secondary font-medium flex-1">VALUE</span>
                <span className="text-xs text-text-secondary font-medium w-20 text-right">ACTIONS</span>
              </div>

              {filtered.length === 0 && !loadingVars && (
                <div className="flex flex-col items-center justify-center py-16 text-text-secondary/40 gap-2">
                  <Filter size={28} />
                  <p className="text-sm">{search ? 'No variables match your search' : 'No variables found'}</p>
                </div>
              )}

              {filtered.map((v) => (
                <div key={v.key}
                  className="flex items-center gap-4 px-4 py-2.5 border-b border-border/50 hover:bg-white/[0.02] group transition-colors"
                >
                  {/* Key */}
                  <span className="text-xs font-mono font-semibold text-accent w-48 shrink-0 truncate" title={v.key}>{v.key}</span>

                  {/* Value */}
                  <div className="flex-1 min-w-0">
                    {v.editing ? (
                      <input value={v.editValue}
                        onChange={(e) => updateEditValue(v.key, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveVar(v.key); if (e.key === 'Escape') cancelEdit(v.key) }}
                        autoFocus
                        className="w-full bg-bg border border-accent/40 rounded-lg px-3 py-1 text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
                      />
                    ) : (
                      <MaskedValue value={v.value} revealed={v.revealed} />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 w-20 justify-end shrink-0">
                    {v.editing ? (
                      <>
                        <button onClick={() => saveVar(v.key)} disabled={!v.dirty || savingKey === v.key}
                          className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-colors disabled:opacity-40"
                          title="Save (Enter)"
                        >
                          {savingKey === v.key ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        </button>
                        <button onClick={() => cancelEdit(v.key)} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-lg transition-colors" title="Cancel (Esc)">
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => toggleReveal(v.key)} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-lg transition-colors" title={v.revealed ? 'Hide' : 'Reveal'}>
                          {v.revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button onClick={() => copyValue(v.key, v.value)} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-lg transition-colors" title="Copy value">
                          {copiedKey === v.key ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                        </button>
                        <button onClick={() => startEdit(v.key)} className="p-1.5 text-text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-colors" title="Edit">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteVar(v.key)} disabled={deletingKey === v.key} className="p-1.5 text-text-secondary hover:text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-40" title="Delete">
                          {deletingKey === v.key ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Diff panel */}
        {showDiff && (
          <div className="w-96 flex flex-col overflow-hidden shrink-0">
            {/* Diff toolbar */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-surface/50">
              <GitCompare size={13} className="text-accent" />
              <span className="text-xs font-medium text-text-primary">{currentEnvName}</span>
              <span className="text-xs text-text-secondary">vs</span>
              <Sel value={diffEnvId} onChange={(id) => { setDiffEnvId(id); }} className="flex-1">
                {envs.filter((e) => e.id !== envId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Sel>
              {loadingDiff && <Loader2 size={13} className="text-accent animate-spin" />}
            </div>

            {/* Diff legend */}
            <div className="flex items-center gap-4 px-3 py-1.5 border-b border-border/50 bg-surface/30">
              {[
                { cls: 'bg-warning/20 text-warning', label: 'Different' },
                { cls: 'bg-success/20 text-success', label: `Only in ${currentEnvName}` },
                { cls: 'bg-error/20 text-error', label: `Only in ${diffEnvName}` },
              ].map(({ cls, label }) => (
                <span key={label} className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
              ))}
            </div>

            {/* Diff rows */}
            <div className="flex-1 overflow-y-auto">
              {diffRows
                .filter((r) => r.status !== 'same' || search ? r.key.toLowerCase().includes(search.toLowerCase()) : true)
                .map((row) => {
                  const bg =
                    row.status === 'different' ? 'bg-warning/5 border-warning/20' :
                    row.status === 'only-left'  ? 'bg-success/5 border-success/20' :
                    row.status === 'only-right' ? 'bg-error/5 border-error/20' :
                    'border-transparent'
                  return (
                    <div key={row.key} className={`px-3 py-2.5 border-b border-border/30 ${bg}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono font-semibold text-accent">{row.key}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium
                          ${row.status === 'different' ? 'text-warning' :
                            row.status === 'only-left' ? 'text-success' :
                            row.status === 'only-right' ? 'text-error' : 'text-text-secondary/40'}`}>
                          {row.status === 'different' ? '≠' : row.status === 'only-left' ? `+${currentEnvName}` : row.status === 'only-right' ? `+${diffEnvName}` : '='}
                        </span>
                      </div>
                      {row.status !== 'only-right' && row.left !== undefined && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-success/60 text-xs w-3 shrink-0">{currentEnvName.slice(0, 3)}</span>
                          <span className="text-xs font-mono text-text-secondary truncate">{'•'.repeat(Math.min(row.left.length, 24))}</span>
                        </div>
                      )}
                      {row.status !== 'only-left' && row.right !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-error/60 text-xs w-3 shrink-0">{diffEnvName.slice(0, 3)}</span>
                          <span className="text-xs font-mono text-text-secondary truncate">{'•'.repeat(Math.min(row.right.length, 24))}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>

            {/* Diff summary */}
            <div className="border-t border-border px-3 py-2 bg-surface/30 flex gap-3 text-xs text-text-secondary shrink-0">
              <span className="text-warning">{diffRows.filter((r) => r.status === 'different').length} different</span>
              <span className="text-success">{diffRows.filter((r) => r.status === 'only-left').length} only in {currentEnvName}</span>
              <span className="text-error">{diffRows.filter((r) => r.status === 'only-right').length} only in {diffEnvName}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
