import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/app/layout/AppShell"

import { HomePage } from "@/pages/home/HomePage"
import { CompaniesPage } from "@/pages/companies/CompaniesPage"
import { DiscoverPage } from "@/pages/companies/discover/DiscoverPage"
import { ScrapePage } from "@/pages/companies/scrape/ScrapePage"
import { MonitorPage } from "@/pages/companies/monitor/MonitorPage"
import { JobsPage } from "@/pages/jobs/JobsPage"
import { FindPage } from "@/pages/jobs/find/FindPage"
import { ApplyPage } from "@/pages/jobs/apply/ApplyPage"
import { EditorPage } from "@/pages/editor/EditorPage"
import { MatchPage } from "@/pages/editor/match/MatchPage"
import { ResumePage } from "@/pages/editor/resume/ResumePage"
import { AgentsPage } from "@/pages/agents/AgentsPage"
import { CreatePage } from "@/pages/agents/create/CreatePage"
import { RunPage } from "@/pages/agents/run/RunPage"
import { SettingsPage } from "@/pages/settings/SettingsPage"

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />

          <Route path="companies" element={<CompaniesPage />} />
          <Route path="companies/discover" element={<DiscoverPage />} />
          <Route path="companies/scrape" element={<ScrapePage />} />
          <Route path="companies/monitor" element={<MonitorPage />} />

          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/find" element={<FindPage />} />
          <Route path="jobs/apply" element={<ApplyPage />} />

          <Route path="editor" element={<EditorPage />} />
          <Route path="editor/match" element={<MatchPage />} />
          <Route path="editor/resume" element={<ResumePage />} />

          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/create" element={<CreatePage />} />
          <Route path="agents/run" element={<RunPage />} />

          <Route path="settings" element={<SettingsPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
