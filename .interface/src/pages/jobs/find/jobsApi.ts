import type {
  JobDeleteRequest,
  JobDeleteResponse,
  JobPatchRequest,
  JobPatchResponse,
  JobsDistinctRequest,
  JobsDistinctResponse,
  JobsGridRequest,
  JobsGridResponse,
} from "./types"

export type JobsApiResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

type ApiErrorPayload = {
  error?: unknown
  detail?: unknown
}

const API_BASE_URL =
  import.meta.env.VITE_JOBBE_API_BASE_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8787"

export type PreferenceRecord<TValue> = {
  scope: "grid"
  key: string
  value: TValue
  updated_at: string | null
}

export type PreferenceReadResponse<TValue> = {
  preference: PreferenceRecord<TValue> | null
}

export type PreferenceWriteResponse = {
  saved: boolean
}

export async function fetchJobsGridBlock(
  request: JobsGridRequest,
): Promise<JobsApiResult<JobsGridResponse>> {
  try {
    const response = await fetch(apiUrl("/api/jobs/grid"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    })

    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to load jobs."),
      }
    }

    if (!isJobsGridResponse(payload)) {
      return {
        ok: false,
        error: "Jobs API returned an unexpected grid payload.",
      }
    }

    return {
      ok: true,
      data: payload,
    }
  } catch (error) {
    return {
      ok: false,
      error: readNetworkError(error),
    }
  }
}

export async function fetchJobsDistinctValues(
  request: JobsDistinctRequest,
): Promise<JobsApiResult<JobsDistinctResponse>> {
  try {
    const response = await fetch(apiUrl("/api/jobs/distinct"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    })

    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to load filter values."),
      }
    }

    if (!isJobsDistinctResponse(payload)) {
      return {
        ok: false,
        error: "Jobs API returned an unexpected distinct-values payload.",
      }
    }

    return {
      ok: true,
      data: payload,
    }
  } catch (error) {
    return {
      ok: false,
      error: readNetworkError(error),
    }
  }
}

export async function updateJobRow(
  jobUrl: string,
  request: JobPatchRequest,
): Promise<JobsApiResult<JobPatchResponse>> {
  try {
    const response = await fetch(apiUrl(`/api/jobs/${encodeURIComponent(jobUrl)}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    })

    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to update job."),
      }
    }

    if (!isJobPatchResponse(payload)) {
      return {
        ok: false,
        error: "Jobs API returned an unexpected update payload.",
      }
    }

    return {
      ok: true,
      data: payload,
    }
  } catch (error) {
    return {
      ok: false,
      error: readNetworkError(error),
    }
  }
}

export async function deleteJobRows(
  request: JobDeleteRequest,
): Promise<JobsApiResult<JobDeleteResponse>> {
  try {
    const response = await fetch(apiUrl("/api/jobs/delete"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    })

    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to delete selected jobs."),
      }
    }

    if (!isJobDeleteResponse(payload)) {
      return {
        ok: false,
        error: "Jobs API returned an unexpected delete payload.",
      }
    }

    return {
      ok: true,
      data: payload,
    }
  } catch (error) {
    return {
      ok: false,
      error: readNetworkError(error),
    }
  }
}

export async function fetchGridPreference<TValue>(
  key: string,
): Promise<JobsApiResult<PreferenceReadResponse<TValue>>> {
  try {
    const params = new URLSearchParams({ scope: "grid", key })
    const response = await fetch(apiUrl(`/api/preferences?${params.toString()}`), {
      headers: { Accept: "application/json" },
    })
    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to load grid preferences."),
      }
    }

    if (!isPreferenceReadResponse<TValue>(payload)) {
      return {
        ok: false,
        error: "Jobs API returned an unexpected preference payload.",
      }
    }

    return { ok: true, data: payload }
  } catch (error) {
    return { ok: false, error: readNetworkError(error) }
  }
}

export async function saveGridPreference<TValue>(
  key: string,
  value: TValue,
): Promise<JobsApiResult<PreferenceWriteResponse>> {
  try {
    const response = await fetch(apiUrl("/api/preferences"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ scope: "grid", key, value }),
    })
    const payload: unknown = await readJson(response)

    if (!response.ok) {
      return {
        ok: false,
        error: readApiError(payload, "Unable to save grid preferences."),
      }
    }

    if (!isPreferenceWriteResponse(payload)) {
      return {
        ok: false,
        error: "Jobs API returned an unexpected preference save payload.",
      }
    }

    return { ok: true, data: payload }
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
    return `Unable to reach Jobs API. ${error.message}`
  }

  return "Unable to reach Jobs API."
}

function isJobsGridResponse(value: unknown): value is JobsGridResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.rows) &&
    typeof value.lastRow === "number"
  )
}

function isJobsDistinctResponse(value: unknown): value is JobsDistinctResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.values) &&
    value.values.every((item) => item === null || typeof item === "string")
  )
}

function isJobPatchResponse(value: unknown): value is JobPatchResponse {
  return isRecord(value) && typeof value.updated === "number"
}

function isJobDeleteResponse(value: unknown): value is JobDeleteResponse {
  return isRecord(value) && typeof value.deleted === "number"
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
    value.preference.scope === "grid" &&
    typeof value.preference.key === "string" &&
    "value" in value.preference
  )
}

function isPreferenceWriteResponse(value: unknown): value is PreferenceWriteResponse {
  return isRecord(value) && value.saved === true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
