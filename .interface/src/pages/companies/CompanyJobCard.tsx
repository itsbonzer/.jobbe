import { BoxOutArrowUpIcon } from "@exawizards/exabase-design-system-icons-react"

import { getEffectiveUpdatedDate, type JobRow } from "@/pages/jobs/find/types"

export type CompanyJobCardProps = {
  job: JobRow
  isSelected: boolean
  onClick: () => void
  onApply: () => void
}

export function CompanyJobCard({
  job,
  isSelected,
  onClick,
  onApply,
}: CompanyJobCardProps) {
  const effectiveUpdated = getEffectiveUpdatedDate(job)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`company-job-card${
        isSelected ? " company-job-card--selected" : ""
      }`}
    >
      <div className="company-job-card__meta">
        <span className="company-job-card__meta-company">{job.company}</span>
        <span className="company-job-card__meta-dot" aria-hidden="true">
          ·
        </span>
        <span className="company-job-card__meta-item">
          {job.salary || "—"}
        </span>
        <span className="company-job-card__meta-dot" aria-hidden="true">
          ·
        </span>
        <span className="company-job-card__meta-item">
          {formatPostedDate(effectiveUpdated)}
        </span>
      </div>

      <div className="company-job-card__title">{job.job_title}</div>

      <div className="company-job-card__bottom">
        <div className="company-job-card__bottom-left">
          <span className="company-job-card__location">
            {job.location || "Location not listed"}
          </span>
          {job.workplace_type ? (
            <span className="company-job-card__chip">{job.workplace_type}</span>
          ) : null}
        </div>
        <span
          role="button"
          tabIndex={0}
          aria-label={`Apply to ${job.job_title}`}
          onClick={(event) => {
            event.stopPropagation()
            onApply()
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              event.stopPropagation()
              onApply()
            }
          }}
          className="company-job-card__apply"
        >
          <BoxOutArrowUpIcon aria-hidden="true" />
          <span>Apply</span>
        </span>
      </div>
    </button>
  )
}

function formatPostedDate(iso: string | null): string {
  if (!iso) {
    return "—"
  }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return "—"
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
