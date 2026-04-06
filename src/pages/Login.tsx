import React, { useState } from 'react'
import { ArrowRight, CheckCircle2, AlertCircle, Loader2, Globe } from 'lucide-react'

function RailheadIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="7" y="6" width="18" height="5" rx="1.5" fill="currentColor" />
      <rect x="13" y="11" width="6" height="12" rx="1" fill="currentColor" />
      <rect x="5" y="23" width="22" height="4" rx="1.5" fill="currentColor" />
    </svg>
  )
}

interface LoginProps {
  onLoginSuccess: () => void
}

type LoginState = 'idle' | 'starting' | 'waiting' | 'success' | 'error'

function Login({ onLoginSuccess }: LoginProps): React.JSX.Element {
  const [state, setState] = useState<LoginState>('idle')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleLogin = async () => {
    setState('starting')
    setPairingCode(null)
    setErrorMsg('')

    try {
      await window.railway.login((progress) => {
        if (progress.type === 'url' || progress.type === 'status') {
          setState('waiting')
        }
        if (progress.type === 'code') {
          setPairingCode(progress.message)
          setState('waiting')
        }
        if (progress.type === 'success') {
          setState('success')
        }
      })
      setState('success')
      setTimeout(() => onLoginSuccess(), 1000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.'
      setErrorMsg(msg)
      setState('error')
    }
  }

  return (
    <div className="flex items-center justify-center h-full bg-bg">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-purple-900/5 pointer-events-none" />

      <div className="relative w-full max-w-md mx-4">
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center justify-center mb-8">
            <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center shadow-lg shadow-accent/25">
              <RailheadIcon size={28} className="text-white" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-text-primary mb-2">Railhead</h1>
            <p className="text-text-secondary text-sm leading-relaxed">
              Sign in to Railway to manage your projects, deployments, and environments.
            </p>
          </div>

          {/* Status: waiting for browser */}
          {(state === 'starting' || state === 'waiting') && (
            <div className="mb-6 p-4 bg-accent/5 border border-accent/20 rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <Globe size={16} className="text-accent shrink-0" />
                <p className="text-text-primary text-sm font-medium">
                  {state === 'starting' ? 'Opening browser...' : 'Complete login in your browser'}
                </p>
              </div>

              {pairingCode && (
                <div className="ml-7">
                  <p className="text-text-secondary text-xs mb-1">Pairing code</p>
                  <code className="text-accent font-mono font-bold text-lg tracking-wider">
                    {pairingCode}
                  </code>
                  <p className="text-text-secondary text-xs mt-1">
                    Confirm this code matches what you see in the browser.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 ml-7">
                <Loader2 size={13} className="animate-spin text-accent" />
                <span className="text-text-secondary text-xs">Waiting for authentication...</span>
              </div>
            </div>
          )}

          {/* Success */}
          {state === 'success' && (
            <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/20 rounded-xl mb-6">
              <CheckCircle2 size={18} className="text-success shrink-0" />
              <p className="text-success text-sm font-medium">Successfully authenticated!</p>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/20 rounded-xl mb-6">
              <AlertCircle size={16} className="text-error shrink-0 mt-0.5" />
              <div>
                <p className="text-error text-sm font-medium">Login failed</p>
                <p className="text-error/80 text-xs mt-1">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Button */}
          <button
            onClick={handleLogin}
            disabled={state === 'starting' || state === 'waiting' || state === 'success'}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-semibold text-sm transition-all shadow-lg shadow-accent/25"
          >
            {state === 'starting' || state === 'waiting' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Waiting for browser...
              </>
            ) : state === 'success' ? (
              <>
                <CheckCircle2 size={16} />
                Signed in!
              </>
            ) : (
              <>
                Sign in with Railway
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {state === 'idle' && (
            <p className="text-text-secondary/60 text-xs text-center mt-4">
              Opens railway.com in your browser for secure OAuth login.
            </p>
          )}
        </div>

        <p className="text-center text-text-secondary/40 text-xs mt-4">Railhead v1.0.0</p>
      </div>
    </div>
  )
}

export default Login
