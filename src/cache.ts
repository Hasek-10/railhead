/**
 * Thin pre-fetch / cache layer.
 *
 * Goals:
 *  - Start the slow `railway list` CLI call the moment the user is authenticated,
 *    before they navigate to any page.
 *  - Deduplicate concurrent callers: if two pages mount at the same time they
 *    share one in-flight promise.
 *  - Serve from cache for subsequent navigations so pages render instantly.
 *  - TTL-based staleness so data refreshes automatically.
 */

export interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

const PROJECTS_TTL     = 60_000 // 1 min  — project list changes rarely
const SERVICE_TTL      = 30_000 // 30 s   — statuses change more often

// ─── Projects list ────────────────────────────────────────────────────────

let _projectsPromise:   Promise<CommandResult> | null = null
let _projectsResult:    CommandResult | null           = null
let _projectsFetchedAt: number                         = 0

/** Start (or join an in-flight) fetch for the projects list. */
export function prefetchProjects(): Promise<CommandResult> {
  const now = Date.now()

  // Already resolved in cache and still fresh → instant resolved promise
  if (_projectsResult && now - _projectsFetchedAt < PROJECTS_TTL) {
    return Promise.resolve(_projectsResult)
  }

  // Join existing in-flight request
  if (_projectsPromise) return _projectsPromise

  _projectsPromise = window.railway.list().then(r => {
    _projectsResult    = r
    _projectsFetchedAt = Date.now()
    _projectsPromise   = null
    return r
  }).catch(e => {
    _projectsPromise = null
    throw e
  })

  return _projectsPromise
}

/** Return cached result synchronously, or null if not yet available / stale. */
export function getCachedProjects(): CommandResult | null {
  if (_projectsResult && Date.now() - _projectsFetchedAt < PROJECTS_TTL) {
    return _projectsResult
  }
  return null
}

/** Force next call to re-fetch (e.g. after creating / deleting a project). */
export function invalidateProjects(): void {
  _projectsResult    = null
  _projectsPromise   = null
  _projectsFetchedAt = 0
}

// ─── Service statuses (keyed by "projectId:envId") ────────────────────────

interface StatusEntry {
  promise:   Promise<CommandResult> | null
  result:    CommandResult | null
  fetchedAt: number
}

const _statusCache = new Map<string, StatusEntry>()

/** Start (or join an in-flight) service-status fetch for a project/env pair. */
export function prefetchServiceStatus(projectId: string, envId: string): Promise<CommandResult> {
  const key   = `${projectId}:${envId}`
  const now   = Date.now()
  const entry = _statusCache.get(key)

  if (entry?.result && now - entry.fetchedAt < SERVICE_TTL) {
    return Promise.resolve(entry.result)
  }

  if (entry?.promise) return entry.promise

  const promise = window.railway.serviceStatus(projectId, envId).then(r => {
    const e = _statusCache.get(key)!
    e.result    = r
    e.fetchedAt = Date.now()
    e.promise   = null
    return r
  }).catch(err => {
    const e = _statusCache.get(key)
    if (e) e.promise = null
    throw err
  })

  _statusCache.set(key, {
    promise,
    result:    entry?.result    ?? null,
    fetchedAt: entry?.fetchedAt ?? 0,
  })

  return promise
}

/** Return cached service status synchronously, or null. */
export function getCachedServiceStatus(projectId: string, envId: string): CommandResult | null {
  const entry = _statusCache.get(`${projectId}:${envId}`)
  if (entry?.result && Date.now() - entry.fetchedAt < SERVICE_TTL) return entry.result
  return null
}

/** Invalidate cached service statuses (optionally scoped to one project). */
export function invalidateServiceStatus(projectId?: string): void {
  if (projectId) {
    for (const key of _statusCache.keys()) {
      if (key.startsWith(`${projectId}:`)) _statusCache.delete(key)
    }
  } else {
    _statusCache.clear()
  }
}
