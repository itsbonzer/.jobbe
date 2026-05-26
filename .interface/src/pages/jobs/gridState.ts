import type { GridState } from "ag-grid-community"

import { fetchGridPreference, saveGridPreference, type JobsApiResult } from "./jobsApi"


export type JobsGridStatePreference = {
  version: 1
  state: GridState
}

export type GridStateLoadResult = {
  state: GridState | null
  warning: string | null
}

const GRID_STATE_KEY = "jobs:jobs"

export const DEFAULT_JOBS_GRID_STATE: GridState = {
  rowGroup: {
    groupColIds: ["company"],
  },
  columnVisibility: {
    hiddenColIds: ["company"],
  },
  partialColumnState: true,
}

export async function loadJobsGridState(): Promise<GridStateLoadResult> {
  const result = await fetchGridPreference<JobsGridStatePreference>(GRID_STATE_KEY)
  if (!result.ok) {
    return { state: null, warning: result.error }
  }

  const preference = result.data.preference
  if (!preference) {
    return { state: null, warning: null }
  }

  const parsed = parseGridStatePreference(preference.value)
  if (!parsed) {
    return {
      state: null,
      warning: "Saved Jobs grid state was invalid. Using defaults.",
    }
  }

  return { state: parsed.state, warning: null }
}

export async function saveJobsGridState(
  state: GridState,
): Promise<JobsApiResult<null>> {
  const result = await saveGridPreference(GRID_STATE_KEY, {
    version: 1,
    state: sanitizeGridState(state),
  })

  if (!result.ok) {
    return result
  }

  return { ok: true, data: null }
}

function parseGridStatePreference(
  value: unknown,
): JobsGridStatePreference | null {
  if (!isRecord(value) || value.version !== 1 || !isGridState(value.state)) {
    return null
  }

  return {
    version: 1,
    state: sanitizeGridState(value.state),
  }
}

function sanitizeGridState(state: GridState): GridState {
  return {
    version: state.version,
    columnGroup: state.columnGroup,
    columnOrder: state.columnOrder,
    columnPinning: state.columnPinning,
    columnSizing: state.columnSizing,
    columnVisibility: state.columnVisibility,
    filter: state.filter,
    pagination: state.pagination,
    pivot: state.pivot,
    rowGroup: state.rowGroup,
    rowGroupExpansion: state.rowGroupExpansion,
    sideBar: state.sideBar,
    sort: state.sort,
    partialColumnState: true,
  }
}

function isGridState(value: unknown): value is GridState {
  return isRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
