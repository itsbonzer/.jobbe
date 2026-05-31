export type JobsTableName = "jobs" | "apply"

export type GridSort = {
  colId: string
  sort: "asc" | "desc"
}

export type RowGroupColumn = {
  id: string
  field: string
}

export type JobsGridRequest = {
  table: JobsTableName
  startRow: number
  endRow: number
  sortModel: GridSort[]
  filterModel: Record<string, unknown>
  rowGroupCols: RowGroupColumn[]
  groupKeys: string[]
}

export type JobsDistinctRequest = {
  table: JobsTableName
  column: string
}

export type JobPatchRequest = {
  table: JobsTableName
  patch: Partial<JobRow>
}

export type JobPatchResponse = {
  updated: number
}

export type JobDeleteRequest = {
  table: JobsTableName
  jobUrls: string[]
}

export type JobDeleteResponse = {
  deleted: number
}

export type JobPromoteResponse = {
  promoted: number
}

export type JobRow = {
  job_url: string
  company: string
  job_title: string
  location: string | null
  department: string | null
  job_description: string | null
  salary: string | null
  date_published: string | null
  date_updated: string | null
  ats: string | null
  is_listed: boolean | null
  is_remote: boolean | null
  workplace_type: string | null
  education: string | null
  experience: string | null
  telecommuting: boolean | null
  first_seen_at: string | null
  last_seen_at: string | null
  last_seen_run_id: string | null
  status?: string | null
  keywords?: string | null
}

export type GroupRow = {
  __group: true
  child_count: number
} & Record<string, unknown>

export type JobsGridRow = JobRow | GroupRow

export type JobsGridResponse = {
  rows: JobsGridRow[]
  lastRow: number
}

export type JobsDistinctResponse = {
  values: Array<string | null>
}

export function isGroupRow(row: JobsGridRow | undefined): row is GroupRow {
  return Boolean(row && "__group" in row && row.__group === true)
}

export function getEffectiveUpdatedDate(row: JobRow): string | null {
  return row.date_updated ?? row.date_published
}

function toUtcDayStamp(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function getDaysSinceUpdated(
  row: JobRow,
  now: Date = new Date(),
): number | null {
  const effectiveUpdatedDate = getEffectiveUpdatedDate(row)
  if (!effectiveUpdatedDate) {
    return null
  }

  const updatedDate = new Date(effectiveUpdatedDate)
  if (Number.isNaN(updatedDate.getTime())) {
    return null
  }

  const dayDiff = Math.floor(
    (toUtcDayStamp(now) - toUtcDayStamp(updatedDate)) / 86400000,
  )
  return dayDiff < 0 ? 0 : dayDiff
}
