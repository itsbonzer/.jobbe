export type { JobRow } from "@/pages/jobs/find/types"

export type CompanyDirectoryRow = {
  company: string
  workplace_type: string | null
  job_count: number
  latest_date_updated: string | null
  has_recent_alert: boolean
}
