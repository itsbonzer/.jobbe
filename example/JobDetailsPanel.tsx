import { getEffectiveUpdatedDate, type JobRow } from "@/modules/jobs/types"

type JobDetailsPanelProps = {
  job: JobRow | null
}

function renderBoolean(value: boolean): string {
  return value ? "Yes" : "No"
}

export function JobDetailsPanel({ job }: JobDetailsPanelProps) {
  if (!job) {
    return (
      <section className="jobs-details-panel">
        <h2 className="jobs-details-panel__title">Job Details</h2>
        <p className="jobs-details-panel__empty">
          Select a job row to preview its full description.
        </p>
      </section>
    )
  }

  const effectiveUpdatedDate = getEffectiveUpdatedDate(job)

  return (
    <section className="jobs-details-panel">
      <h2 className="jobs-details-panel__title">{job.job_title}</h2>

      <dl className="jobs-details-panel__meta">
        <div>
          <dt>Company</dt>
          <dd>{job.company}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{job.location}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{job.department}</dd>
        </div>
        <div>
          <dt>Remote</dt>
          <dd>{renderBoolean(job.is_remote)}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>{job.date_published ?? "-"}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{effectiveUpdatedDate ?? "-"}</dd>
        </div>
      </dl>

      <h3 className="jobs-details-panel__subtitle">Description</h3>
      <p className="jobs-details-panel__description">{job.job_description}</p>
    </section>
  )
}
