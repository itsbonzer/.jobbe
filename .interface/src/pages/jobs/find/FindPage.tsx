import { useState } from "react"

import { JobsGrid, type JobsGridState } from "./JobsGrid"

import "./find.css"

export function FindPage() {
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
    <section className="find-page">
      <header className="find-page-header">
        <div className="find-page-title-group">
          <h1 className="find-page-title">Find</h1>
          <span
            className={`find-page-status find-page-status--${statusTone}`}
            aria-live="polite"
          >
            {statusText}
          </span>
        </div>
      </header>

      <JobsGrid onStateChange={setGridState} />
    </section>
  )
}
