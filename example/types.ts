export type JobsTableName = "jobs" | "apply"

export type JobRow = {
  job_url: string
  company: string
  job_title: string
  job_description: string
  location: string
  salary: string
  is_remote: boolean
  workplace_type: string
  department: string
  date_published: string | null
  date_updated: string | null
  first_seen_at?: string | null
  status?: string | null
  keywords?: string | null
}

export type GroupRow = {
  __group: true
  child_count: number
} & Record<string, unknown>

export type CompanyGroupRow = GroupRow

export type JobsGridRow = JobRow | GroupRow

export type GridSort = {
  colId: string
  sort: "asc" | "desc"
}

export type JobsGridQuery = {
  startRow: number
  endRow: number
  sortModel: GridSort[]
  filterModel: Record<string, unknown>
  rowGroupCols: Array<{ id: string; field: string }>
  groupKeys: string[]
}

export type JobsGridResponse = {
  rows: JobsGridRow[]
  lastRow: number
}

export type TransferJobsToApplyPayload = {
  selectedJobUrls: string[]
}

export type TransferJobsToApplyResult = {
  added: number
  skippedDuplicates: number
  warning: string | null
}

export function isGroupRow(row: JobsGridRow): row is GroupRow {
  return "__group" in row && row.__group === true
}

export function isCompanyGroupRow(row: JobsGridRow): row is GroupRow {
  return isGroupRow(row)
}

export function getEffectiveUpdatedDate(row: JobRow): string | null {
  return row.date_updated ?? row.date_published
}

function toUtcDayStamp(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function getDaysSinceUpdated(row: JobRow, now: Date = new Date()): number | null {
  const effectiveUpdatedDate = getEffectiveUpdatedDate(row)
  if (!effectiveUpdatedDate) {
    return null
  }

  const updatedDate = new Date(effectiveUpdatedDate)
  if (Number.isNaN(updatedDate.getTime())) {
    return null
  }

  const dayDiff = Math.floor((toUtcDayStamp(now) - toUtcDayStamp(updatedDate)) / 86400000)
  return dayDiff < 0 ? 0 : dayDiff
}
