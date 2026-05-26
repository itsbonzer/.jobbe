import { useCallback, useEffect, useState } from "react"
import { Outlet } from "react-router-dom"

import { Sidebar } from "@/app/navigation/Sidebar"
import { AppBreadcrumbs } from "@/app/layout/AppBreadcrumbs"

import "./app.css"

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed"

function readPersistedCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(readPersistedCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0")
    } catch {
      // in-memory state is still correct on quota errors
    }
  }, [collapsed])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  return (
    <div className={`app ${collapsed ? "app--collapsed" : ""}`}>
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      <div className="content">
        <header className="content-header">
          <AppBreadcrumbs />
        </header>
        <main className="content-body">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
