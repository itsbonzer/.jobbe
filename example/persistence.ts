import {
  convertColumnState,
  type ColumnState,
  type GridState,
} from "ag-grid-community"
import {
  deletePreference,
  fetchPreference,
  savePreference,
} from "@/modules/preferences/preferencesApi"
import type { JsonObject } from "@/modules/preferences/types"
import type { SupabaseApiResult } from "@/lib/supabaseRest"
import type { JobsTableName } from "@/modules/jobs/types"

export type JobsGridPersistedState = GridState

export type GridStateSource = "supabase" | "legacy-localStorage" | "default" | "none"

export type GridStateLoadResult<TState> = {
  state: TState | null
  source: GridStateSource
  warning: string | null
}

type LegacyJobsGridPersistedState = {
  columnState: ColumnState[]
  filterModel?: Record<string, unknown> | null
  columnOrder?: string[]
}

type GridPreferenceValue = {
  version: 1
  state: JobsGridPersistedState
}

const STORAGE_PREFIX = "jobs-grid-state:"
const GRID_PREFERENCE_SCOPE = "grid"

function storageKey(tableName: JobsTableName): string {
  return `${STORAGE_PREFIX}${tableName}`
}

function preferenceKey(tableName: JobsTableName): string {
  return `jobs:${tableName}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isLegacyJobsGridPersistedState(value: unknown): value is LegacyJobsGridPersistedState {
  return isRecord(value) && Array.isArray(value.columnState)
}

function isGridStateObject(value: unknown): value is GridState {
  if (!isRecord(value)) {
    return false
  }

  const keys: Array<keyof GridState> = [
    "version",
    "aggregation",
    "columnGroup",
    "columnOrder",
    "columnPinning",
    "columnSizing",
    "columnVisibility",
    "filter",
    "pivot",
    "rowGroup",
    "sort",
    "partialColumnState",
  ]

  return keys.some((key) => key in value)
}

function normalizeLegacyColumnOrder(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const orderedColIds = value.filter(
    (colId): colId is string => typeof colId === "string" && colId.length > 0,
  )

  return orderedColIds.length > 0 ? orderedColIds : undefined
}

function sanitizeGridState(state: GridState): JobsGridPersistedState {
  return {
    version: state.version,
    aggregation: state.aggregation,
    columnGroup: state.columnGroup,
    columnOrder: state.columnOrder,
    columnPinning: state.columnPinning,
    columnSizing: state.columnSizing,
    columnVisibility: state.columnVisibility,
    filter: state.filter,
    pivot: state.pivot,
    rowGroup: state.rowGroup,
    sort: state.sort,
    partialColumnState: true,
  }
}

function convertLegacyState(legacy: LegacyJobsGridPersistedState): JobsGridPersistedState {
  const convertedColumns = convertColumnState(legacy.columnState)
  const legacyColumnOrder = normalizeLegacyColumnOrder(legacy.columnOrder)
  const convertedColumnOrder = convertedColumns.columnOrder?.orderedColIds

  const orderedColIds =
    legacyColumnOrder && legacyColumnOrder.length > 0
      ? legacyColumnOrder
      : convertedColumnOrder

  const filterModel = isRecord(legacy.filterModel)
    ? (legacy.filterModel as Record<string, unknown>)
    : undefined

  return sanitizeGridState({
    ...convertedColumns,
    ...(orderedColIds && orderedColIds.length > 0
      ? { columnOrder: { orderedColIds } }
      : {}),
    ...(filterModel ? { filter: { filterModel } } : {}),
    partialColumnState: true,
  })
}

function loadLegacyGridState(tableName: JobsTableName): JobsGridPersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey(tableName))
    if (!raw) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)

    if (isLegacyJobsGridPersistedState(parsed)) {
      return convertLegacyState(parsed)
    }

    if (!isGridStateObject(parsed)) {
      return null
    }

    return sanitizeGridState(parsed)
  } catch {
    return null
  }
}

export async function loadGridState(
  tableName: JobsTableName,
): Promise<GridStateLoadResult<JobsGridPersistedState>> {
  const preferenceResult = await fetchPreference<JsonObject>(
    GRID_PREFERENCE_SCOPE,
    preferenceKey(tableName),
  )

  if (!preferenceResult.ok) {
    return {
      state: null,
      source: "default",
      warning: preferenceResult.error,
    }
  }

  if (preferenceResult.data) {
    const parsed = parseGridPreferenceValue(preferenceResult.data.value)
    if (!parsed) {
      return {
        state: null,
        source: "default",
        warning: "Supabase returned an invalid Jobs grid state. Using defaults.",
      }
    }

    return {
      state: parsed.state,
      source: "supabase",
      warning: null,
    }
  }

  const legacyState = loadLegacyGridState(tableName)
  if (!legacyState) {
    return {
      state: null,
      source: "default",
      warning: null,
    }
  }

  const saveResult = await saveGridState(tableName, legacyState)
  return {
    state: legacyState,
    source: "legacy-localStorage",
    warning: saveResult.ok ? null : saveResult.error,
  }
}

export async function saveGridState(
  tableName: JobsTableName,
  state: JobsGridPersistedState,
): Promise<SupabaseApiResult<null>> {
  const value = toGridPreferenceValue(state)
  const result = await savePreference(
    GRID_PREFERENCE_SCOPE,
    preferenceKey(tableName),
    value,
  )

  if (!result.ok) {
    return result
  }

  return { ok: true, data: null }
}

export async function clearGridState(
  tableName: JobsTableName,
): Promise<SupabaseApiResult<null>> {
  return deletePreference(GRID_PREFERENCE_SCOPE, preferenceKey(tableName))
}

function parseGridPreferenceValue(value: unknown): GridPreferenceValue | null {
  if (!isRecord(value) || value.version !== 1 || !isGridStateObject(value.state)) {
    return null
  }

  return {
    version: 1,
    state: sanitizeGridState(value.state),
  }
}

function toGridPreferenceValue(state: JobsGridPersistedState): JsonObject {
  return {
    version: 1,
    state: sanitizeGridState(state) as unknown as JsonObject,
  }
}
