import { Notification, app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface NotificationSettings {
  enabled: boolean
  pollIntervalSeconds: number
  onDeploySuccess: boolean
  onDeployFailure: boolean
  onServiceCrash: boolean
  onNewDeployment: boolean
}

interface ServiceSnapshot {
  status: string
  latestDeploymentId?: string
  projectName: string
  serviceName: string
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  pollIntervalSeconds: 60,
  onDeploySuccess: true,
  onDeployFailure: true,
  onServiceCrash: true,
  onNewDeployment: false,
}

let timer: ReturnType<typeof setInterval> | null = null
const lastSnapshots = new Map<string, ServiceSnapshot>()
let loadTokenFn: (() => string | null) | null = null
let updateTrayFn: ((s: 'healthy' | 'warning' | 'error' | 'default') => void) | null = null

export function initNotifications(
  loadToken: () => string | null,
  updateTray: (s: 'healthy' | 'warning' | 'error' | 'default') => void
) {
  loadTokenFn = loadToken
  updateTrayFn = updateTray
}

function settingsPath() {
  return join(app.getPath('userData'), 'notification-settings.json')
}

export function loadSettings(): NotificationSettings {
  try {
    if (existsSync(settingsPath())) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(settingsPath(), 'utf-8')) }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
}

async function getAuthToken(): Promise<string | null> {
  const saved = loadTokenFn?.()
  try {
    const { homedir } = require('os')
    const cfg = JSON.parse(readFileSync(join(homedir(), '.railway', 'config.json'), 'utf-8'))
    return cfg?.user?.token ?? saved ?? null
  } catch {
    return saved ?? null
  }
}

async function graphql(query: string): Promise<any> {
  const token = await getAuthToken()
  if (!token) return null
  try {
    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query }),
    })
    const data = await res.json() as any
    return data.errors ? null : data.data
  } catch { return null }
}

export function sendNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

async function poll() {
  const settings = loadSettings()
  if (!settings.enabled) return

  const data = await graphql(`{
    me {
      projects(first: 15) {
        edges {
          node {
            id
            name
            serviceInstances(first: 30) {
              edges {
                node {
                  serviceId
                  serviceName
                  status
                  latestDeploymentId
                  environmentId
                }
              }
            }
          }
        }
      }
    }
  }`)

  if (!data?.me?.projects?.edges) return

  const newSnapshots = new Map<string, ServiceSnapshot>()

  for (const { node: proj } of data.me.projects.edges) {
    for (const { node: si } of (proj.serviceInstances?.edges ?? [])) {
      const key = `${proj.id}:${si.serviceId}:${si.environmentId}`
      newSnapshots.set(key, {
        projectName: proj.name,
        serviceName: si.serviceName ?? si.serviceId,
        status: si.status ?? 'UNKNOWN',
        latestDeploymentId: si.latestDeploymentId,
      })
    }
  }

  // Compare and fire notifications
  if (lastSnapshots.size > 0) {
    for (const [key, snap] of newSnapshots) {
      const prev = lastSnapshots.get(key)
      if (!prev || prev.status === snap.status) continue

      if (settings.onDeploySuccess && snap.status === 'ACTIVE' &&
          ['DEPLOYING', 'BUILDING', 'INITIALIZING'].includes(prev.status)) {
        sendNotification('✅ Deployment Complete',
          `${snap.serviceName} in ${snap.projectName} is now active`)
      }
      if (settings.onDeployFailure && snap.status === 'FAILED' && prev.status !== 'FAILED') {
        sendNotification('❌ Deployment Failed',
          `${snap.serviceName} in ${snap.projectName} failed`)
      }
      if (settings.onServiceCrash && snap.status === 'CRASHED' && prev.status !== 'CRASHED') {
        sendNotification('💥 Service Crashed',
          `${snap.serviceName} in ${snap.projectName} has crashed`)
      }
    }

    if (settings.onNewDeployment) {
      for (const [key, snap] of newSnapshots) {
        const prev = lastSnapshots.get(key)
        if (prev?.latestDeploymentId && snap.latestDeploymentId &&
            prev.latestDeploymentId !== snap.latestDeploymentId) {
          sendNotification('🚀 New Deployment',
            `${snap.serviceName} in ${snap.projectName} is deploying`)
        }
      }
    }
  }

  for (const [k, v] of newSnapshots) lastSnapshots.set(k, v)

  // Update tray icon
  const vals = [...newSnapshots.values()]
  const hasCrash = vals.some(s => ['CRASHED', 'FAILED'].includes(s.status))
  const hasDeploying = vals.some(s => ['DEPLOYING', 'BUILDING'].includes(s.status))
  updateTrayFn?.(hasCrash ? 'error' : hasDeploying ? 'warning' : 'healthy')
}

export function startPolling() {
  const settings = loadSettings()
  stopPolling()
  if (!settings.enabled) return
  setTimeout(poll, 8_000)
  timer = setInterval(poll, Math.max(settings.pollIntervalSeconds, 30) * 1_000)
}

export function stopPolling() {
  if (timer) { clearInterval(timer); timer = null }
}
