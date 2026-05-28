import { CompanyJobCard } from "./CompanyJobCard"
import type { JobRow } from "./types"

export type CompanyJobsListProps = {
  jobs: JobRow[]
  selectedJobUrl: string | null
  onSelectJob: (job: JobRow) => void
  onApplyToJob: (job: JobRow) => void
}

export function CompanyJobsList({
  jobs,
  selectedJobUrl,
  onSelectJob,
  onApplyToJob,
}: CompanyJobsListProps) {
  if (jobs.length === 0) {
    return (
      <div className="company-jobs-list__empty">
        No jobs available for this company.
      </div>
    )
  }

  return (
    <div className="company-jobs-list">
      {jobs.map((job) => (
        <CompanyJobCard
          key={job.job_url}
          job={job}
          isSelected={job.job_url === selectedJobUrl}
          onClick={() => onSelectJob(job)}
          onApply={() => onApplyToJob(job)}
        />
      ))}
    </div>
  )
}
