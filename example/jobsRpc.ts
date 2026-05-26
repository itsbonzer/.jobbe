import {
  callRpc,
  type SupabaseApiResult,
} from "@/lib/supabaseRest"
import type {
  JobsGridQuery,
  JobsGridResponse,
  JobsGridRow,
  JobsTableName,
} from "@/modules/jobs/types"

type RpcGridResponse = {
  rows: JobsGridRow[]
  last_row: number
}

type RpcGridBody = {
  p_table: JobsTableName
  p_request: JobsGridQuery
}

type RpcDistinctBody = {
  p_table: JobsTableName
  p_column: string
}

type DistinctValues = (string | null)[]

const distinctCache = new Map<string, DistinctValues>()
const distinctInFlight = new Map<string, Promise<SupabaseApiResult<DistinctValues>>>()

function distinctCacheKey(table: JobsTableName, column: string): string {
  return `${table}::${column}`
}

export async function fetchJobsGridBlock(
  table: JobsTableName,
  request: JobsGridQuery,
): Promise<SupabaseApiResult<JobsGridResponse>> {
  const result = await callRpc<RpcGridBody, RpcGridResponse>(
    "jobs_grid",
    { p_table: table, p_request: request },
    `Unable to load ${table} from Supabase.`,
  )

  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    data: {
      rows: result.data.rows ?? [],
      lastRow: result.data.last_row ?? 0,
    },
  }
}

export async function fetchJobsDistinct(
  table: JobsTableName,
  column: string,
): Promise<SupabaseApiResult<DistinctValues>> {
  return callRpc<RpcDistinctBody, DistinctValues>(
    "jobs_distinct",
    { p_table: table, p_column: column },
    `Unable to load filter values for ${column} from Supabase.`,
  )
}

export async function fetchJobsDistinctCached(
  table: JobsTableName,
  column: string,
): Promise<SupabaseApiResult<DistinctValues>> {
  const key = distinctCacheKey(table, column)

  const cached = distinctCache.get(key)
  if (cached) {
    return { ok: true, data: cached }
  }

  const inFlight = distinctInFlight.get(key)
  if (inFlight) {
    return inFlight
  }

  const promise = fetchJobsDistinct(table, column).then((result) => {
    distinctInFlight.delete(key)
    if (result.ok) {
      distinctCache.set(key, result.data)
    }
    return result
  })

  distinctInFlight.set(key, promise)
  return promise
}

export function clearDistinctCache(): void {
  distinctCache.clear()
  distinctInFlight.clear()
}
