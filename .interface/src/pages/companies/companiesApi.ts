import type { CompanyDirectoryRow, JobRow } from "./types"

export type JobsApiResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

export type CompaniesSelection = {
  company: string | null
  jobUrl: string | null
}

type ApiErrorPayload = {
  error?: unknown
  detail?: unknown
}

type PreferenceRecord<TValue> = {
  scope: "companies"
  key: string
  value: TValue
  updated_at: string | null
}

type PreferenceReadResponse<TValue> = {
  preference: PreferenceRecord<TValue> | null
}

type PreferenceWriteResponse = {
  saved: boolean
}

const API_BASE_URL =
  import.meta.env.VITE_JOBBE_API_BASE_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8787"

const SELECTION_SCOPE = "companies"
const SELECTION_KEY = "browser_selection"

export async function fetchCompanies(): Promise<
  JobsApiResult<{ companies: CompanyDirectoryRow[] }>
> {
  try {
    const response = await fetch(apiUrl("/api/companies"), {
      headers: { Accept: "application/json" },
    })
    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to load companies."),
      }
    }

    if (!isCompaniesResponse(payload)) {
      return {
        ok: false,
        error: "Companies API returned an unexpected directory payload.",
      }
    }

    return { ok: true, data: payload }
  } catch (error) {
    return { ok: false, error: readNetworkError(error) }
  }
}

export async function fetchCompanyJobs(
  company: string,
): Promise<JobsApiResult<{ jobs: JobRow[] }>> {
  try {
    const response = await fetch(
      apiUrl(`/api/companies/${encodeURIComponent(company)}/jobs`),
      {
        headers: { Accept: "application/json" },
      },
    )
    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to load company jobs."),
      }
    }

    if (!isCompanyJobsResponse(payload)) {
      return {
        ok: false,
        error: "Companies API returned an unexpected jobs payload.",
      }
    }

    return { ok: true, data: payload }
  } catch (error) {
    return { ok: false, error: readNetworkError(error) }
  }
}

export async function fetchCompaniesSelection(): Promise<
  JobsApiResult<CompaniesSelection | null>
> {
  try {
    const params = new URLSearchParams({
      scope: SELECTION_SCOPE,
      key: SELECTION_KEY,
    })
    const response = await fetch(apiUrl(`/api/preferences?${params.toString()}`), {
      headers: { Accept: "application/json" },
    })
    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to load companies selection."),
      }
    }

    if (!isPreferenceReadResponse<CompaniesSelection>(payload)) {
      return {
        ok: false,
        error: "Companies API returned an unexpected selection payload.",
      }
    }

    const value = payload.preference?.value ?? null
    if (value !== null && !isCompaniesSelection(value)) {
      return {
        ok: false,
        error: "Companies API returned an invalid selection payload.",
      }
    }

    return { ok: true, data: value }
  } catch (error) {
    return { ok: false, error: readNetworkError(error) }
  }
}

export async function saveCompaniesSelection(
  value: CompaniesSelection,
): Promise<JobsApiResult<{ saved: true }>> {
  try {
    const response = await fetch(apiUrl("/api/preferences"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        scope: SELECTION_SCOPE,
        key: SELECTION_KEY,
        value,
      }),
    })
    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to save companies selection."),
      }
    }

    if (!isPreferenceWriteResponse(payload)) {
      return {
        ok: false,
        error: "Companies API returned an unexpected selection save payload.",
      }
    }

    return { ok: true, data: { saved: true } }
  } catch (error) {
    return { ok: false, error: readNetworkError(error) }
  }
}

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function readApiError(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback
  }

  const apiPayload = payload as ApiErrorPayload
  const error = toText(apiPayload.error)
  if (error) {
    return error
  }

  const detail = toText(apiPayload.detail)
  return detail || fallback
}

function readNetworkError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `Unable to reach Jobbe API. ${error.message}`
  }

  return "Unable to reach Jobbe API."
}

function isCompaniesResponse(
  value: unknown,
): value is { companies: CompanyDirectoryRow[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.companies) &&
    value.companies.every(isCompanyDirectoryRow)
  )
}

function isCompanyDirectoryRow(value: unknown): value is CompanyDirectoryRow {
  return (
    isRecord(value) &&
    typeof value.company === "string" &&
    (value.workplace_type === null || typeof value.workplace_type === "string") &&
    typeof value.job_count === "number" &&
    (value.latest_date_updated === null ||
      typeof value.latest_date_updated === "string") &&
    typeof value.has_recent_alert === "boolean"
  )
}

function isCompanyJobsResponse(value: unknown): value is { jobs: JobRow[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.jobs) &&
    value.jobs.every(isJobRow)
  )
}

function isJobRow(value: unknown): value is JobRow {
  return (
    isRecord(value) &&
    typeof value.job_url === "string" &&
    typeof value.company === "string" &&
    typeof value.job_title === "string"
  )
}

function isPreferenceReadResponse<TValue>(
  value: unknown,
): value is PreferenceReadResponse<TValue> {
  if (!isRecord(value) || !("preference" in value)) {
    return false
  }

  if (value.preference === null) {
    return true
  }

  return (
    isRecord(value.preference) &&
    value.preference.scope === SELECTION_SCOPE &&
    typeof value.preference.key === "string" &&
    "value" in value.preference
  )
}

function isPreferenceWriteResponse(value: unknown): value is PreferenceWriteResponse {
  return isRecord(value) && value.saved === true
}

function isCompaniesSelection(value: unknown): value is CompaniesSelection {
  return (
    isRecord(value) &&
    (value.company === null || typeof value.company === "string") &&
    (value.jobUrl === null || typeof value.jobUrl === "string")
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
