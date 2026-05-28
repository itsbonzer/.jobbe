import { useEffect, useRef, useState } from "react"
import {
  BoxOutArrowUpIcon,
  XmarkIcon,
} from "@exawizards/exabase-design-system-icons-react"

import { getEffectiveUpdatedDate, type JobRow } from "@/pages/jobs/find/types"

const ENTER_MS = 220
const EXIT_MS = 140

export type JobDescriptionPanelProps = {
  job: JobRow | null
  onClose: () => void
}

export function JobDescriptionPanel({ job, onClose }: JobDescriptionPanelProps) {
  const [displayJob, setDisplayJob] = useState<JobRow | null>(job)
  const [isVisible, setIsVisible] = useState<boolean>(job !== null)
  const lastJobRef = useRef<JobRow | null>(job)

  useEffect(() => {
    const previous = lastJobRef.current
    lastJobRef.current = job

    if (previous?.job_url === job?.job_url) {
      return
    }

    // null → null is impossible here (caught above), so each branch is a real transition.

    if (job === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsVisible(false)
      const timeout = window.setTimeout(() => setDisplayJob(null), EXIT_MS)
      return () => window.clearTimeout(timeout)
    }

    if (previous === null) {
      setDisplayJob(job)
      const frame = window.requestAnimationFrame(() => setIsVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }

    // Swap: exit current, then swap content and enter new.
    setIsVisible(false)
    let frameId: number | null = null
    const exitTimeout = window.setTimeout(() => {
      setDisplayJob(job)
      frameId = window.requestAnimationFrame(() => setIsVisible(true))
    }, EXIT_MS)
    return () => {
      window.clearTimeout(exitTimeout)
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
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
    return (
      <div className="company-description-empty">
        Select a job to see the description.
      </div>
    )
  }

  const updatedDate = getEffectiveUpdatedDate(displayJob)

  return (
    <article
      className={`company-description${
        isVisible ? " company-description--in" : ""
      }`}
      style={{
        ["--co-enter-ms" as string]: `${ENTER_MS}ms`,
        ["--co-exit-ms" as string]: `${EXIT_MS}ms`,
      }}
      aria-label={`${displayJob.job_title} at ${displayJob.company}`}
    >
      <header className="company-description__bar">
        <button
          type="button"
          className="company-description__apply"
          onClick={() => openJobPost(displayJob.job_url)}
        >
          <BoxOutArrowUpIcon aria-hidden="true" />
          <span>Apply</span>
        </button>
        <button
          type="button"
          className="company-description__close"
          aria-label="Close job description"
          onClick={onClose}
        >
          <XmarkIcon aria-hidden="true" />
        </button>
      </header>

      <div className="company-description__heading">
        <p className="company-description__company">{displayJob.company}</p>
        <h2 className="company-description__title">{displayJob.job_title}</h2>
      </div>

      <dl className="company-description__meta">
        <MetaRow label="Location" value={displayJob.location} />
        <MetaRow label="Workplace" value={displayJob.workplace_type} />
        <MetaRow label="Salary" value={displayJob.salary} />
        <MetaRow label="Posted" value={formatDate(displayJob.date_published)} />
        <MetaRow label="Updated" value={formatDate(updatedDate)} />
        <MetaRow label="ATS" value={displayJob.ats} />
      </dl>

      <section className="company-description__body">
        <h3 className="company-description__body-heading">Description</h3>
        <p className="company-description__body-text">
          {displayJob.job_description?.trim() || "No description available."}
        </p>
      </section>
    </article>
  )
}

function MetaRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="company-description__meta-row">
      <dt>{label}</dt>
      <dd>{value && value.trim().length > 0 ? value : "—"}</dd>
    </div>
  )
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) {
    return null
  }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function openJobPost(jobUrl: string): void {
  const nextWindow = window.open(jobUrl, "_blank", "noopener,noreferrer")
  if (nextWindow) {
    nextWindow.opener = null
  }
}
