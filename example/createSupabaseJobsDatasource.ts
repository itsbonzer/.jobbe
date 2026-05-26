import type { IServerSideDatasource, IServerSideGetRowsParams } from "ag-grid-community"
import { fetchJobsGridBlock } from "@/modules/jobs/data/jobsRpc"
import type {
  GridSort,
  JobsGridQuery,
  JobsGridResponse,
  JobsGridRow,
  JobsTableName,
} from "@/modules/jobs/types"

export type SupabaseDatasourceCallbacks = {
  onLoadStart?: () => void
  onLoadSuccess?: (payload: { query: JobsGridQuery; response: JobsGridResponse }) => void
  onLoadError?: (message: string) => void
}

export type CreateSupabaseDatasourceOptions = {
  callbacks?: SupabaseDatasourceCallbacks
}

export function createSupabaseJobsDatasource(
  tableName: JobsTableName,
  options: CreateSupabaseDatasourceOptions = {},
): IServerSideDatasource<JobsGridRow> {
  const callbacks = options.callbacks

  return {
    async getRows(params) {
      const query = toQuery(params)
      callbacks?.onLoadStart?.()

      const result = await fetchJobsGridBlock(tableName, query)
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

function toQuery(params: IServerSideGetRowsParams<JobsGridRow>): JobsGridQuery {
  const startRow = params.request.startRow ?? 0
  const endRow = params.request.endRow ?? startRow + 100

  const sortModel = (params.request.sortModel ?? []).map((sort) => ({
    colId: sort.colId,
    sort: sort.sort,
  })) as GridSort[]

  return {
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
