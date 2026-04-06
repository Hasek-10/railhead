export interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

interface RailwayAPI {
  runCommand: (args: string[], options?: { cwd?: string }) => Promise<CommandResult>
  streamCommand: (
    args: string[],
    onData: (chunk: string) => void,
    onEnd: (code: number) => void,
    options?: { cwd?: string }
  ) => () => void

  login: (onProgress: (p: { type: string; message: string }) => void) => Promise<void>
  hasToken: () => Promise<boolean>
  logout: () => Promise<void>
  whoami: () => Promise<string>
  checkLogin: () => Promise<boolean>

  list: () => Promise<CommandResult>
  newProject: (name?: string) => Promise<CommandResult>
  init: (name?: string, cwd?: string) => Promise<CommandResult>
  link: (projectId: string, environmentId?: string, cwd?: string) => Promise<CommandResult>
  linkForInspect: (projectId: string, environmentId: string) => Promise<CommandResult>

  status: (cwd?: string) => Promise<CommandResult>
  env: (cwd?: string) => Promise<CommandResult>
  open: (cwd?: string) => Promise<CommandResult>
  use: (environment: string, cwd?: string) => Promise<CommandResult>

  up: (
    onData: (chunk: string) => void,
    onEnd: (code: number) => void,
    cwd?: string,
    serviceId?: string
  ) => () => void

  build: (cwd?: string) => Promise<CommandResult>

  run: (
    cmd: string,
    onData: (chunk: string) => void,
    onEnd: (code: number) => void,
    cwd?: string
  ) => () => void

  serviceStatus: (projectId: string, environmentId: string) => Promise<CommandResult>
  serviceRedeploy: (projectId: string, serviceId: string, environmentId: string) => Promise<CommandResult>
  serviceRestart: (projectId: string, serviceId: string, environmentId: string) => Promise<CommandResult>

  deploymentList: (projectId: string, serviceId: string, environmentId: string) => Promise<CommandResult>
  deploymentListFull: (projectId: string, serviceId: string, environmentId: string, limit?: number) => Promise<CommandResult>
  deploymentRollback: (deploymentId: string) => Promise<{ ok: boolean; error?: string; data?: any }>
  deploymentRemove: (deploymentId: string) => Promise<{ ok: boolean; error?: string }>

  streamLogs: (
    projectId: string,
    serviceId: string,
    environmentId: string,
    onData: (chunk: string) => void,
    onEnd: (code: number) => void
  ) => () => void

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
  ) => () => void

  varList: (projectId: string, serviceId: string, environmentId: string) => Promise<CommandResult>
  varSet: (projectId: string, serviceId: string, environmentId: string, key: string, value: string, skipDeploys: boolean) => Promise<CommandResult>
  varDelete: (projectId: string, serviceId: string, environmentId: string, key: string) => Promise<CommandResult>

  getWorkingDirectory: () => Promise<string>
  openDirectoryDialog: () => Promise<string | null>
  getHomeDir: () => Promise<string>
  saveEnvFile: (content: string, defaultPath: string) => Promise<string | null>
  readEnvFile: () => Promise<string | null>

  hasGithubDesktop: () => Promise<boolean>
  openRepoInBrowser: (repoPath: string) => Promise<void>
  openRepoInGithubDesktop: (repoPath: string) => Promise<void>

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
  ) => () => void
  writeTerminal: (ptyId: string, data: string) => void
  resizeTerminal: (ptyId: string, cols: number, rows: number) => void
  killTerminal: (ptyId: string) => void

  // GraphQL
  graphql: (query: string, variables?: Record<string, any>) => Promise<{ ok: boolean; data?: any; error?: string; errors?: any[] }>

  // Git
  gitStatus: (cwd: string) => Promise<{
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
  }>
  gitCommit: (cwd: string, message: string) => Promise<{ stdout: string; stderr: string; code: number }>
  gitPush: (cwd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  gitPull: (cwd: string) => Promise<{ stdout: string; stderr: string; code: number }>

  // Notifications
  getNotificationSettings: () => Promise<{
    enabled: boolean
    pollIntervalSeconds: number
    onDeploySuccess: boolean
    onDeployFailure: boolean
    onServiceCrash: boolean
    onNewDeployment: boolean
  }>
  saveNotificationSettings: (settings: {
    enabled: boolean
    pollIntervalSeconds: number
    onDeploySuccess: boolean
    onDeployFailure: boolean
    onServiceCrash: boolean
    onNewDeployment: boolean
  }) => Promise<void>
  testNotification: () => Promise<void>
}

declare global {
  interface Window {
    railway: RailwayAPI
  }
}
