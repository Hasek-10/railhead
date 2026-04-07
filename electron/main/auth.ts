import { app, shell, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import { getEnv } from './railway'

const CONFIG_DIR = join(app.getPath('userData'), 'config')
const TOKEN_FILE = join(CONFIG_DIR, 'token.enc')
const LEGACY_TOKEN_FILE = join(CONFIG_DIR, 'token.json')

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

/**
 * Migrate plain-text token.json → encrypted token.enc.
 * Called once on load; removes the legacy file after successful migration.
 */
function migrateLegacyToken(): string | null {
  try {
    if (!existsSync(LEGACY_TOKEN_FILE)) return null
    const data = JSON.parse(readFileSync(LEGACY_TOKEN_FILE, 'utf-8'))
    const token = data.token
    if (token) {
      saveToken(token)
      unlinkSync(LEGACY_TOKEN_FILE)
      return token
    }
  } catch { /* ignore corrupt legacy file */ }
  return null
}

export function loadToken(): string | null {
  // Try encrypted store first
  try {
    if (existsSync(TOKEN_FILE)) {
      const encrypted = readFileSync(TOKEN_FILE)
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encrypted)
      }
      // safeStorage unavailable — fall through to legacy check
    }
  } catch { /* corrupt or wrong-key file — fall through */ }

  // Migrate legacy plain-text token if present
  const migrated = migrateLegacyToken()
  if (migrated) return migrated

  return null
}

export function saveToken(token: string): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token)
    writeFileSync(TOKEN_FILE, encrypted, { mode: 0o600 })
  } else {
    // Fallback: store plain-text if OS keychain is unavailable (rare)
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 })
  }
}

export function clearToken(): void {
  try {
    if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE)
  } catch { /* ignore */ }
  try {
    if (existsSync(LEGACY_TOKEN_FILE)) unlinkSync(LEGACY_TOKEN_FILE)
  } catch { /* ignore */ }
}

export interface LoginProgress {
  type: 'url' | 'code' | 'status' | 'success' | 'error'
  message: string
}

export function handleLogin(
  onProgress: (progress: LoginProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = getEnv()
    let resolved = false
    let urlOpened = false

    const finish = (success: boolean, err?: string) => {
      if (resolved) return
      resolved = true
      if (success) resolve()
      else reject(new Error(err || 'Login failed'))
    }

    // Use `script` to create a pseudo-TTY — required by railway login
    const proc = spawn(
      'script',
      ['-q', '-c', 'npx @railway/cli login --browserless', '/dev/null'],
      { env, shell: false }
    )

    let buffer = ''

    const handleOutput = (raw: string) => {
      buffer += raw
      const text = stripAnsi(raw)

      // Extract and open the login URL
      if (!urlOpened) {
        const urlMatch = text.match(/https:\/\/railway\.com\/cli-login\?[^\s\n\r\x1B]+/)
        if (urlMatch) {
          urlOpened = true
          const url = urlMatch[0].trim()
          onProgress({ type: 'url', message: url })
          shell.openExternal(url)
        }
      }

      // Extract pairing code
      const codeMatch = text.match(/pairing code is:\s*([a-z]+-[a-z]+-[a-z]+)/i)
      if (codeMatch) {
        onProgress({ type: 'code', message: codeMatch[1] })
      }

      // Status updates
      if (text.includes('Waiting for login')) {
        onProgress({ type: 'status', message: 'Waiting for browser authentication...' })
      }
      if (text.toLowerCase().includes('logged in') || text.toLowerCase().includes('successfully')) {
        onProgress({ type: 'success', message: text.trim() })
        finish(true)
      }
    }

    proc.stdout.on('data', (d: Buffer) => handleOutput(d.toString()))
    proc.stderr.on('data', (d: Buffer) => handleOutput(d.toString()))

    proc.on('close', (code) => {
      if (code === 0) finish(true)
      else finish(false, `Login exited with code ${code}`)
    })

    proc.on('error', (err) => finish(false, err.message))

    // 5 minute timeout
    setTimeout(() => {
      if (!resolved) {
        proc.kill()
        finish(false, 'Login timed out after 5 minutes')
      }
    }, 5 * 60 * 1000)
  })
}

export async function handleLogout(): Promise<void> {
  clearToken()
  const env = getEnv()
  return new Promise((resolve) => {
    const proc = spawn('npx', ['@railway/cli', 'logout'], { env, shell: true })
    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })
}
