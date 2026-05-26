import homeIcon from "@/assets/home.png"
import companiesIcon from "@/assets/companies.png"
import jobsIcon from "@/assets/jobs.png"
import editorIcon from "@/assets/editor.png"
import agentsIcon from "@/assets/agents.png"
import settingsIcon from "@/assets/settings.png"

export type NavSubItem = {
  path: string
  label: string
  icon: string
}

export type NavMainItem = {
  path: string
  label: string
  icon: string
  children?: NavSubItem[]
}

export const NAV_ITEMS: NavMainItem[] = [
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

export const FOOTER_ITEMS: NavMainItem[] = [
  { path: "/settings", label: "Settings", icon: settingsIcon },
]

/**
 * Flat path → label lookup used by breadcrumbs and any other component
 * that needs to render a label for a known route.
 */
export const PATH_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = { "/": "Home" }
  for (const item of [...NAV_ITEMS, ...FOOTER_ITEMS]) {
    if (item.path !== "/") map[item.path] = item.label
    if (item.children) {
      for (const child of item.children) map[child.path] = child.label
    }
  }
  return map
})()
