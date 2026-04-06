import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, Notification } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, accessSync, constants, readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { runCommand, streamCommand, checkLogin, getEnv } from './railway'
import { handleLogin, handleLogout, loadToken } from './auth'
import {
  initNotifications, startPolling, stopPolling, poll,
  loadSettings, saveNotificationSettings, sendNotification,
} from './notifications'
import * as os from 'os'
import { spawn as spawnChild } from 'child_process'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let fastPollTimer: ReturnType<typeof setInterval> | null = null
let successRevertTimer: ReturnType<typeof setTimeout> | null = null
const streamCleanups = new Map<string, () => void>()
const ptyMap = new Map<string, any>()

// Tray icons as pre-rendered 32x32 PNG files (Railhead I-beam logo, color variants)
const TRAY_ICON_B64 = {
  default: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAqUExURQAAABoaLhwbMiQdQiUeREwqj2821HE213478H067nY44isfT2UzwRkaKxtK+S8AAAABdFJOUwBA5thmAAAAAWJLR0QAiAUdSAAAAAlwSFlzAAABIAAAASAAqP9mJQAAAAd0SU1FB+oEBg4fM9P0KdoAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDQtMDZUMDI6MTk6MjUrMDA6MDCJTjHvAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA0LTA2VDAyOjE5OjI1KzAwOjAw+BOJUwAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wNC0wNlQxNDozMTo1MSswMDowMCfdQhgAAACQSURBVDjL5ZNJEsMgDAQlBiPw8v/vpqx4E9goPqevdMGghYiIHyGFuW8w9w122IWAaECwQhiSGNIQjICUiyEnGCFKqZD47oYtw7iejXcZ9BeY5lWYJ7S/UBZoEsFyU4dL1D3e3wqdQn3H5Vrqo9hkxuVs1tEuFSC5NGwN/01oJrJ+opnpOmQPX3BXz19eZ/0/X/kMMVb8i/IAAAAASUVORK5CYII=',
  healthy: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAqUExURQAAABoaLhoeLxssMxsuNB5xRyGvWCGyWSLIXyLGXiK7Wxs3NiCdUxoXLWr5394AAAABdFJOUwBA5thmAAAAAWJLR0QAiAUdSAAAAAlwSFlzAAABIAAAASAAqP9mJQAAAAd0SU1FB+oEBg4fM9P0KdoAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDQtMDZUMDI6MTk6MjUrMDA6MDCJTjHvAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA0LTA2VDAyOjE5OjI1KzAwOjAw+BOJUwAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wNC0wNlQxNDozMTo1MSswMDowMCfdQhgAAACNSURBVDjL5ZNJEoAgDAQTwqbC/79rgaIEkOjZvtIFQxYAAHwEMohzA3FuoEARFGkGKS4oYx3DGsUEsn5heEtM0G5pcPrbDWeGNZ2towz5F7SFJISN+l9kIuUkjuKgDlXUEu+3wqRQx7jUpb6KDWxc7mZd7YJhs6uGvxO6iWyf6Ga6DTlDFsTVk5dXWP8dXdQML3Q4dCoAAAAASUVORK5CYII=',
  warning: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAqUExURQAAABoaLh8dLTEoKopdHNmNENyPD/mgCvefC9uPD+iWDT8wKMJ/ExcYLxQFaWUAAAABdFJOUwBA5thmAAAAAWJLR0QAiAUdSAAAAAlwSFlzAAABIAAAASAAqP9mJQAAAAd0SU1FB+oEBg4fM9P0KdoAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDQtMDZUMDI6MTk6MjUrMDA6MDCJTjHvAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA0LTA2VDAyOjE5OjI1KzAwOjAw+BOJUwAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wNC0wNlQxNDozMTo1MSswMDowMCfdQhgAAACZSURBVDjL5ZNBDsQgCEVBikpb73/diVongG3NrOetTHwp+AsAAPgINBDfDcR3AxcMIZAjWCFsHA28BSMQp2xITFaI2RHpty/0HmSvd7vUo+uhv+I4q3AeN69oFJJevZQ5B9XqaO9vhSsooTIJ17joqEfYoMdF/azvyDSBJOWJJLQQmKYSBlEl5pl2TTrKUw63rFdvvbyL9f8AUnALQPL7yScAAAAASUVORK5CYII=',
  error:   'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAqUExURQAAABoaLh8bLzAeMIcwOdc/QoYvOfFERNM/Qe9EROJBQz4hMr06PxcZLm3Bri8AAAABdFJOUwBA5thmAAAAAWJLR0QAiAUdSAAAAAlwSFlzAAABIAAAASAAqP9mJQAAAAd0SU1FB+oEBg4fM9P0KdoAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDQtMDZUMDI6MTk6MjUrMDA6MDCJTjHvAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA0LTA2VDAyOjE5OjI1KzAwOjAw+BOJUwAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wNC0wNlQxNDozMTo1MSswMDowMCfdQhgAAACYSURBVDjL5ZNZEoQgDAWzDAZc7n9dCwaFRCQHsL+ssgse4QEAgK9AAXFuIM4NdLgEYgNpgX7BsJASOIghshWSQgIPVyj/RivQEvPGaxbW/BVNhv8ptl1Skn0bnKJwlCQS+BjMoUW9431WmAyq1qUf9TVsUHVpl3VXBnRd2nVLzWKEnk6obdDEbotnp03IGb7gPj3/8TrP/wRtyAq3G7pqLQAAAABJRU5ErkJggg==',
}

// Lazy-initialized after app.whenReady() to avoid crash on Linux before GPU/display is ready
let trayIcons: Record<keyof typeof TRAY_ICON_B64, Electron.NativeImage> | null = null

function getTrayIcons(): Record<keyof typeof TRAY_ICON_B64, Electron.NativeImage> {
  if (!trayIcons) {
    trayIcons = Object.fromEntries(
      Object.entries(TRAY_ICON_B64).map(([k, b64]) => [
        k,
        nativeImage.createFromDataURL(`data:image/png;base64,${b64}`),
      ])
    ) as Record<keyof typeof TRAY_ICON_B64, Electron.NativeImage>
  }
  return trayIcons
}

function updateTrayIcon(status: 'healthy' | 'warning' | 'error' | 'default', detail?: string) {
  if (!tray) return
  tray.setImage(getTrayIcons()[status])
  const defaultTips: Record<string, string> = {
    healthy: 'Railhead — All services healthy',
    warning: 'Railhead — Deployment in progress',
    error:   'Railhead — Service failure detected',
    default: 'Railhead',
  }
  tray.setToolTip(detail || defaultTips[status])
}

// Project-directory mapping persistence
function projectDirsPath(): string {
  return join(app.getPath('userData'), 'project-dirs.json')
}

function loadProjectDirs(): Record<string, string> {
  try {
    if (existsSync(projectDirsPath())) {
      return JSON.parse(readFileSync(projectDirsPath(), 'utf-8'))
    }
  } catch { /* ignore corrupt file */ }
  return {}
}

function saveProjectDirs(dirs: Record<string, string>): void {
  writeFileSync(projectDirsPath(), JSON.stringify(dirs, null, 2))
}

// Helper to run git commands
async function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise(resolve => {
    const proc = spawnChild('git', args, { cwd, shell: false })
    let stdout = '', stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }))
    proc.on('error', (e) => resolve({ stdout: '', stderr: e.message, code: 1 }))
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#1b1e27',
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  tray = new Tray(getTrayIcons().default)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Railhead',
      click: () => { mainWindow?.show(); mainWindow?.focus() },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setToolTip('Railhead')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
}

function registerIpcHandlers(): void {
  // Auth handlers
  ipcMain.handle('railway:login', async (event) => {
    await handleLogin((progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('login:progress', progress)
      }
    })
  })

  ipcMain.handle('railway:logout', async () => {
    await handleLogout()
  })

  ipcMain.handle('railway:hasToken', async () => {
    // Check if either a saved token OR native CLI auth exists
    if (loadToken()) return true
    const result = await runCommand(['whoami'])
    return result.code === 0
  })

  ipcMain.handle('railway:whoami', async () => {
    const result = await runCommand(['whoami'])
    if (result.code !== 0) throw new Error(result.stderr || 'Not logged in')
    return result.stdout.trim()
  })

  ipcMain.handle('railway:checkLogin', async () => {
    return checkLogin()
  })


  // Command runner
  ipcMain.handle('railway:runCommand', async (_event, args: string[], options?: { cwd?: string }) => {
    return runCommand(args, options)
  })

  // Streaming command
  ipcMain.on('railway:streamCommand', (event, streamId: string, args: string[], options?: { cwd?: string }) => {
    // Clean up any existing stream with same id
    const existing = streamCleanups.get(streamId)
    if (existing) existing()

    const cleanup = streamCommand(event, streamId, args, options)
    streamCleanups.set(streamId, cleanup)
  })

  ipcMain.on('railway:killStream', (_event, streamId: string) => {
    const cleanup = streamCleanups.get(streamId)
    if (cleanup) {
      cleanup()
      streamCleanups.delete(streamId)
    }
  })

  // Project commands
  ipcMain.handle('railway:list', async () => {
    const result = await runCommand(['list', '--json'])
    return result
  })

  ipcMain.handle('railway:link', async (_event, projectId: string, environmentId?: string, cwd?: string) => {
    const args = ['link', '--project', projectId]
    if (environmentId) args.push('--environment', environmentId)
    return runCommand(args, { cwd })
  })

  // Per-project working dirs so we can run CLI commands without polluting user dirs
  function projectCwd(projectId: string): string {
    const dir = join(app.getPath('userData'), 'project-links', projectId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  ipcMain.handle('railway:linkForInspect', async (_event, projectId: string, environmentId: string) => {
    const cwd = projectCwd(projectId)
    const args = ['link', '--project', projectId, '--environment', environmentId]
    return runCommand(args, { cwd })
  })

  ipcMain.handle('railway:serviceStatus', async (_event, projectId: string, environmentId: string) => {
    const cwd = projectCwd(projectId)
    await runCommand(['link', '--project', projectId, '--environment', environmentId], { cwd })
    return runCommand(['service', 'status', '--all', '--json', '--environment', environmentId], { cwd })
  })

  ipcMain.handle('railway:deploymentList', async (_event, projectId: string, serviceId: string, environmentId: string) => {
    const cwd = projectCwd(projectId)
    return runCommand(
      ['deployment', 'list', '--service', serviceId, '--environment', environmentId, '--json', '--limit', '5'],
      { cwd }
    )
  })

  ipcMain.handle('railway:deploymentListFull', async (_event, projectId: string, serviceId: string, environmentId: string, limit: number) => {
    const cwd = projectCwd(projectId)
    return runCommand(
      ['deployment', 'list', '--service', serviceId, '--environment', environmentId, '--json', '--limit', String(limit || 50)],
      { cwd }
    )
  })

  ipcMain.handle('railway:deploymentRollback', async (_event, deploymentId: string) => {
    // Read auth token from Railway CLI config
    const { readFileSync } = await import('fs')
    const { homedir } = await import('os')
    let token: string | null = null
    try {
      const cfg = JSON.parse(readFileSync(join(homedir(), '.railway', 'config.json'), 'utf-8'))
      token = cfg?.user?.token ?? null
    } catch { /* no token in config */ }
    // Fall back to our saved token
    if (!token) token = loadToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    try {
      const res = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          query: `mutation DeploymentRedeploy($id: String!) { deploymentRedeploy(id: $id) { id status } }`,
          variables: { id: deploymentId },
        }),
      })
      const data = await res.json() as any
      if (data.errors) return { ok: false, error: data.errors[0]?.message ?? 'GraphQL error' }
      return { ok: true, data: data.data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('railway:deploymentRemove', async (_event, deploymentId: string) => {
    const { readFileSync } = await import('fs')
    const { homedir } = await import('os')
    let token: string | null = null
    try {
      const cfg = JSON.parse(readFileSync(join(homedir(), '.railway', 'config.json'), 'utf-8'))
      token = cfg?.user?.token ?? null
    } catch { /* no token */ }
    if (!token) token = loadToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    try {
      const res = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          query: `mutation DeploymentRemove($id: String!) { deploymentRemove(id: $id) }`,
          variables: { id: deploymentId },
        }),
      })
      const data = await res.json() as any
      if (data.errors) return { ok: false, error: data.errors[0]?.message ?? 'GraphQL error' }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('railway:serviceRedeploy', async (_event, projectId: string, serviceId: string, environmentId: string, projectName?: string, serviceName?: string) => {
    const cwd = projectCwd(projectId)
    if (successRevertTimer) { clearTimeout(successRevertTimer); successRevertTimer = null }
    const detail = projectName && serviceName
      ? `Railhead\n⟳ ${serviceName} (${projectName}): REDEPLOYING`
      : undefined
    updateTrayIcon('warning', detail)
    if (fastPollTimer) clearInterval(fastPollTimer)
    fastPollTimer = setInterval(poll, 5_000)
    const result = await runCommand(['service', 'redeploy', '--service', serviceId, '-y'], { cwd, env: { RAILWAY_PROJECT_ID: projectId, RAILWAY_ENVIRONMENT_ID: environmentId } })
    return result
  })

  ipcMain.handle('railway:serviceRestart', async (_event, projectId: string, serviceId: string, environmentId: string, projectName?: string, serviceName?: string) => {
    const cwd = projectCwd(projectId)
    if (successRevertTimer) { clearTimeout(successRevertTimer); successRevertTimer = null }
    const detail = projectName && serviceName
      ? `Railhead\n⟳ ${serviceName} (${projectName}): RESTARTING`
      : undefined
    updateTrayIcon('warning', detail)
    if (fastPollTimer) clearInterval(fastPollTimer)
    fastPollTimer = setInterval(poll, 5_000)
    const result = await runCommand(['service', 'restart', '--service', serviceId, '-y'], { cwd, env: { RAILWAY_PROJECT_ID: projectId, RAILWAY_ENVIRONMENT_ID: environmentId } })
    return result
  })

  ipcMain.on('railway:streamLogs', (event, streamId: string, projectId: string, serviceId: string, environmentId: string) => {
    const existing = streamCleanups.get(streamId)
    if (existing) existing()
    const cwd = projectCwd(projectId)
    const cleanup = streamCommand(event, streamId,
      ['logs', '--service', serviceId, '--environment', environmentId, '--lines', '200'],
      { cwd }
    )
    streamCleanups.set(streamId, cleanup)
  })

  // Advanced log streaming for Log Explorer
  ipcMain.on('railway:streamLogsAdvanced', (
    event, streamId: string,
    projectId: string, serviceId: string, environmentId: string,
    opts: {
      logType: 'deploy' | 'build' | 'http'
      filter?: string
      since?: string
      lines?: number
      method?: string
      status?: string
      path?: string
      latest?: boolean
      json?: boolean
    }
  ) => {
    const existing = streamCleanups.get(streamId)
    if (existing) existing()
    const cwd = projectCwd(projectId)

    const args = ['logs', '--service', serviceId, '--environment', environmentId]
    if (opts.logType === 'build') args.push('--build')
    else if (opts.logType === 'http') args.push('--http')
    else args.push('--deployment')
    if (opts.json) args.push('--json')
    if (opts.filter) args.push('--filter', opts.filter)
    if (opts.since) args.push('--since', opts.since)
    if (opts.lines) args.push('--lines', String(opts.lines))
    if (opts.method) args.push('--method', opts.method)
    if (opts.status) args.push('--status', opts.status)
    if (opts.path) args.push('--path', opts.path)
    if (opts.latest) args.push('--latest')

    const cleanup = streamCommand(event, streamId, args, { cwd })
    streamCleanups.set(streamId, cleanup)
  })

  ipcMain.handle('railway:status', async (_event, cwd?: string) => {
    const result = await runCommand(['status'], { cwd })
    return result
  })

  ipcMain.handle('railway:env', async (_event, cwd?: string) => {
    const result = await runCommand(['env'], { cwd })
    return result
  })

  // Variable management
  ipcMain.handle('railway:varList', async (_event, projectId: string, serviceId: string, environmentId: string) => {
    const cwd = projectCwd(projectId)
    return runCommand(['variable', 'list', '--service', serviceId, '--environment', environmentId, '--json'], { cwd })
  })

  ipcMain.handle('railway:varSet', async (_event, projectId: string, serviceId: string, environmentId: string, key: string, value: string, skipDeploys: boolean) => {
    const cwd = projectCwd(projectId)
    const args = ['variable', 'set', '--service', serviceId, '--environment', environmentId, `${key}=${value}`]
    if (skipDeploys) args.push('--skip-deploys')
    return runCommand(args, { cwd })
  })

  ipcMain.handle('railway:varDelete', async (_event, projectId: string, serviceId: string, environmentId: string, key: string) => {
    const cwd = projectCwd(projectId)
    return runCommand(['variable', 'delete', '--service', serviceId, '--environment', environmentId, key], { cwd })
  })

  ipcMain.handle('system:saveEnvFile', async (_event, content: string, defaultPath: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export .env file',
      defaultPath,
      filters: [{ name: 'Env Files', extensions: ['env'] }, { name: 'All Files', extensions: ['*'] }],
    })
    if (result.canceled || !result.filePath) return null
    const { writeFileSync } = await import('fs')
    writeFileSync(result.filePath, content, 'utf-8')
    return result.filePath
  })

  ipcMain.handle('system:readEnvFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import .env file',
      filters: [{ name: 'Env Files', extensions: ['env'] }, { name: 'All Files', extensions: ['*'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const { readFileSync } = await import('fs')
    return readFileSync(result.filePaths[0], 'utf-8')
  })

  ipcMain.handle('railway:use', async (_event, environment: string, cwd?: string) => {
    const result = await runCommand(['environment', environment], { cwd })
    return result
  })

  ipcMain.handle('railway:open', async (_event, cwd?: string) => {
    const result = await runCommand(['open'], { cwd })
    return result
  })

  ipcMain.handle('railway:init', async (_event, name?: string, cwd?: string) => {
    const args = ['init']
    if (name) args.push('--name', name)
    const result = await runCommand(args, { cwd })
    return result
  })

  ipcMain.handle('railway:newProject', async (_event, name?: string) => {
    const args = ['init']
    if (name) args.push('--name', name)
    const result = await runCommand(args)
    return result
  })

  // System utilities
  ipcMain.handle('system:getWorkingDirectory', async () => {
    return process.cwd()
  })

  ipcMain.handle('system:openDirectoryDialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select Project Directory',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('system:getHomeDir', async () => {
    return os.homedir()
  })

  ipcMain.handle('system:hasGithubDesktop', async () => {
    const candidates = ['/usr/bin/github-desktop', '/opt/github-desktop/github-desktop', '/usr/local/bin/github-desktop']
    return candidates.some((p) => { try { accessSync(p, constants.X_OK); return true } catch { return false } })
  })

  ipcMain.handle('system:openRepoInBrowser', async (_event, repoPath: string) => {
    await shell.openExternal(`https://github.com/${repoPath}`)
  })

  ipcMain.handle('system:openRepoInGithubDesktop', async (_event, repoPath: string) => {
    await shell.openExternal(`x-github-client://openRepo/https://github.com/${repoPath}`)
  })

  // PTY Terminal (node-pty)
  ipcMain.on('terminal:spawn', async (event, ptyId: string, cmd: string | null, cwd?: string, projectId?: string, environmentId?: string) => {
    try {
      const nodePty = require('node-pty')
      const env = { ...getEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor' }
      const shellPath = process.env.SHELL || '/bin/bash'
      const spawnArgs: string[] = cmd ? ['-c', cmd] : []
      const resolvedCwd = projectId ? projectCwd(projectId) : (cwd || os.homedir())
      if (projectId && environmentId) {
        await runCommand(['link', '--project', projectId, '--environment', environmentId], { cwd: resolvedCwd })
      }
      const ptyProcess = nodePty.spawn(shellPath, spawnArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: resolvedCwd,
        env,
      })
      ptyProcess.onData((data: string) => {
        if (!event.sender.isDestroyed()) event.sender.send('terminal:data', ptyId, data)
      })
      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        if (!event.sender.isDestroyed()) event.sender.send('terminal:exit', ptyId, exitCode)
        ptyMap.delete(ptyId)
      })
      ptyMap.set(ptyId, ptyProcess)
    } catch (e: any) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('terminal:error', ptyId, e.message ?? String(e))
      }
    }
  })

  ipcMain.on('terminal:write', (_event, ptyId: string, data: string) => {
    ptyMap.get(ptyId)?.write(data)
  })

  ipcMain.on('terminal:resize', (_event, ptyId: string, cols: number, rows: number) => {
    ptyMap.get(ptyId)?.resize(cols, rows)
  })

  ipcMain.on('terminal:kill', (_event, ptyId: string) => {
    ptyMap.get(ptyId)?.kill()
    ptyMap.delete(ptyId)
  })

  // Generic Railway GraphQL proxy
  ipcMain.handle('railway:graphql', async (_event, query: string, variables?: Record<string, any>) => {
    const { readFileSync } = await import('fs')
    const { homedir } = await import('os')
    let token: string | null = null
    try {
      const cfg = JSON.parse(readFileSync(join(homedir(), '.railway', 'config.json'), 'utf-8'))
      token = cfg?.user?.token ?? null
    } catch { /* ignore */ }
    if (!token) token = loadToken()
    if (!token) return { ok: false, error: 'Not authenticated' }
    try {
      const res = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
      })
      const data = await res.json() as any
      if (data.errors) return { ok: false, error: data.errors[0]?.message ?? 'GraphQL error', errors: data.errors }
      return { ok: true, data: data.data }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Domain management via CLI
  ipcMain.on('railway:streamSsh', (event, streamId: string, projectId: string, serviceId: string, environmentId: string) => {
    const existing = streamCleanups.get(streamId)
    if (existing) existing()
    const cwd = projectCwd(projectId)
    const cleanup = streamCommand(event, streamId,
      ['ssh', '--service', serviceId, '--environment', environmentId],
      { cwd }
    )
    streamCleanups.set(streamId, cleanup)
  })

  // Git integration
  ipcMain.handle('git:status', async (_event, cwd: string) => {
    if (!cwd) return { isRepo: false }
    const [branchRes, statusRes, logRes, remoteRes] = await Promise.all([
      runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
      runGit(['status', '--porcelain'], cwd),
      runGit(['log', '--pretty=format:%H|%h|%s|%ar|%an', '-8'], cwd),
      runGit(['remote', 'get-url', 'origin'], cwd),
    ])
    if (branchRes.code !== 0) return { isRepo: false }

    const statusLines = statusRes.stdout.split('\n').filter(Boolean)
    const staged = statusLines.filter(l => l[0] !== ' ' && l[0] !== '?').length
    const modified = statusLines.filter(l => l[1] === 'M' || l[1] === 'D').length
    const untracked = statusLines.filter(l => l.startsWith('??')).length

    const commits = logRes.stdout.split('\n').filter(Boolean).map(l => {
      const [hash, short, ...rest] = l.split('|')
      const [msg, rel, author] = [rest.slice(0,-2).join('|'), rest[rest.length-2], rest[rest.length-1]]
      return { hash, short, message: msg, relativeTime: rel, author }
    })

    // ahead/behind (may fail if no upstream)
    const aheadRes = await runGit(['rev-list', '--count', '@{u}..HEAD'], cwd)
    const behindRes = await runGit(['rev-list', '--count', 'HEAD..@{u}'], cwd)

    return {
      isRepo: true,
      branch: branchRes.stdout.trim(),
      staged,
      modified,
      untracked,
      clean: staged === 0 && modified === 0 && untracked === 0,
      commits,
      remoteUrl: remoteRes.stdout.trim(),
      ahead: parseInt(aheadRes.stdout.trim()) || 0,
      behind: parseInt(behindRes.stdout.trim()) || 0,
    }
  })

  ipcMain.handle('git:commit', async (_event, cwd: string, message: string) => {
    const addRes = await runGit(['add', '-A'], cwd)
    if (addRes.code !== 0) return addRes
    return runGit(['commit', '-m', message], cwd)
  })

  ipcMain.handle('git:push', async (_event, cwd: string) => {
    return runGit(['push'], cwd)
  })

  ipcMain.handle('git:pull', async (_event, cwd: string) => {
    return runGit(['pull'], cwd)
  })

  // Tray deploy status (called from Deploy page)
  ipcMain.handle('tray:deployStarted', async (_event, projectName: string, serviceName: string) => {
    // Cancel any pending success→default revert
    if (successRevertTimer) { clearTimeout(successRevertTimer); successRevertTimer = null }
    const detail = `Railhead\n⟳ ${serviceName} (${projectName}): DEPLOYING`
    updateTrayIcon('warning', detail)
    // Start fast polling every 5s
    if (fastPollTimer) clearInterval(fastPollTimer)
    fastPollTimer = setInterval(poll, 5_000)
  })

  ipcMain.handle('tray:deployEnded', async (_event, success: boolean, projectName: string, serviceName: string) => {
    // Stop fast polling
    if (fastPollTimer) { clearInterval(fastPollTimer); fastPollTimer = null }
    if (success) {
      // Flash green for 30s, then revert to default purple
      updateTrayIcon('healthy', `Railhead\n✓ ${serviceName} (${projectName}): deployed`)
      if (successRevertTimer) clearTimeout(successRevertTimer)
      successRevertTimer = setTimeout(() => {
        successRevertTimer = null
        updateTrayIcon('default')
      }, 30_000)
    } else {
      // Stay red — poll() will clear it when the service recovers
      updateTrayIcon('error', `Railhead\n✗ ${serviceName} (${projectName}): deploy failed`)
    }
    // Run one final poll after a short delay to get real status from API
    setTimeout(poll, 3_000)
  })

  // Project-directory mappings
  ipcMain.handle('projectDirs:getAll', async () => {
    return loadProjectDirs()
  })

  ipcMain.handle('projectDirs:get', async (_event, projectId: string) => {
    const dirs = loadProjectDirs()
    return dirs[projectId] ?? null
  })

  ipcMain.handle('projectDirs:set', async (_event, projectId: string, directory: string) => {
    const dirs = loadProjectDirs()
    dirs[projectId] = directory
    saveProjectDirs(dirs)
  })

  ipcMain.handle('projectDirs:remove', async (_event, projectId: string) => {
    const dirs = loadProjectDirs()
    delete dirs[projectId]
    saveProjectDirs(dirs)
  })

  // Notification settings
  ipcMain.handle('notifications:getSettings', async () => {
    return loadSettings()
  })

  ipcMain.handle('notifications:saveSettings', async (_event, settings) => {
    saveNotificationSettings(settings)
    // Restart polling with new interval
    stopPolling()
    startPolling()
  })

  ipcMain.handle('notifications:test', async () => {
    sendNotification('🚀 Railhead', 'Notifications are working!')
  })
}

// xterm.js canvas rendering crashes the GPU process on Linux — use software rendering
app.disableHardwareAcceleration()

// Prevent multiple instances — second launch focuses the existing window instead
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.railway.gui')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()
  createTray()

  // Init notification polling
  initNotifications(loadToken, updateTrayIcon, () => {
    // All services stable — stop fast polling and cancel any success flash timer
    if (fastPollTimer) { clearInterval(fastPollTimer); fastPollTimer = null }
    if (successRevertTimer) { clearTimeout(successRevertTimer); successRevertTimer = null }
  })
  startPolling()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopPolling()
  if (fastPollTimer) { clearInterval(fastPollTimer); fastPollTimer = null }
  if (successRevertTimer) { clearTimeout(successRevertTimer); successRevertTimer = null }
  for (const cleanup of streamCleanups.values()) cleanup()
  streamCleanups.clear()
  for (const pty of ptyMap.values()) { try { pty.kill() } catch { /* ignore */ } }
  ptyMap.clear()
})
