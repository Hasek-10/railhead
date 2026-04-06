import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Trash2, Copy, Check } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  data?: string
  onClear?: () => void
  className?: string
  style?: React.CSSProperties
}

// We expose methods via ref
export interface TerminalHandle {
  write: (data: string) => void
  clear: () => void
  fit: () => void
}

const TerminalComponent = React.forwardRef<TerminalHandle, TerminalProps>(
  ({ onClear, className = '', style }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const xtermRef = useRef<XTerm | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const [copied, setCopied] = React.useState(false)

    useEffect(() => {
      if (!containerRef.current) return

      const term = new XTerm({
        theme: {
          background: '#0f1117',
          foreground: '#e2e8f0',
          cursor: '#7c3aed',
          cursorAccent: '#1b1e27',
          black: '#1b1e27',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#e2e8f0',
          brightBlack: '#4b5563',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#f8fafc',
          selectionBackground: '#7c3aed55',
        },
        fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 5000,
        convertEol: true,
        allowTransparency: false,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      term.open(containerRef.current)
      fitAddon.fit()

      xtermRef.current = term
      fitAddonRef.current = fitAddon

      // Write welcome message
      term.writeln('\x1b[38;5;97m Railhead Terminal\x1b[0m')
      term.writeln('\x1b[38;5;240m─────────────────────\x1b[0m')
      term.writeln('')

      const handleResize = () => {
        fitAddon.fit()
      }

      const resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(containerRef.current)

      return () => {
        resizeObserver.disconnect()
        term.dispose()
      }
    }, [])

    // Expose imperative handle
    React.useImperativeHandle(ref, () => ({
      write: (data: string) => {
        xtermRef.current?.write(data)
      },
      clear: () => {
        xtermRef.current?.clear()
        xtermRef.current?.writeln('\x1b[38;5;97m Railhead Terminal\x1b[0m')
        xtermRef.current?.writeln('\x1b[38;5;240m─────────────────────\x1b[0m')
        xtermRef.current?.writeln('')
      },
      fit: () => {
        fitAddonRef.current?.fit()
      },
    }))

    const handleClear = useCallback(() => {
      xtermRef.current?.clear()
      xtermRef.current?.writeln('\x1b[38;5;97m Railhead Terminal\x1b[0m')
      xtermRef.current?.writeln('\x1b[38;5;240m─────────────────────\x1b[0m')
      xtermRef.current?.writeln('')
      onClear?.()
    }, [onClear])

    const handleCopy = useCallback(() => {
      const selection = xtermRef.current?.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }
    }, [])

    return (
      <div className={`flex flex-col bg-[#0f1117] rounded-lg border border-border overflow-hidden ${className}`} style={style}>
        {/* Terminal toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-border shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-error/70" />
            <div className="w-3 h-3 rounded-full bg-warning/70" />
            <div className="w-3 h-3 rounded-full bg-success/70" />
            <span className="ml-2 text-xs text-text-secondary font-mono">output</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
              title="Copy selection"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
              title="Clear terminal"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>
        </div>
        {/* Terminal content */}
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      </div>
    )
  }
)

TerminalComponent.displayName = 'Terminal'

export default TerminalComponent
