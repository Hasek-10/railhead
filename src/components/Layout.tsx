import React from 'react'
import Sidebar from './Sidebar'
import StatusBar from './StatusBar'

interface LayoutProps {
  children: React.ReactNode
  username: string | null
  onLogout: () => void
  currentDirectory: string
  onDirectoryChange: (dir: string) => void
}

function Layout({
  children,
  username,
  onLogout,
  currentDirectory,
  onDirectoryChange,
}: LayoutProps): React.JSX.Element {
  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <Sidebar
        username={username}
        onLogout={onLogout}
        currentDirectory={currentDirectory}
        onDirectoryChange={onDirectoryChange}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
        <StatusBar currentDirectory={currentDirectory} />
      </div>
    </div>
  )
}

export default Layout
