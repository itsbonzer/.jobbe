import { useEffect, useState } from "react"
import { BoxOutArrowUpIcon } from "@exawizards/exabase-design-system-icons-react"

import { getEffectiveUpdatedDate, type JobRow } from "./types"

const DRAWER_TRANSITION_MS = 180

type JobDetailsPanelProps = {
  job: JobRow | null
  onClose: () => void
}

export function JobDetailsPanel({ job, onClose }: JobDetailsPanelProps) {
  const [displayJob, setDisplayJob] = useState<JobRow | null>(job)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (job) {
      setDisplayJob(job)
      const frame = window.requestAnimationFrame(() => setIsOpen(true))
      return () => window.cancelAnimationFrame(frame)
    }

    setIsOpen(false)
    const timeout = window.setTimeout(
      () => setDisplayJob(null),
      DRAWER_TRANSITION_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [job])

  useEffect(() => {
    if (!displayJob) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [displayJob, onClose])

  if (!displayJob) {
    return null
  }

  const effectiveUpdatedDate = getEffectiveUpdatedDate(displayJob)
  const remoteLabel = formatBoolean(displayJob.is_remote)

  return (
    <div
      className={`jobs-details-drawer ${isOpen ? "jobs-details-drawer--open" : ""}`}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="jobs-details-drawer__backdrop"
        aria-label="Close job details"
        onClick={onClose}
      />

      <aside className="jobs-details-panel">
        <header className="jobs-details-panel__header">
          <div className="jobs-details-panel__heading">
            <p className="jobs-details-panel__company">{displayJob.company}</p>
            <h2 className="jobs-details-panel__title">{displayJob.job_title}</h2>
          </div>
          <button
            type="button"
            className="jobs-details-panel__close"
            aria-label="Close job details"
            onClick={onClose}
          >
            &times;
          </button>
        </header>

        <dl className="jobs-details-panel__meta">
          <DetailTerm label="Location" value={displayJob.location} />
          <DetailTerm label="Department" value={displayJob.department} />
          <DetailTerm label="Salary" value={displayJob.salary} />
          <DetailTerm label="Remote" value={remoteLabel} />
          <DetailTerm label="Workplace" value={displayJob.workplace_type} />
          <DetailTerm label="ATS" value={displayJob.ats} />
          <DetailTerm label="Published" value={displayJob.date_published} />
          <DetailTerm label="Updated" value={effectiveUpdatedDate} />
        </dl>

        <div className="jobs-details-panel__section">
          <h3>Description</h3>
          <p>{displayJob.job_description?.trim() || "No description available."}</p>
        </div>

        <div className="jobs-details-panel__actions">
          <button
            type="button"
            className="jobs-grid-toolbar-button"
            onClick={() => openJobPost(displayJob.job_url)}
          >
            <BoxOutArrowUpIcon aria-hidden="true" />
            <span>Apply</span>
          </button>
        </div>
      </aside>
    </div>
  )
}

function DetailTerm({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  )
}

function formatBoolean(value: boolean | null): string | null {
  if (value === null) {
    return null
  }

  return value ? "Yes" : "No"
}

function openJobPost(jobUrl: string): void {
  const nextWindow = window.open(jobUrl, "_blank", "noopener,noreferrer")
  if (nextWindow) {
    nextWindow.opener = null
  }
}
