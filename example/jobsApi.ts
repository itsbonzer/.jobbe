import {
  buildSupabaseHeaders,
  getRequiredSupabaseConfig,
  getSupabaseTableEndpoint,
  readSupabaseNetworkError,
  readSupabaseResponseError,
  type SupabaseApiResult,
  type SupabaseConfig,
} from "@/lib/supabaseRest"
import type { JobRow, JobsTableName } from "@/modules/jobs/types"

export type JobsApiResult<T> = SupabaseApiResult<T>

export type TransferJobsPayload = {
  source: JobsTableName
  target: JobsTableName
  jobUrls: string[]
}

export type TransferJobsResult = {
  added: number
  skippedDuplicates: number
  warning: string | null
}

const JOBS_TABLE = "jobs"
const APPLY_TABLE = "apply"
const SUPABASE_IN_FILTER_BATCH_SIZE = 100
const JOBS_SELECT_BASE =
  "job_url,company,job_title,job_description,location,salary,is_remote,workplace_type,department,date_published,date_updated"
const KEYWORDS_COLUMN = "keywords"
const APPLY_STATUS_COLUMN = "status"

function jobsSelect(tableName: JobsTableName): string {
  if (tableName === APPLY_TABLE) {
    return `${JOBS_SELECT_BASE},${KEYWORDS_COLUMN},${APPLY_STATUS_COLUMN}`
  }

  return JOBS_SELECT_BASE
}

export async function createSupabaseJob(job: JobRow): Promise<JobsApiResult<null>> {
  const configResult = getRequiredSupabaseConfig()

  if (!configResult.ok) {
    return configResult
  }

  return insertRows(configResult.data, JOBS_TABLE, [job], "Unable to create job in Supabase.")
}

export async function updateSupabaseRow(
  tableName: JobsTableName,
  jobUrl: string,
  patch: Partial<JobRow>,
): Promise<JobsApiResult<null>> {
  const configResult = getRequiredSupabaseConfig()

  if (!configResult.ok) {
    return configResult
  }

  return updateSupabaseRowInternal(
    configResult.data,
    tableName,
    jobUrl,
    patch,
    `Unable to update ${tableName} row in Supabase.`,
  )
}

export async function deleteSupabaseJobs(
  tableName: JobsTableName,
  jobUrls: string[],
): Promise<JobsApiResult<{ deleted: number }>> {
  const configResult = getRequiredSupabaseConfig()

  if (!configResult.ok) {
    return configResult
  }

  const normalized = normalizeSelectedJobUrls(jobUrls)
  if (normalized.length === 0) {
    return { ok: true, data: { deleted: 0 } }
  }

  for (let i = 0; i < normalized.length; i += SUPABASE_IN_FILTER_BATCH_SIZE) {
    const batch = normalized.slice(i, i + SUPABASE_IN_FILTER_BATCH_SIZE)
    const params = new URLSearchParams()
    params.set("job_url", `in.(${toInFilterValues(batch)})`)

    try {
      const response = await fetch(
        `${getTableEndpoint(configResult.data, tableName)}?${params.toString()}`,
        {
          method: "DELETE",
          headers: {
            ...buildSupabaseHeaders(configResult.data),
            Prefer: "return=minimal",
          },
        },
      )

      if (!response.ok) {
        return {
          ok: false,
          error: await readSupabaseResponseError(
            response,
            `Unable to delete ${tableName} rows from Supabase.`,
          ),
        }
      }
    } catch (error) {
      return {
        ok: false,
        error: readSupabaseNetworkError(error),
      }
    }
  }

  return { ok: true, data: { deleted: normalized.length } }
}

export async function transferJobs(
  payload: TransferJobsPayload,
): Promise<JobsApiResult<TransferJobsResult>> {
  const configResult = getRequiredSupabaseConfig()

  if (!configResult.ok) {
    return configResult
  }

  const { source, target } = payload
  const sourceLabel = humanTableLabel(source)
  const targetLabel = humanTableLabel(target)

  const selectedJobUrls = normalizeSelectedJobUrls(payload.jobUrls)

  if (selectedJobUrls.length === 0) {
    return {
      ok: true,
      data: {
        added: 0,
        skippedDuplicates: 0,
        warning: "Select at least one job row to transfer.",
      },
    }
  }

  const sourceRowsResult = await fetchRowsByJobUrls(
    configResult.data,
    source,
    selectedJobUrls,
    `Unable to load selected ${sourceLabel} rows from Supabase.`,
  )

  if (!sourceRowsResult.ok) {
    return sourceRowsResult
  }

  const sourceByUrl = new Map<string, JobRow>()
  for (const row of sourceRowsResult.data) {
    sourceByUrl.set(normalizeJobUrl(row.job_url), row)
  }

  const sourceRows = selectedJobUrls
    .map((url) => sourceByUrl.get(url))
    .filter((row): row is JobRow => row !== undefined)

  const existingRowsResult = await fetchRowsByJobUrls(
    configResult.data,
    target,
    selectedJobUrls,
    `Unable to check existing ${targetLabel} rows in Supabase.`,
  )

  if (!existingRowsResult.ok) {
    return existingRowsResult
  }

  const existingJobUrls = new Set(
    existingRowsResult.data.map((row) => normalizeJobUrl(row.job_url)),
  )

  const rowsToInsert = sourceRows.filter(
    (row) => !existingJobUrls.has(normalizeJobUrl(row.job_url)),
  )

  if (rowsToInsert.length > 0) {
    const insertResult = await insertRows(
      configResult.data,
      target,
      rowsToInsert,
      `Unable to transfer selected jobs to ${targetLabel}.`,
    )

    if (!insertResult.ok) {
      return insertResult
    }
  }

  const skippedDuplicates = sourceRows.length - rowsToInsert.length
  const missingCount = selectedJobUrls.length - sourceRows.length
  const warnings: string[] = []

  if (missingCount > 0) {
    warnings.push(
      `${missingCount} selected job${missingCount === 1 ? " was" : "s were"} not found in ${sourceLabel}.`,
    )
  }

  if (rowsToInsert.length === 0 && sourceRows.length > 0) {
    warnings.push(`All selected jobs are already in ${targetLabel}.`)
  }

  return {
    ok: true,
    data: {
      added: rowsToInsert.length,
      skippedDuplicates,
      warning: warnings.length > 0 ? warnings.join(" ") : null,
    },
  }
}

function humanTableLabel(tableName: JobsTableName): string {
  switch (tableName) {
    case "jobs":
      return "Jobs"
    case "apply":
      return "Apply"
  }
}

async function fetchRowsByJobUrls(
  config: SupabaseConfig,
  tableName: JobsTableName,
  jobUrls: string[],
  loadRowsError: string,
): Promise<JobsApiResult<JobRow[]>> {
  if (jobUrls.length === 0) {
    return {
      ok: true,
      data: [],
    }
  }

  const rows: JobRow[] = []

  for (let i = 0; i < jobUrls.length; i += SUPABASE_IN_FILTER_BATCH_SIZE) {
    const batch = jobUrls.slice(i, i + SUPABASE_IN_FILTER_BATCH_SIZE)
    const params = new URLSearchParams()
    params.set("select", jobsSelect(tableName))
    params.set("job_url", `in.(${toInFilterValues(batch)})`)
    params.set("limit", String(batch.length))

    try {
      const response = await fetch(
        `${getTableEndpoint(config, tableName)}?${params.toString()}`,
        {
          method: "GET",
          headers: buildSupabaseHeaders(config),
        },
      )

      if (!response.ok) {
        return {
          ok: false,
          error: await readSupabaseResponseError(response, loadRowsError),
        }
      }

      const payload: unknown = await response.json()
      if (!Array.isArray(payload)) {
        return {
          ok: false,
          error: "Supabase returned an unexpected jobs payload.",
        }
      }

      rows.push(...payload.map(toJobRow))
    } catch (error) {
      return {
        ok: false,
        error: readSupabaseNetworkError(error),
      }
    }
  }

  return {
    ok: true,
    data: rows,
  }
}

async function insertRows(
  config: SupabaseConfig,
  tableName: JobsTableName,
  rows: JobRow[],
  fallbackError: string,
): Promise<JobsApiResult<null>> {
  if (rows.length === 0) {
    return {
      ok: true,
      data: null,
    }
  }

  try {
    const response = await fetch(getTableEndpoint(config, tableName), {
      method: "POST",
      headers: {
        ...buildSupabaseHeaders(config),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows.map(normalizeJob)),
    })

    if (!response.ok) {
      return {
        ok: false,
        error: await readSupabaseResponseError(response, fallbackError),
      }
    }

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: readSupabaseNetworkError(error),
    }
  }
}

async function updateSupabaseRowInternal(
  config: SupabaseConfig,
  tableName: JobsTableName,
  jobUrl: string,
  patch: Partial<JobRow>,
  fallbackError: string,
): Promise<JobsApiResult<null>> {
  const normalizedPatch = normalizePatch(patch)

  if (Object.keys(normalizedPatch).length === 0) {
    return {
      ok: true,
      data: null,
    }
  }

  const params = new URLSearchParams()
  params.set("job_url", `eq.${jobUrl}`)

  try {
    const response = await fetch(
      `${getTableEndpoint(config, tableName)}?${params.toString()}`,
      {
        method: "PATCH",
        headers: {
          ...buildSupabaseHeaders(config),
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(normalizedPatch),
      },
    )

    if (!response.ok) {
      return {
        ok: false,
        error: await readSupabaseResponseError(response, fallbackError),
      }
    }

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: readSupabaseNetworkError(error),
    }
  }
}

function getTableEndpoint(config: SupabaseConfig, tableName: JobsTableName): string {
  return getSupabaseTableEndpoint(config, tableName)
}

function toJobRow(rawRow: unknown): JobRow {
  const row = isRecord(rawRow) ? rawRow : {}

  const base: JobRow = {
    job_url: toText(row.job_url),
    company: toText(row.company),
    job_title: toText(row.job_title),
    job_description: toText(row.job_description),
    location: toText(row.location),
    salary: toText(row.salary),
    is_remote: toBoolean(row.is_remote),
    workplace_type: toText(row.workplace_type),
    department: toText(row.department),
    date_published: toNullableDate(row.date_published),
    date_updated: toNullableDate(row.date_updated),
  }

  if ("status" in row) {
    base.status = toNullableText(row.status)
  }

  if ("keywords" in row) {
    base.keywords = toNullableText(row.keywords)
  }

  return base
}

function normalizeJob(job: JobRow): JobRow {
  const normalized: JobRow = {
    ...job,
    job_url: job.job_url.trim(),
    company: job.company.trim(),
    job_title: job.job_title.trim(),
    job_description: job.job_description.trim(),
    location: job.location.trim(),
    salary: job.salary.trim(),
    workplace_type: job.workplace_type.trim(),
    department: job.department.trim(),
    date_published: normalizeNullableDate(job.date_published),
    date_updated: normalizeNullableDate(job.date_updated),
  }

  if (job.status !== undefined) {
    normalized.status = normalizeNullableText(job.status)
  }

  if (job.keywords !== undefined) {
    normalized.keywords = normalizeNullableText(job.keywords)
  }

  return normalized
}

function normalizePatch(patch: Partial<JobRow>): Partial<JobRow> {
  const normalized: Partial<JobRow> = { ...patch }

  if (typeof normalized.job_url === "string") {
    normalized.job_url = normalized.job_url.trim()
  }

  if (typeof normalized.company === "string") {
    normalized.company = normalized.company.trim()
  }

  if (typeof normalized.job_title === "string") {
    normalized.job_title = normalized.job_title.trim()
  }

  if (typeof normalized.job_description === "string") {
    normalized.job_description = normalized.job_description.trim()
  }

  if (typeof normalized.location === "string") {
    normalized.location = normalized.location.trim()
  }

  if (typeof normalized.salary === "string") {
    normalized.salary = normalized.salary.trim()
  }

  if (typeof normalized.workplace_type === "string") {
    normalized.workplace_type = normalized.workplace_type.trim()
  }

  if (typeof normalized.department === "string") {
    normalized.department = normalized.department.trim()
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "date_published")) {
    normalized.date_published = normalizeNullableDate(normalized.date_published)
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "date_updated")) {
    normalized.date_updated = normalizeNullableDate(normalized.date_updated)
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "status")) {
    normalized.status = normalizeNullableText(normalized.status)
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "keywords")) {
    normalized.keywords = normalizeNullableText(normalized.keywords)
  }

  return normalized
}

function normalizeNullableDate(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeJobUrl(value: string): string {
  return value.trim()
}

function normalizeSelectedJobUrls(values: string[]): string[] {
  const deduped: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const normalized = normalizeJobUrl(value)

    if (normalized.length === 0 || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    deduped.push(normalized)
  }

  return deduped
}

function toInFilterValues(values: string[]): string {
  return values
    .map((value) => {
      const escaped = value.replace(/\\/g, "\\\\").replace(/\"/g, '\\\"')
      return `"${escaped}"`
    })
    .join(",")
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function toNullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "number") {
    return value !== 0
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "1"
  }

  return false
}

function toNullableDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
