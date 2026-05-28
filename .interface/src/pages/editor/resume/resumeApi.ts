export type ResumeTextAlign = "left" | "center" | "right" | "justify"

export type ResumeEditorSettings = {
  align: ResumeTextAlign
  backgroundColor: string
  blockStyle: string
  fontSize: number
  highlightColor: string
  lineHeight: number
  textColor: string
}

export type ResumeApiResult<T> =
  | { data: T; ok: true }
  | { error: string; ok: false }

type PreferenceRecord<T> = {
  key: string
  scope: string
  updated_at?: string
  value: T
}

type PreferenceReadResponse<T> = {
  preference: PreferenceRecord<T> | null
}

type PreferenceWriteResponse<T> = {
  preference: PreferenceRecord<T>
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? ""

const SETTINGS_SCOPE = "editor"
const SETTINGS_KEY = "resume-settings"

export const defaultResumeEditorSettings: ResumeEditorSettings = {
  align: "left",
  backgroundColor: "#263241",
  blockStyle: "p",
  fontSize: 10,
  highlightColor: "#f6d365",
  lineHeight: 1.28,
  textColor: "#e8edf4",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isResumeTextAlign(value: unknown): value is ResumeTextAlign {
  return (
    value === "left" ||
    value === "center" ||
    value === "right" ||
    value === "justify"
  )
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function normalizeSettings(value: unknown): ResumeEditorSettings {
  if (!isRecord(value)) return defaultResumeEditorSettings

  return {
    align: isResumeTextAlign(value.align)
      ? value.align
      : defaultResumeEditorSettings.align,
    backgroundColor: normalizeColor(
      value.backgroundColor,
      defaultResumeEditorSettings.backgroundColor,
    ),
    blockStyle:
      typeof value.blockStyle === "string"
        ? value.blockStyle
        : defaultResumeEditorSettings.blockStyle,
    fontSize: normalizeNumber(
      value.fontSize,
      defaultResumeEditorSettings.fontSize,
      8,
      28,
    ),
    highlightColor: normalizeColor(
      value.highlightColor,
      defaultResumeEditorSettings.highlightColor,
    ),
    lineHeight: normalizeNumber(
      value.lineHeight,
      defaultResumeEditorSettings.lineHeight,
      1,
      2.4,
    ),
    textColor: normalizeColor(
      value.textColor,
      defaultResumeEditorSettings.textColor,
    ),
  }
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string }
    return payload.detail ?? `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
}

async function readJson<T>(response: Response): Promise<ResumeApiResult<T>> {
  if (!response.ok) {
    return { error: await readApiError(response), ok: false }
  }

  return { data: (await response.json()) as T, ok: true }
}

export async function fetchResumeEditorSettings(): Promise<
  ResumeApiResult<ResumeEditorSettings | null>
> {
  const params = new URLSearchParams({
    key: SETTINGS_KEY,
    scope: SETTINGS_SCOPE,
  })
  const result = await readJson<PreferenceReadResponse<unknown>>(
    await fetch(`${API_BASE_URL}/api/preferences?${params.toString()}`),
  )

  if (!result.ok) return result

  return {
    data: result.data.preference
      ? normalizeSettings(result.data.preference.value)
      : null,
    ok: true,
  }
}

export async function saveResumeEditorSettings(
  value: ResumeEditorSettings,
): Promise<ResumeApiResult<ResumeEditorSettings>> {
  const result = await readJson<PreferenceWriteResponse<unknown>>(
    await fetch(`${API_BASE_URL}/api/preferences`, {
      body: JSON.stringify({
        key: SETTINGS_KEY,
        scope: SETTINGS_SCOPE,
        value,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    }),
  )

  if (!result.ok) return result

  return {
    data: normalizeSettings(result.data.preference.value),
    ok: true,
  }
}
