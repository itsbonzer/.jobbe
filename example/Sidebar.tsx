import { useCallback, useEffect, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { RiArrowRightSLine } from "@remixicon/react"

import jobbeLogo from "@/assets/jobbe_logo.png"
import jobbeFavicon from "@/assets/jobbe_favicon.png"
import collapseIcon from "@/assets/sidebar-collapse.png"

import homeIcon from "@/assets/home.png"
import companiesIcon from "@/assets/companies.png"
import jobsIcon from "@/assets/jobs.png"
import editorIcon from "@/assets/editor.png"
import agentsIcon from "@/assets/agents.png"
import settingsIcon from "@/assets/settings.png"

import "./sidebar.css"

type NavSubItem = {
  path: string
  label: string
  icon: string
}

type NavMainItem = {
  path: string
  label: string
  icon: string
  children?: NavSubItem[]
}

const NAV_ITEMS: NavMainItem[] = [
  { path: "/", label: "Home", icon: homeIcon },
  {
    path: "/companies",
    label: "Companies",
    icon: companiesIcon,
    children: [
      { path: "/companies/discover", label: "Discover", icon: companiesIcon },
      { path: "/companies/scrape", label: "Scrape", icon: companiesIcon },
      { path: "/companies/monitor", label: "Monitor", icon: companiesIcon },
    ],
  },
  {
    path: "/jobs",
    label: "Jobs",
    icon: jobsIcon,
    children: [
      { path: "/jobs/find", label: "Find", icon: jobsIcon },
      { path: "/jobs/apply", label: "Apply", icon: jobsIcon },
    ],
  },
  {
    path: "/editor",
    label: "Editor",
    icon: editorIcon,
    children: [
      { path: "/editor/match", label: "Match", icon: editorIcon },
      { path: "/editor/resume", label: "Resume", icon: editorIcon },
    ],
  },
  {
    path: "/agents",
    label: "Agents",
    icon: agentsIcon,
    children: [
      { path: "/agents/create", label: "Create", icon: agentsIcon },
      { path: "/agents/run", label: "Run", icon: agentsIcon },
    ],
  },
]

const FOOTER_ITEMS: NavMainItem[] = [
  { path: "/settings", label: "Settings", icon: settingsIcon },
]

const EXPANDED_STORAGE_KEY = "sidebar-expanded-groups"

function readPersistedExpanded(): string[] {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : []
  } catch {
    return []
  }
}

function initialExpanded(pathname: string): Set<string> {
  const set = new Set(readPersistedExpanded())
  for (const item of NAV_ITEMS) {
    if (!item.children) continue
    if (pathname === item.path || pathname.startsWith(item.path + "/")) {
      set.add(item.path)
    }
  }
  return set
}

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation()
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    initialExpanded(location.pathname)
  )

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const item of NAV_ITEMS) {
        if (!item.children) continue
        // Only auto-expand when on a sub-route; clicking the main item itself
        // is handled by the row's onClick so it can freely toggle.
        if (location.pathname.startsWith(item.path + "/")) {
          next.add(item.path)
        }
      }
      return next
    })
  }, [location.pathname])

  useEffect(() => {
    try {
      localStorage.setItem(
        EXPANDED_STORAGE_KEY,
        JSON.stringify(Array.from(expanded))
      )
    } catch {
      // swallow quota/serialization errors; in-memory state is still correct
    }
  }, [expanded])

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      {/* Brand zone */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img
            src={collapsed ? jobbeFavicon : jobbeLogo}
            alt="jobbe"
            className={collapsed ? "sidebar-logo-favicon" : "sidebar-logo-full"}
          />
        </div>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <img src={collapseIcon} alt="" className="sidebar-collapse-icon" />
        </button>
      </div>

      {/* Nav zone */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <MainNavItem
            key={item.path}
            item={item}
            isExpanded={expanded.has(item.path)}
            onToggle={toggle}
            sidebarCollapsed={collapsed}
          />
        ))}
      </nav>

      {/* Footer zone */}
      <div className="sidebar-footer">
        {FOOTER_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "sidebar-nav-item--active" : ""}`
            }
          >
            <img
              src={item.icon}
              alt=""
              className="sidebar-nav-icon"
              draggable={false}
            />
            <span className="sidebar-nav-label">{item.label}</span>
          </NavLink>
        ))}

        <div className="sidebar-brand-footer">
          <div className="sidebar-brand-footer-identity">
            <img
              src={jobbeFavicon}
              alt="Jobbe"
              className="sidebar-brand-footer-icon"
              draggable={false}
            />
            <span className="sidebar-brand-footer-label">Jobbe</span>
          </div>
          <button
            type="button"
            className="sidebar-brand-footer-menu"
            aria-label="Open menu"
          >
            <span aria-hidden="true">&#8230;</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

type MainNavItemProps = {
  item: NavMainItem
  isExpanded: boolean
  onToggle: (path: string) => void
  sidebarCollapsed: boolean
}

function MainNavItem({
  item,
  isExpanded,
  onToggle,
  sidebarCollapsed,
}: MainNavItemProps) {
  const hasChildren = !!item.children && item.children.length > 0
  const showCaret = hasChildren && !sidebarCollapsed
  const renderChildren = hasChildren && !sidebarCollapsed
  const childrenOpen = renderChildren && isExpanded

  const handleRowClick = () => {
    if (hasChildren) {
      onToggle(item.path)
    }
  }

  const handleCaretClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onToggle(item.path)
  }

  return (
    <div className="sidebar-nav-group">
      <div className="sidebar-nav-main">
        <NavLink
          to={item.path}
          end
          onClick={handleRowClick}
          aria-expanded={hasChildren ? isExpanded : undefined}
          className={({ isActive }) =>
            `sidebar-nav-item sidebar-nav-item--main ${isActive ? "sidebar-nav-item--active" : ""}`
          }
        >
          <img
            src={item.icon}
            alt=""
            className="sidebar-nav-icon"
            draggable={false}
          />
          <span className="sidebar-nav-label">{item.label}</span>
        </NavLink>
        {showCaret && (
          <button
            type="button"
            className="sidebar-nav-caret-btn"
            onClick={handleCaretClick}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
            tabIndex={-1}
          >
            <RiArrowRightSLine
              aria-hidden="true"
              className={`sidebar-nav-caret ${isExpanded ? "sidebar-nav-caret--open" : ""}`}
            />
          </button>
        )}
      </div>
      {renderChildren && (
        <div
          className={`sidebar-nav-children ${childrenOpen ? "sidebar-nav-children--open" : ""}`}
        >
          <div className="sidebar-nav-children-inner">
            {item.children!.map((child) => (
              <NavLink
                key={child.path}
                to={child.path}
                className={({ isActive }) =>
                  `sidebar-nav-item sidebar-nav-item--sub ${isActive ? "sidebar-nav-item--active" : ""}`
                }
              >
                <img
                  src={item.icon}
                  alt=""
                  className="sidebar-nav-icon"
                  draggable={false}
                />
                <span className="sidebar-nav-label">{child.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
