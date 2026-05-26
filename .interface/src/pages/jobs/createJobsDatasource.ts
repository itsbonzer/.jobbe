import type {
  IServerSideDatasource,
  IServerSideGetRowsParams,
} from "ag-grid-community"

import { fetchJobsGridBlock } from "./jobsApi"
import type {
  GridSort,
  JobsGridRequest,
  JobsGridResponse,
  JobsGridRow,
  JobsTableName,
} from "./types"

export type JobsDatasourceCallbacks = {
  onLoadStart?: () => void
  onLoadSuccess?: (payload: {
    query: JobsGridRequest
    response: JobsGridResponse
  }) => void
  onLoadError?: (message: string) => void
}

export type CreateJobsDatasourceOptions = {
  table?: JobsTableName
  callbacks?: JobsDatasourceCallbacks
}

export function createJobsDatasource(
  options: CreateJobsDatasourceOptions = {},
): IServerSideDatasource<JobsGridRow> {
  const callbacks = options.callbacks
  const table = options.table ?? "jobs"

  return {
    async getRows(params) {
      const query = toGridRequest(params, table)
      callbacks?.onLoadStart?.()

      const result = await fetchJobsGridBlock(query)
      if (!result.ok) {
        callbacks?.onLoadError?.(result.error)
        params.fail()
        return
      }

      params.success({
        rowData: result.data.rows,
        rowCount: result.data.lastRow,
      })

      callbacks?.onLoadSuccess?.({
        query,
        response: result.data,
      })
    },
  }
}

function toGridRequest(
  params: IServerSideGetRowsParams<JobsGridRow>,
  table: JobsTableName,
): JobsGridRequest {
  const startRow = params.request.startRow ?? 0
  const endRow = params.request.endRow ?? startRow + 100

  const sortModel: GridSort[] = (params.request.sortModel ?? []).map((sort) => ({
    colId: sort.colId,
    sort: sort.sort === "desc" ? "desc" : "asc",
  }))

  return {
    table,
    startRow,
    endRow,
    sortModel,
    filterModel: (params.request.filterModel ?? {}) as Record<string, unknown>,
    rowGroupCols: (params.request.rowGroupCols ?? []).map((col) => ({
      id: col.id,
      field: col.field ?? col.id,
    })),
    groupKeys: [...(params.request.groupKeys ?? [])],
  }
}
