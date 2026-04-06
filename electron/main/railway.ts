import { spawn } from 'child_process'
import { IpcMainEvent } from 'electron'
import * as path from 'path'
import * as os from 'os'

export interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

export interface RunOptions {
  cwd?: string
  token?: string
}

function buildEnv(token?: string): NodeJS.ProcessEnv {
  const extraPaths = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    path.join(os.homedir(), '.npm-global', 'bin'),
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.bun', 'bin'),
    '/usr/local/lib/node_modules/.bin',
  ]
  const existingPath = process.env.PATH || ''
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: [...extraPaths, existingPath].join(path.delimiter),
  }

  // Inject token only if explicitly provided or stored (falls back to CLI's own auth)
  const resolvedToken = token ?? getStoredToken()
  if (resolvedToken) {
    env['RAILWAY_API_TOKEN'] = resolvedToken
  }

  return env
}

// Lazy-loaded to avoid circular import with auth.ts
let _loadToken: (() => string | null) | null = null

function getStoredToken(): string | null {
  if (!_loadToken) {
    // Dynamically require to avoid circular dep
    try {
      _loadToken = require('./auth').loadToken
    } catch {
      return null
    }
  }
  return _loadToken ? _loadToken() : null
}

export function getEnv(token?: string): NodeJS.ProcessEnv {
  return buildEnv(token)
}

export async function runCommand(
  args: string[],
  options?: RunOptions
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const env = buildEnv(options?.token)
    const proc = spawn('npx', ['@railway/cli', ...args], {
      cwd: options?.cwd || process.cwd(),
      env,
      shell: true,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code: number | null) => {
      resolve({ stdout, stderr, code: code ?? 0 })
    })

    proc.on('error', (err: Error) => {
      resolve({ stdout, stderr: err.message, code: 1 })
    })
  })
}

export function streamCommand(
  event: IpcMainEvent,
  streamId: string,
  args: string[],
  options?: RunOptions
): () => void {
  const env = buildEnv(options?.token)
  const proc = spawn('npx', ['@railway/cli', ...args], {
    cwd: options?.cwd || process.cwd(),
    env,
    shell: true,
  })

  proc.stdout.on('data', (data: Buffer) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('stream-data', streamId, data.toString())
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('stream-data', streamId, data.toString())
    }
  })

  proc.on('close', (code: number | null) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('stream-end', streamId, code ?? 0)
    }
  })

  proc.on('error', (err: Error) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('stream-data', streamId, `Error: ${err.message}\r\n`)
      event.sender.send('stream-end', streamId, 1)
    }
  })

  return () => {
    proc.kill('SIGTERM')
  }
}

export async function checkLogin(): Promise<boolean> {
  try {
    const token = getStoredToken()
    if (!token) return false
    const result = await runCommand(['whoami'])
    return result.code === 0 && result.stdout.trim().length > 0
  } catch {
    return false
  }
}
