import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, Notification } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, accessSync, constants } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { runCommand, streamCommand, checkLogin, getEnv } from './railway'
import { handleLogin, handleLogout, loadToken } from './auth'
import {
  initNotifications, startPolling, stopPolling,
  loadSettings, saveNotificationSettings, sendNotification,
} from './notifications'
import * as os from 'os'
import { spawn as spawnChild } from 'child_process'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const streamCleanups = new Map<string, () => void>()
const ptyMap = new Map<string, any>()

// Tray icons as pre-rendered 32x32 PNG files (Railhead I-beam logo, color variants)
const TRAY_ICON_B64 = {
  default: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgEAYAAAAj6qa3AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAAAAAAAAPlDu38AAAAJcEhZcwAAASAAAAEgAKj/ZiUAAAAHdElNRQfqBAYBFyXkpVG+AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA0LTA2VDAxOjIzOjM3KzAwOjAw4XG6XgAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNC0wNlQwMToyMzozNyswMDowMJAsAuIAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDQtMDZUMDE6MjM6MzcrMDA6MDDHOSM9AAAICElEQVRo3u2ZfUzV1xnHP8+5v3t5uwIigly0qBitLNJObarWFV8qLG23OLXptkbxZXPJEmZx61y10dpqYnV1NX1xYTHOORa76lzjtBUjUzd1rtI6USuNGBVrFYeA3IvAvb/f2R/87ou8CHZBbNLvDYFLnvPyfM9zznOe7xGAjVWQdjHt4jspQDnlMjb9IuMZT93CJHlEHsHxTB9qqCFhaANRRKGj3BgY3E8IEADAjx9n8wVSSaWxsoHznGfw9mIUiheL+uoyXaZvfP6rqxuvbvQ+ikhaXVpddjKgUIwZ1V+GyTC+2DAAACvnCAYGDuUGQIeGC/4lve13G4TnpSNmq6xK4okn/cA5TExGLwroYl0sW049rbjEJWanH5ThMpzrG2JbV3bySQwMVMhxs81A95vj7eclCBBAECyViRcvl6fkUUst722o4hzndEP6Wwb96U/5T6aj0QRyznfCqCPMJoIB+iR1+k/ACv2pdgE3aOGcPQXVgy5qwAKScDEMWClZ4gfJJkF+AFhoezMAoW2q7Y/gxEnUpKkyV+by8MLJ4hnsGZw96EwyLbSQNPK6bR5c8faOl3BVLwHHak47L0B0X8fmxA9AknhOZQI3CVDVgwTEYzAIdA1brApoumLm100EcxWj/d8EySNVXmtHRBCtEaExuMUt+p8ZYlBPPSlD/00MMfhDho62LYMr7ijgtPN9eDg+cc/sFyCz0L05dzeohQxwbAequKWP9CABg4iRx8AqYpM5AionenXJYDhRWPfx1qNgljPBvw3kG8TLrHatDTsOII44GjKniSfVk5r9kNY4cEQcG+2gZ+p/WX+FOG28nTIfnipM2/ymBQmzjF0DDdDR7LTS790WkGZmqCtQ/1Yg9/J/YffvvlhQEAu+PoFF1cUg22Wcmn6HfiwsBIyuHA+hhmY+AxlDvsoBtYohjo9Au/iLlQh6Kv+w3uhBx9tiH5oCUJtY44gBGcXjaixwvHWeXUKh0NxFLu9HFMNBn+e31iqwXmKT6Qd5hhLVDOxHeL6DCBAEBXoLF3Ue8Hsu6GmdjCHAPAbLPpA5ZMiH9vFlRdgEIyDADFUN1o/INS+DLmKBdQ1IZhFzus9j9wmwT9umBeaRuonhvZe5w52buxHUClY4yoCL3NKHw47zGfV8CM696npcKbhQxE2xD9WoiP5b0Pig5V3runcH+I9YD/jGA8NJ4NsRRGQQIxPBeoVcMxUqJ3rnlzwETU+Y+XVJwDbJkgCwnfjuuCUej8eTna273gTBLLCXa3oJOAr52HkUotMdWxKPgTxAvsoC6u0ssJWL+klwHlaVcTnw2PF+D/58OQxYFr0vuwL0PI5bn9irLiDvMFY9CFfnNE07GQ+Hn6s5+/pW8E+1Mn0HgdlkyB4gwc4Cl9hinbSzwFgwf8No/2SQXFJlTadZ4P+IALvDYJoJnra+FYEz1T8Dzt1+D9DrqNXrwV1hOFIngfvHxrGUp4EJuBkGBNA0RfQ/CjezwL3eOJYyElrGW0leAe+6QO21EpBSRskvgev2PaAfi1gWXnEZRap8v/uO3z0BbYkIpRkZ1/G1UB+yXgdJ4aZaCgyhhDeBW9TRUZpsxKQGGEEfpoD8kxxVAFJNvBSClMrjanEH7cKh3p2jvB16MmG1RoMFBIAA1m0r3hmCdsF29OzFu2cJ+ArgawJ6ewK9ja8J6O0J9DZ6lgBtj2AABoqYbrQJ2inAGdFPD6Hre8CXFED0FA7p9aATqbdeBTbgYw8wGQf9Ohgn1v7/MXzsBL2Kg9Zy0HUk6JW03ivWd0Jy9wWSuyCgrQBi6wDRfY23Ez8AyexCAHmBvvpJcO5XN+L84F0ceLR6Lbj/YOwbAPAthFUR9uV42QHexYFp1fXgGqrOut+HPlONvpIHzOamrO1gnLBAstGqCNcq5l5G+5d0KZB0XgvoU9TrP4OjgLLbBJBfuNfkTgK1kBcd/7mDABJZDO0F52pVFncEXDeVL+4NwIUQF2EfLIbirThfIfiXWWNCxVBeB1VhEGGBZKUtkMwvmQcnRtXN3XoWzHeZ4P9ppwLJHSJguT6jDYjOMIoST0HmSvcfc5dBwlhj10ABHctO67tAMrCWzjHBLoefpb+eCWzGp6M7WBEDiAbXs6q/ewZE7VbSp7UcrueTO/TfyE2+AzKTvaoKMo+7p+eWw9l1Da5d18G3PHCmWtHplf1OZ0DQvlVx17TQFK7eug175WQ2D8gegNDvjlEa0fJuIBE/wSt3N67SBiYmAu2UoVckS0x7T2VAZYbXb9f/ebmldv1/IqL+7y0E9YH15JmpUDnIO78kBZqeMH9Yl2pXiyawo40+YGGhQDxJnqTssU1niSaalqgRIYO7rf97C19WHzAwoDlfPFmerOzs0weopRbJyrFl40DILEhEOfV6G7Ci9Wyg5h69A3QFHdIHwmmwVR9I6EAfCPtlYhJ3ulk8To8ze9zKpSSTjO+lfARB1PCI7rmPX4LuhqZWPxw4sKxdxBJL5quHFEkkkVhkkkACKQc+tZ+UCDW4nbmvGsLHoEajgAYaMP8+FRcuKopWK31UH9UZn79GgABjFrWGhq/U1l6sj0IvKXT4OHq/Qbf51ir7m9YuGmmkcb+pL+gLjHx+gS7TZWy+EiVSL/WApGWkZWQnoHWFriAz/SnJkAyMhQeJJhr3rKG4cOHPfBlBuBn1vW6/J9wrmPZznkJB86/x42dg5cskkUTFewXEE6//VrSUy1yWqivxjcWNxSNM5H8Li1zgcRImCQAAAABJRU5ErkJggg==',
  healthy: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgEAYAAAAj6qa3AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAAAAAAAAPlDu38AAAAJcEhZcwAAASAAAAEgAKj/ZiUAAAAHdElNRQfqBAYBFyXkpVG+AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA0LTA2VDAxOjIzOjM3KzAwOjAw4XG6XgAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNC0wNlQwMToyMzozNyswMDowMJAsAuIAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDQtMDZUMDE6MjM6MzcrMDA6MDDHOSM9AAAHs0lEQVRo3u2ZW2wU1xnHf9/M7K7xbcl2beN1EgOmBDvFhXCpEolbCIrSohZKrEQtpKlo3D40SsVD01LSUhKQkKIqqFWJ/FCUEqdUmJKKNFVKmgAPpCqhEZfgErBjx8bGdzZmfdmdma8Pu2svvmFTGfyQ/8uZXc357nO+c/5HAPY2QH59fv3vc4FznJPFBfU8yINcKw/IElmCWZZFBx34Z3fjw4f6MrGwmEqwsQGIEcPTX0ceefTUdFNLLTOrKjEw+HnFXXpaT2vnlZ9d3Xt17/WvIZJ/Lf9aaRAwMFg0P0fmyBya98wAwF1xEgsL08gEQAfUJZ/kTvs9BIN2aYq1hltDNtkUHLuMg8MDz9laqZXy2vm1Bp/xGZsKjstcmUvbnvR4ZaredxcLCGHDcGaJoqjk+3C5BABtBcI0irnOdxocfpYsuDu5p4DKXtbvgdxY55HDuh+tQFHtF7SgRNVP+sxDA0cO0ABGdqccBlzp6U1RPHuK5NZjJNCBD6mUlYMo6cgGwU3JvpcxRFMGDB9/K1fK0PM2C8lUSmhmaWXrPhSBRogSK2xKvJzM+3PGo7qIWWOTZLMuAg9nTresgudLITkBppm9Sc5xPGmirFrAV2BButi3gI/sNPQV45RcUDQtEEvGKUCx66SXnwiyLMGFyZ/+baUwjNvCiOWxqMuOLPA/JMrDCG/6Vtx3M+5c3BX4ELDCXcg/g6IeEJzEApizGD5Q4fyACjvfEjs5ysBdWbWnpA87a92sdYMpacobNthJ1ABlk0F20xsKLF9s366aKk6V+MHu655lBx6U4P8MnQJvW6CeAEJzUT8DGoQUoliwxwKxeXhj4LdiHjhZ0+IFQe330GJAtSNkYcmLEiPoqLEzMEUplOFxq6QXJMxxeBhaah/ky0KYH9BQQdt/h9Ul0fBiMR3UXcK+5kaUgeUY6l0AlbufNp2OgTKCXG8xmGmiTa/AsUOKsIwIUyyYxAIzHdBcgmEMqIL4o9ul3OQP06ZOcGVFDfFaaHGABkCavUwoDi14SioMCQfm7bAWqnZP0gra4bfiBEEXsm0AYx/1mcrVNLDqO98SpznLQ6uaa/l5QX9uc6FxQs7U9mgtqtnZGc0G1tSoqoC9E0p1mwMBNuGrdMBr044D+MtLvfJqYZ6TIScpN6qluPt/fC473xBudTwEbwk12qp3jhIRCoVBpqY7nI0h2gZ3UAAutb8p84JC/wBKQXLnGbkBpog+0j42cA9manmueAc/58lfuOQ5Gc3E04xWgUzt5MyXzX5J0HgM3vbo28h2ILarY21AG/Kan21kK+NjPfEAIJbpAJs8DG8INNsBH9jt6FvDK1jG6wP9RAUmByTZz1q7RusSisw/UaDsTzQI12+KZslvXRJtAfx1Z6QDSGrziqQRcWY0fgH5cAPpwAUe+Th5IOJjteRf0pcgaxwI31vpItClFbkIPofam6D7grN2on07c8cGsThxxBck2M8pqK373Ld0P4kgebUCpFJIFQCYtI0hVuogBXnmYGSB3ST3fB0y5ShCYbqyVTaNYlDMgY8KYSAXcKuKLFtqfMHDkJpncP6r2JSrDToyTitsRgCmNLwJwpw240/giAHfagDuN2xEAK65F0hLaRm5WyQ2vDLxn3Q7rxrMPuCUCRMP6N/YDqtlcBZbpe2wGHJ7CM4IWIYAHiOpBOkC79E/sA/VoLzMG9xWjhm58BMkwjBXjGwmQBZ6H5AGgKVjifQbEzSn1doM4OUFv6wijlfuuNwTyq4yjpg2a2/557BHA0LcTG6FkpuOjqW9zFdTf/kmsDGRbxmHTA4YnIWc0PQk7aAoWe38AlFpflXkpW/bBM8eIGP0s4OgRWgcdHyBAriQIkAJzG38ZkwAxEvF/nw7gp+l/Ng+DvJD+pNkJuKTfUH8GPdigL/UccILA7p4nnHWAxSoCAKNsi5IESaPzIt8ePKTZRVVbWl5L2bKPTJCM8QlE9F49DhzKLvb8GMyvLM8PPA8yL7/TJ0D7OAkQSXwiL+pGZgGu+hIBu7E0XXyYIDsyfGYhkJb5uOkk9pGtY8gfJEjSRcC8uLws8EewDx9d0pEGzGg/ORZBMp41IP6NDcZ/onxPfH6axE9zyXF8MyeCJA/Rkhgj45lk4eAgMIwZypAGWQmsD//HngeOdWJH5xODFBR3m3OYCzh6alI5wJu6LUvwA9XOBeL8wKudZcD68If2X1P8IOXQBODiYoCEAqFA6eK+/5JGGlHffTcEZwLn/zuGW+UHLCzo/56ESkIlpaUfH6OLLqRkRYI2tgdeG2yDb9IKRLRQj93We4CbIdkGZw1pg98aoQ0O+uXgkPFxv8UlLpFe9Q+CBIlsy4+7ZMwdEB4XIDc7/08pDOcHkk9xEth1j5BFFrlVJwwCBJhe4eDHT+6x6iH5TD7b41Y+tZC0O35XaADddOO8vxovXi5W7DT0A/1AC6/sxsZm0XPx0oi8tyU+zz01cJMyckSnGnTIr3jGHfcIPfTQ809H67SO4p9s1tN6mn1NPpGwhAHJL8wvLPWjelEvUlTwDSmUQqzy46SRRubjs/HiJVa0HUH43Ld+3PcJtwtO4jrPwID+l4kR4+6a7QQIcPHgs2STrW9VbKWRRmloyu6p7Km8z0H+B3QGWcjM6mSPAAAAAElFTkSuQmCC',
  warning: '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',
  error:   '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',
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

function updateTrayIcon(status: 'healthy' | 'warning' | 'error' | 'default') {
  if (!tray) return
  tray.setImage(getTrayIcons()[status])
  const tips = {
    healthy: 'Railhead — All services healthy',
    warning: 'Railhead — Deployment in progress',
    error:   'Railhead — Service failure detected',
    default: 'Railhead',
  }
  tray.setToolTip(tips[status])
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

  ipcMain.handle('railway:serviceRedeploy', async (_event, projectId: string, serviceId: string, environmentId: string) => {
    const cwd = projectCwd(projectId)
    return runCommand(['service', 'redeploy', '--service', serviceId, '--environment', environmentId], { cwd })
  })

  ipcMain.handle('railway:serviceRestart', async (_event, projectId: string, serviceId: string, environmentId: string) => {
    const cwd = projectCwd(projectId)
    return runCommand(['service', 'restart', '--service', serviceId, '--environment', environmentId], { cwd })
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
  initNotifications(loadToken, updateTrayIcon)
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
  for (const cleanup of streamCleanups.values()) cleanup()
  streamCleanups.clear()
  for (const pty of ptyMap.values()) { try { pty.kill() } catch { /* ignore */ } }
  ptyMap.clear()
})
