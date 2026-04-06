import React, { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { prefetchProjects, invalidateProjects } from './cache'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Deploy from './pages/Deploy'
import Environment from './pages/Environment'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import Deployments from './pages/Deployments'
import Terminal from './pages/Terminal'
import Services from './pages/Services'
import DeploymentDiff from './pages/DeploymentDiff'

class TerminalErrorBoundary extends React.Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div className="p-6 flex flex-col gap-3">
          <p className="text-error font-semibold">Terminal failed to load</p>
          <pre className="text-xs text-text-secondary bg-surface border border-border rounded-lg p-4 overflow-auto whitespace-pre-wrap">
            {err.message}
            {err.stack ? '\n\n' + err.stack : ''}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="self-start px-3 py-1.5 bg-accent hover:bg-accent/80 text-white rounded-md text-sm"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export interface AppState {
  isLoggedIn: boolean
  username: string | null
  currentDirectory: string
}

function App(): React.JSX.Element {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [currentDirectory, setCurrentDirectory] = useState<string>('')

  useEffect(() => {
    checkAuthStatus()
    loadWorkingDirectory()
  }, [])

  const checkAuthStatus = async () => {
    try {
      // Fast check: just see if a token is saved (no CLI call)
      const hasToken = await window.railway.hasToken()
      setIsLoggedIn(hasToken)
      if (hasToken) {
        // Fetch username in background — don't block UI
        window.railway.whoami().then(setUsername).catch(() => setUsername(null))
        // Pre-fetch projects list so pages render instantly on first navigation
        prefetchProjects().catch(() => {})
      }
    } catch {
      setIsLoggedIn(false)
    }
  }

  const loadWorkingDirectory = async () => {
    try {
      const dir = await window.railway.getWorkingDirectory()
      setCurrentDirectory(dir)
    } catch {
      setCurrentDirectory('~')
    }
  }

  const handleLoginSuccess = async () => {
    setIsLoggedIn(true)
    prefetchProjects().catch(() => {})
    try {
      const user = await window.railway.whoami()
      setUsername(user)
    } catch {
      setUsername(null)
    }
  }

  const handleLogout = async () => {
    invalidateProjects()
    try {
      await window.railway.logout()
    } catch {
      // ignore
    }
    setIsLoggedIn(false)
    setUsername(null)
  }

  // Loading state
  if (isLoggedIn === null) {
    return (
      <div className="flex items-center justify-center h-full bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">Checking authentication...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
      />
    )
  }

  return (
    <HashRouter>
      <Layout
        username={username}
        onLogout={handleLogout}
        currentDirectory={currentDirectory}
        onDirectoryChange={setCurrentDirectory}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard currentDirectory={currentDirectory} />} />
          <Route
            path="/projects"
            element={
              <Projects
                currentDirectory={currentDirectory}
                onDirectoryChange={setCurrentDirectory}
              />
            }
          />
          <Route
            path="/deploy"
            element={
              <Deploy
                currentDirectory={currentDirectory}
                onDirectoryChange={setCurrentDirectory}
              />
            }
          />
          <Route path="/logs" element={<Logs />} />
          <Route path="/deployments" element={<Deployments />} />
          <Route path="/terminal" element={<TerminalErrorBoundary><Terminal /></TerminalErrorBoundary>} />
          <Route path="/services" element={<Services />} />
          <Route path="/diff" element={<DeploymentDiff />} />
          <Route
            path="/environment"
            element={<Environment currentDirectory={currentDirectory} />}
          />
          <Route
            path="/settings"
            element={<Settings currentDirectory={currentDirectory} />}
          />
        </Routes>
      </Layout>
    </HashRouter>
  )
}

export default App
