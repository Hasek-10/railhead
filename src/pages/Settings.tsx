import React, { useState, useEffect } from 'react'
import {
  Settings as SettingsIcon,
  Globe,
  Terminal,
  Play,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Info,
  Bell,
  BellOff,
  BellRing,
} from 'lucide-react'

interface SettingsProps {
  currentDirectory: string
}

interface NotifSettings {
  enabled: boolean
  pollIntervalSeconds: number
  onDeploySuccess: boolean
  onDeployFailure: boolean
  onServiceCrash: boolean
  onNewDeployment: boolean
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-accent' : 'bg-border'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function Settings({ currentDirectory }: SettingsProps): React.JSX.Element {
  const [openStatus, setOpenStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [openError, setOpenError] = useState('')
  const [runCmd, setRunCmd] = useState('')
  const [runOutput, setRunOutput] = useState('')
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [runExitCode, setRunExitCode] = useState<number | null>(null)
  const cleanupRef = React.useRef<(() => void) | null>(null)

  const [notifSettings, setNotifSettings] = useState<NotifSettings | null>(null)
  const [notifLoading, setNotifLoading] = useState(true)
  const [notifSaving, setNotifSaving] = useState(false)
  const [testSent, setTestSent] = useState(false)

  useEffect(() => {
    loadNotifSettings()
    return () => { cleanupRef.current?.() }
  }, [])

  const loadNotifSettings = async () => {
    try {
      const s = await window.railway.getNotificationSettings()
      setNotifSettings(s)
    } catch { /* ignore */ }
    setNotifLoading(false)
  }

  const saveNotif = async (updated: NotifSettings) => {
    setNotifSettings(updated)
    setNotifSaving(true)
    try {
      await window.railway.saveNotificationSettings(updated)
    } catch { /* ignore */ }
    setNotifSaving(false)
  }

  const handleOpen = async () => {
    setOpenStatus('loading')
    setOpenError('')
    try {
      await window.railway.open(currentDirectory)
      setOpenStatus('success')
      setTimeout(() => setOpenStatus('idle'), 2000)
    } catch (err: unknown) {
      setOpenStatus('error')
      setOpenError(err instanceof Error ? err.message : 'Failed to open')
    }
  }

  const handleRun = () => {
    if (!runCmd.trim()) return
    if (runStatus === 'running') {
      cleanupRef.current?.()
      cleanupRef.current = null
      setRunStatus('idle')
      setRunOutput(p => p + '\n[Command cancelled]')
      return
    }
    setRunStatus('running')
    setRunOutput('')
    setRunExitCode(null)
    const cleanup = window.railway.run(
      runCmd.trim(),
      (chunk) => setRunOutput(p => p + chunk),
      (code) => {
        cleanupRef.current = null
        setRunExitCode(code)
        setRunStatus(code === 0 ? 'success' : 'error')
      },
      currentDirectory
    )
    cleanupRef.current = cleanup
  }

  const handleTestNotif = async () => {
    await window.railway.testNotification()
    setTestSent(true)
    setTimeout(() => setTestSent(false), 2000)
  }

  return (
    <div className="h-full overflow-y-auto bg-bg p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary text-sm mt-0.5">Configure notifications and project utilities</p>
      </div>

      {/* ── Notification Settings ── */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-accent" />
            <h2 className="text-text-primary font-semibold text-sm">Desktop Notifications</h2>
          </div>
          {notifSettings && (
            <div className="flex items-center gap-2">
              {notifSaving && <Loader2 size={12} className="animate-spin text-text-secondary" />}
              <Toggle
                checked={notifSettings.enabled}
                onChange={v => saveNotif({ ...notifSettings, enabled: v })}
              />
            </div>
          )}
        </div>

        {notifLoading ? (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        ) : notifSettings ? (
          <div className={`space-y-4 ${!notifSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <p className="text-text-secondary text-xs">
              Railhead polls your services in the background and sends desktop notifications when deployments succeed, fail, or services crash.
            </p>

            {/* Poll interval */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-text-secondary">Poll interval</label>
                <span className="text-xs font-mono text-accent">{notifSettings.pollIntervalSeconds}s</span>
              </div>
              <input
                type="range"
                min={30}
                max={300}
                step={30}
                value={notifSettings.pollIntervalSeconds}
                onChange={e => saveNotif({ ...notifSettings, pollIntervalSeconds: parseInt(e.target.value) })}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-text-secondary mt-0.5">
                <span>30s</span><span>5 min</span>
              </div>
            </div>

            {/* Event toggles */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">Notify on</p>
              {([
                { key: 'onDeploySuccess' as const, label: 'Deployment complete', desc: 'When a service goes from deploying → active' },
                { key: 'onDeployFailure' as const, label: 'Deployment failed', desc: 'When a deployment fails' },
                { key: 'onServiceCrash' as const, label: 'Service crashed', desc: 'When a running service crashes' },
                { key: 'onNewDeployment' as const, label: 'New deployment started', desc: 'When a new deployment begins (noisy)' },
              ]).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <div>
                    <p className="text-sm text-text-primary">{label}</p>
                    <p className="text-xs text-text-secondary">{desc}</p>
                  </div>
                  <Toggle
                    checked={notifSettings[key]}
                    onChange={v => saveNotif({ ...notifSettings, [key]: v })}
                  />
                </div>
              ))}
            </div>

            {/* Test button */}
            <button
              onClick={handleTestNotif}
              className="flex items-center gap-2 px-3 py-2 bg-bg hover:bg-border border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {testSent ? (
                <><CheckCircle2 size={13} className="text-success" /> Notification sent!</>
              ) : (
                <><BellRing size={13} /> Send test notification</>
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <BellOff size={13} />
            Notifications unavailable
          </div>
        )}
      </div>

      {/* Open in browser */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-accent" />
          <h2 className="text-text-primary font-semibold text-sm">Open Project</h2>
        </div>
        <p className="text-text-secondary text-sm mb-4">
          Opens the current Railway project in your browser using{' '}
          <code className="bg-bg px-1 py-0.5 rounded text-xs font-mono text-text-primary">railway open</code>.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpen}
            disabled={openStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-60 rounded-lg text-white text-sm font-medium transition-colors"
          >
            {openStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            Open in Browser
          </button>
          {openStatus === 'success' && (
            <div className="flex items-center gap-1.5 text-success text-sm"><CheckCircle2 size={14} /> Opened!</div>
          )}
          {openStatus === 'error' && (
            <div className="flex items-center gap-1.5 text-error text-sm"><AlertCircle size={14} />{openError}</div>
          )}
        </div>
      </div>

      {/* Railway Run */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Play size={14} className="text-accent" />
          <h2 className="text-text-primary font-semibold text-sm">Run Command</h2>
        </div>
        <p className="text-text-secondary text-sm mb-4">
          Run a command in your Railway environment using{' '}
          <code className="bg-bg px-1 py-0.5 rounded text-xs font-mono text-text-primary">railway run &lt;cmd&gt;</code>.
        </p>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2">
            <span className="text-text-secondary text-xs font-mono shrink-0">$</span>
            <input
              type="text"
              value={runCmd}
              onChange={e => setRunCmd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRun()}
              placeholder="node index.js"
              className="flex-1 bg-transparent text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={!runCmd.trim() && runStatus !== 'running'}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-60 ${
              runStatus === 'running' ? 'bg-warning hover:bg-warning/90' : 'bg-accent hover:bg-accent/80'
            }`}
          >
            {runStatus === 'running' ? <><Loader2 size={14} className="animate-spin" />Stop</> : <><Play size={14} />Run</>}
          </button>
        </div>
        {runOutput && (
          <div className="bg-bg rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
              <span className="text-xs font-mono text-text-secondary">output</span>
              <div className="flex items-center gap-1.5">
                {runStatus === 'running' && <Loader2 size={11} className="text-accent animate-spin" />}
                {runStatus === 'success' && <CheckCircle2 size={11} className="text-success" />}
                {runStatus === 'error' && <AlertCircle size={11} className="text-error" />}
                {runExitCode !== null && (
                  <span className={`text-xs font-mono ${runExitCode === 0 ? 'text-success' : 'text-error'}`}>
                    exit {runExitCode}
                  </span>
                )}
              </div>
            </div>
            <pre className="p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap max-h-48 overflow-auto">
              {runOutput}
            </pre>
          </div>
        )}
      </div>

      {/* Working directory */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen size={14} className="text-accent" />
          <h2 className="text-text-primary font-semibold text-sm">Working Directory</h2>
        </div>
        <div className="flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2">
          <FolderOpen size={13} className="text-text-secondary shrink-0" />
          <span className="font-mono text-sm text-text-primary">{currentDirectory || '~'}</span>
        </div>
        <p className="text-text-secondary text-xs mt-2">Change from the sidebar or Projects page.</p>
      </div>

      {/* About */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-accent" />
          <h2 className="text-text-primary font-semibold text-sm">About</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Railhead Version</span>
            <span className="text-text-primary font-mono text-xs">1.0.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">CLI Command</span>
            <code className="bg-bg px-2 py-0.5 rounded text-xs font-mono text-text-primary border border-border">npx @railway/cli</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Platform</span>
            <span className="text-text-primary text-xs">Linux (KDE Plasma)</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
