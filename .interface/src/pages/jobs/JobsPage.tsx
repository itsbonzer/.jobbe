import { useState } from "react"

import { JobsGrid, type JobsGridState } from "./JobsGrid"

import "./jobs.css"

export function JobsPage() {
  const [gridState, setGridState] = useState<JobsGridState>({
    isLoading: true,
    isEmpty: false,
    error: null,
  })

  const statusText = gridState.error
    ? gridState.error
    : gridState.isLoading
      ? "Loading"
      : gridState.isEmpty
        ? "No rows"
        : "Ready"
  const statusTone = gridState.error
    ? "error"
    : gridState.isLoading
      ? "loading"
      : gridState.isEmpty
        ? "empty"
        : "ready"

  return (
    <section className="jobs-page">
      <header className="jobs-page-header">
        <div className="jobs-page-title-group">
          <h1 className="jobs-page-title">Jobs</h1>
          <span className={`jobs-page-status jobs-page-status--${statusTone}`} aria-live="polite">
            {statusText}
          </span>
        </div>
      </header>

      <JobsGrid onStateChange={setGridState} />
    </section>
  )
}
