import React, { useState, useEffect } from 'react'
import { Circle, Clock } from 'lucide-react'

interface StatusBarProps {
  currentDirectory: string
}

function StatusBar({ currentDirectory }: StatusBarProps): React.JSX.Element {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center justify-between px-4 py-1 bg-surface border-t border-border text-xs text-text-secondary shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Circle size={6} className="fill-success text-success" />
          <span>Connected</span>
        </div>
        <span className="text-border">|</span>
        <span className="font-mono truncate max-w-xs" title={currentDirectory}>
          {currentDirectory || '~'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Clock size={11} />
        <span className="font-mono">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

export default StatusBar
