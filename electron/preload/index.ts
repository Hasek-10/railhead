import { contextBridge, ipcRenderer } from 'electron'

export interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

let streamCounter = 0

function generateStreamId(): string {
  return `stream-${Date.now()}-${++streamCounter}`
}

const railwayAPI = {
  // Core command runner
  runCommand: (args: string[], options?: { cwd?: string }): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:runCommand', args, options)
  },

  streamCommand: (
    args: string[],
    onData: (chunk: string) => void,
    onEnd: (code: number) => void,
    options?: { cwd?: string }
  ): (() => void) => {
    const streamId = generateStreamId()

    const dataListener = (_event: Electron.IpcRendererEvent, id: string, chunk: string) => {
      if (id === streamId) onData(chunk)
    }

    const endListener = (_event: Electron.IpcRendererEvent, id: string, code: number) => {
      if (id === streamId) {
        onEnd(code)
        cleanup()
      }
    }

    ipcRenderer.on('stream-data', dataListener)
    ipcRenderer.on('stream-end', endListener)

    ipcRenderer.send('railway:streamCommand', streamId, args, options)

    const cleanup = () => {
      ipcRenderer.removeListener('stream-data', dataListener)
      ipcRenderer.removeListener('stream-end', endListener)
      ipcRenderer.send('railway:killStream', streamId)
    }

    return cleanup
  },

  // Auth
  login: (onProgress?: (progress: { type: string; message: string }) => void): Promise<void> => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { type: string; message: string }) => {
      if (typeof onProgress === 'function') onProgress(progress)
    }
    ipcRenderer.on('login:progress', listener)
    return ipcRenderer.invoke('railway:login').finally(() => {
      ipcRenderer.removeListener('login:progress', listener)
    })
  },

  hasToken: (): Promise<boolean> => {
    return ipcRenderer.invoke('railway:hasToken')
  },

  logout: (): Promise<void> => {
    return ipcRenderer.invoke('railway:logout')
  },

  whoami: (): Promise<string> => {
    return ipcRenderer.invoke('railway:whoami')
  },

  checkLogin: (): Promise<boolean> => {
    return ipcRenderer.invoke('railway:checkLogin')
  },

  // Projects
  list: (): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:list')
  },

  link: (projectId: string, environmentId?: string, cwd?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:link', projectId, environmentId, cwd)
  },

  linkForInspect: (projectId: string, environmentId: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:linkForInspect', projectId, environmentId)
  },

  serviceStatus: (projectId: string, environmentId: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:serviceStatus', projectId, environmentId)
  },

  deploymentList: (projectId: string, serviceId: string, environmentId: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:deploymentList', projectId, serviceId, environmentId)
  },

  deploymentListFull: (projectId: string, serviceId: string, environmentId: string, limit?: number): Promise<CommandResult> =>
    ipcRenderer.invoke('railway:deploymentListFull', projectId, serviceId, environmentId, limit),

  deploymentRollback: (deploymentId: string): Promise<{ ok: boolean; error?: string; data?: any }> =>
    ipcRenderer.invoke('railway:deploymentRollback', deploymentId),

  deploymentRemove: (deploymentId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('railway:deploymentRemove', deploymentId),

  serviceRedeploy: (projectId: string, serviceId: string, environmentId: string, projectName?: string, serviceName?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:serviceRedeploy', projectId, serviceId, environmentId, projectName, serviceName)
  },

  serviceRestart: (projectId: string, serviceId: string, environmentId: string, projectName?: string, serviceName?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:serviceRestart', projectId, serviceId, environmentId, projectName, serviceName)
  },

  streamLogsAdvanced: (
    projectId: string,
    serviceId: string,
    environmentId: string,
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
    },
    onData: (chunk: string) => void,
    onEnd: (code: number) => void
  ): (() => void) => {
    const streamId = generateStreamId()
    const dataListener = (_event: Electron.IpcRendererEvent, id: string, chunk: string) => {
      if (id === streamId) onData(chunk)
    }
    const endListener = (_event: Electron.IpcRendererEvent, id: string, code: number) => {
      if (id === streamId) { onEnd(code); cleanup() }
    }
    ipcRenderer.on('stream-data', dataListener)
    ipcRenderer.on('stream-end', endListener)
    ipcRenderer.send('railway:streamLogsAdvanced', streamId, projectId, serviceId, environmentId, opts)
    const cleanup = () => {
      ipcRenderer.removeListener('stream-data', dataListener)
      ipcRenderer.removeListener('stream-end', endListener)
      ipcRenderer.send('railway:killStream', streamId)
    }
    return cleanup
  },

  streamLogs: (
    projectId: string,
    serviceId: string,
    environmentId: string,
    onData: (chunk: string) => void,
    onEnd: (code: number) => void
  ): (() => void) => {
    const streamId = generateStreamId()
    const dataListener = (_event: Electron.IpcRendererEvent, id: string, chunk: string) => {
      if (id === streamId) onData(chunk)
    }
    const endListener = (_event: Electron.IpcRendererEvent, id: string, code: number) => {
      if (id === streamId) { onEnd(code); cleanup() }
    }
    ipcRenderer.on('stream-data', dataListener)
    ipcRenderer.on('stream-end', endListener)
    ipcRenderer.send('railway:streamLogs', streamId, projectId, serviceId, environmentId)
    const cleanup = () => {
      ipcRenderer.removeListener('stream-data', dataListener)
      ipcRenderer.removeListener('stream-end', endListener)
      ipcRenderer.send('railway:killStream', streamId)
    }
    return cleanup
  },

  newProject: (name?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:newProject', name)
  },

  init: (name?: string, cwd?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:init', name, cwd)
  },

  // Status & Info
  status: (cwd?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:status', cwd)
  },

  env: (cwd?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:env', cwd)
  },

  open: (cwd?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:open', cwd)
  },

  // Deployment - streaming
  up: (
    onData: (chunk: string) => void,
    onEnd: (code: number) => void,
    cwd?: string,
    serviceId?: string
  ): (() => void) => {
    const args = ['up']
    if (serviceId) args.push('--service', serviceId)
    return railwayAPI.streamCommand(args, onData, onEnd, { cwd })
  },

  build: (cwd?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:runCommand', ['build'], { cwd })
  },

  // Environment
  use: (environment: string, cwd?: string): Promise<CommandResult> => {
    return ipcRenderer.invoke('railway:use', environment, cwd)
  },

  // Run arbitrary command via railway run
  run: (
    cmd: string,
    onData: (chunk: string) => void,
    onEnd: (code: number) => void,
    cwd?: string
  ): (() => void) => {
    return railwayAPI.streamCommand(['run', cmd], onData, onEnd, { cwd })
  },

  // System
  getWorkingDirectory: (): Promise<string> => {
    return ipcRenderer.invoke('system:getWorkingDirectory')
  },

  openDirectoryDialog: (): Promise<string | null> => {
    return ipcRenderer.invoke('system:openDirectoryDialog')
  },

  getHomeDir: (): Promise<string> => {
    return ipcRenderer.invoke('system:getHomeDir')
  },

  // Variable management
  varList: (projectId: string, serviceId: string, environmentId: string): Promise<CommandResult> =>
    ipcRenderer.invoke('railway:varList', projectId, serviceId, environmentId),

  varSet: (projectId: string, serviceId: string, environmentId: string, key: string, value: string, skipDeploys: boolean): Promise<CommandResult> =>
    ipcRenderer.invoke('railway:varSet', projectId, serviceId, environmentId, key, value, skipDeploys),

  varDelete: (projectId: string, serviceId: string, environmentId: string, key: string): Promise<CommandResult> =>
    ipcRenderer.invoke('railway:varDelete', projectId, serviceId, environmentId, key),

  saveEnvFile: (content: string, defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('system:saveEnvFile', content, defaultPath),

  readEnvFile: (): Promise<string | null> =>
    ipcRenderer.invoke('system:readEnvFile'),

  hasGithubDesktop: (): Promise<boolean> => {
    return ipcRenderer.invoke('system:hasGithubDesktop')
  },

  openRepoInBrowser: (repoPath: string): Promise<void> => {
    return ipcRenderer.invoke('system:openRepoInBrowser', repoPath)
  },

  openRepoInGithubDesktop: (repoPath: string): Promise<void> => {
    return ipcRenderer.invoke('system:openRepoInGithubDesktop', repoPath)
  },

  // PTY Terminal
  spawnTerminal: (
    ptyId: string,
    cmd: string | null,
    cwd: string | undefined,
    projectId: string | undefined,
    environmentId: string | undefined,
    onData: (data: string) => void,
    onExit: (code: number) => void,
    onError?: (msg: string) => void
  ): (() => void) => {
    const dataListener = (_e: Electron.IpcRendererEvent, id: string, data: string) => {
      if (id === ptyId) onData(data)
    }
    const exitListener = (_e: Electron.IpcRendererEvent, id: string, code: number) => {
      if (id === ptyId) { onExit(code); cleanup() }
    }
    const errorListener = (_e: Electron.IpcRendererEvent, id: string, msg: string) => {
      if (id === ptyId) { onError?.(msg); onExit(1); cleanup() }
    }
    ipcRenderer.on('terminal:data', dataListener)
    ipcRenderer.on('terminal:exit', exitListener)
    ipcRenderer.on('terminal:error', errorListener)
    ipcRenderer.send('terminal:spawn', ptyId, cmd, cwd, projectId, environmentId)
    const cleanup = () => {
      ipcRenderer.removeListener('terminal:data', dataListener)
      ipcRenderer.removeListener('terminal:exit', exitListener)
      ipcRenderer.removeListener('terminal:error', errorListener)
      ipcRenderer.send('terminal:kill', ptyId)
    }
    return cleanup
  },

  writeTerminal: (ptyId: string, data: string): void => {
    ipcRenderer.send('terminal:write', ptyId, data)
  },

  resizeTerminal: (ptyId: string, cols: number, rows: number): void => {
    ipcRenderer.send('terminal:resize', ptyId, cols, rows)
  },

  killTerminal: (ptyId: string): void => {
    ipcRenderer.send('terminal:kill', ptyId)
  },

  // Generic GraphQL
  graphql: (query: string, variables?: Record<string, any>): Promise<{ ok: boolean; data?: any; error?: string }> =>
    ipcRenderer.invoke('railway:graphql', query, variables),

  // Git integration
  gitStatus: (cwd: string): Promise<any> =>
    ipcRenderer.invoke('git:status', cwd),

  gitCommit: (cwd: string, message: string): Promise<{ stdout: string; stderr: string; code: number }> =>
    ipcRenderer.invoke('git:commit', cwd, message),

  gitPush: (cwd: string): Promise<{ stdout: string; stderr: string; code: number }> =>
    ipcRenderer.invoke('git:push', cwd),

  gitPull: (cwd: string): Promise<{ stdout: string; stderr: string; code: number }> =>
    ipcRenderer.invoke('git:pull', cwd),

  // Tray deploy notifications
  trayDeployStarted: (projectName: string, serviceName: string): Promise<void> =>
    ipcRenderer.invoke('tray:deployStarted', projectName, serviceName),

  trayDeployEnded: (success: boolean, projectName: string, serviceName: string): Promise<void> =>
    ipcRenderer.invoke('tray:deployEnded', success, projectName, serviceName),

  // Project-directory mappings
  getProjectDir: (projectId: string): Promise<string | null> =>
    ipcRenderer.invoke('projectDirs:get', projectId),

  getAllProjectDirs: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke('projectDirs:getAll'),

  setProjectDir: (projectId: string, directory: string): Promise<void> =>
    ipcRenderer.invoke('projectDirs:set', projectId, directory),

  removeProjectDir: (projectId: string): Promise<void> =>
    ipcRenderer.invoke('projectDirs:remove', projectId),

  // Notifications
  getNotificationSettings: (): Promise<any> =>
    ipcRenderer.invoke('notifications:getSettings'),

  saveNotificationSettings: (settings: any): Promise<void> =>
    ipcRenderer.invoke('notifications:saveSettings', settings),

  testNotification: (): Promise<void> =>
    ipcRenderer.invoke('notifications:test'),
}

contextBridge.exposeInMainWorld('railway', railwayAPI)

export type RailwayAPI = typeof railwayAPI
