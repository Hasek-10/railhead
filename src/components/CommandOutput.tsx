import React from 'react'
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface CommandOutputProps {
  output: string
  isLoading?: boolean
  exitCode?: number | null
  className?: string
  label?: string
}

function CommandOutput({
  output,
  isLoading = false,
  exitCode = null,
  className = '',
  label,
}: CommandOutputProps): React.JSX.Element {
  const lines = output.split('\n').filter((line) => line.trim() !== '')

  const getStatusIcon = () => {
    if (isLoading) return <Loader2 size={14} className="text-accent animate-spin" />
    if (exitCode === null) return null
    if (exitCode === 0) return <CheckCircle2 size={14} className="text-success" />
    return <XCircle size={14} className="text-error" />
  }

  const getStatusColor = () => {
    if (isLoading) return 'border-accent/30'
    if (exitCode === null) return 'border-border'
    if (exitCode === 0) return 'border-success/30'
    return 'border-error/30'
  }

  return (
    <div className={`rounded-lg border bg-[#0f1117] overflow-hidden ${getStatusColor()} ${className}`}>
      {label && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
          <span className="text-xs text-text-secondary font-mono">{label}</span>
          <div className="flex items-center gap-1.5">
            {getStatusIcon()}
            {exitCode !== null && !isLoading && (
              <span className={`text-xs font-mono ${exitCode === 0 ? 'text-success' : 'text-error'}`}>
                exit {exitCode}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="p-3 overflow-auto max-h-64">
        {isLoading && lines.length === 0 ? (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <Loader2 size={14} className="animate-spin" />
            <span>Running...</span>
          </div>
        ) : lines.length === 0 ? (
          <p className="text-text-secondary text-xs italic">No output</p>
        ) : (
          <pre className="text-sm font-mono text-text-primary whitespace-pre-wrap leading-relaxed">
            {lines.map((line, i) => {
              // Color error lines red
              const isError = /error|failed|fatal/i.test(line)
              const isSuccess = /success|complete|done|ok/i.test(line)
              const isWarning = /warn|warning/i.test(line)
              return (
                <span
                  key={i}
                  className={`block ${
                    isError
                      ? 'text-error'
                      : isSuccess
                      ? 'text-success'
                      : isWarning
                      ? 'text-warning'
                      : 'text-text-primary'
                  }`}
                >
                  {line}
                </span>
              )
            })}
          </pre>
        )}
      </div>
    </div>
  )
}

export default CommandOutput
