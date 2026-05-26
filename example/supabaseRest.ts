export type SupabaseConfig = {
  restUrl: string
  anonKey: string
}

export type SupabaseApiResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

const SUPABASE_CONFIG_ERROR =
  "Supabase configuration is missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."

export function getRequiredSupabaseConfig(): SupabaseApiResult<SupabaseConfig> {
  const config = getSupabaseConfig()

  if (!config) {
    return {
      ok: false,
      error: SUPABASE_CONFIG_ERROR,
    }
  }

  return {
    ok: true,
    data: config,
  }
}

export function getSupabaseTableEndpoint(
  config: SupabaseConfig,
  tableName: string,
): string {
  return `${config.restUrl}/${tableName}`
}

export function buildSupabaseHeaders(config: SupabaseConfig): HeadersInit {
  return buildHeaders(config)
}

export async function readSupabaseResponseError(
  response: Response,
  fallback: string,
): Promise<string> {
  return toResponseErrorMessage(response, fallback)
}

export function readSupabaseNetworkError(error: unknown): string {
  return toNetworkErrorMessage(error)
}

export async function callRpc<TBody, TResponse>(
  name: string,
  body: TBody,
  fallbackError: string,
): Promise<SupabaseApiResult<TResponse>> {
  const configResult = getRequiredSupabaseConfig()
  if (!configResult.ok) {
    return configResult
  }

  try {
    const response = await fetch(`${configResult.data.restUrl}/rpc/${name}`, {
      method: "POST",
      headers: {
        ...buildSupabaseHeaders(configResult.data),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return {
        ok: false,
        error: await readSupabaseResponseError(response, fallbackError),
      }
    }

    const payload = (await response.json()) as TResponse
    return { ok: true, data: payload }
  } catch (error) {
    return { ok: false, error: readSupabaseNetworkError(error) }
  }
}

function getSupabaseConfig(): SupabaseConfig | null {
  const supabaseUrl = readEnvValue("VITE_SUPABASE_URL")
  const supabaseAnonKey = readEnvValue("VITE_SUPABASE_ANON_KEY")

  if (supabaseUrl.length === 0 || supabaseAnonKey.length === 0) {
    return null
  }

  return {
    restUrl: `${supabaseUrl.replace(/\/$/, "")}/rest/v1`,
    anonKey: supabaseAnonKey,
  }
}

function buildHeaders(config: SupabaseConfig): HeadersInit {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
  }
}

function readEnvValue(key: string): string {
  const rawValue = import.meta.env[key]
  if (typeof rawValue !== "string") {
    return ""
  }

  return rawValue.trim()
}

async function toResponseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (!isRecord(payload)) {
      return fallback
    }

    const message = toText(payload.message) || toText(payload.error)
    const details = toText(payload.details)

    if (message.length === 0 && details.length === 0) {
      return fallback
    }

    if (details.length === 0) {
      return message
    }

    if (message.length === 0) {
      return details
    }

    return `${message} ${details}`
  } catch {
    return fallback
  }
}

function toNetworkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `Unable to reach Supabase. ${error.message}`
  }

  return "Unable to reach Supabase."
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
