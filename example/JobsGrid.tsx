import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  CellValueChangedEvent,
  ColDef,
  GetRowIdParams,
  GridApi,
  GridPreDestroyedEvent,
  GridReadyEvent,
  RowClickedEvent,
  SetFilterValuesFuncParams,
  SideBarDef,
  StateUpdatedEvent,
  ValueGetterParams,
} from "ag-grid-community"
import { colorSchemeDark, themeQuartz } from "ag-grid-community"
import { AllEnterpriseModule } from "ag-grid-enterprise"
import { AgGridProvider, AgGridReact } from "ag-grid-react"
import {
  RiDeleteBin6Line,
  RiDownload2Line,
  RiFileExcel2Line,
  RiLayoutColumnLine,
  RiRefreshLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  deleteSupabaseJobs,
  updateSupabaseRow,
} from "@/modules/jobs/data/jobsApi"
import {
  createSupabaseJobsDatasource,
  type SupabaseDatasourceCallbacks,
} from "@/modules/jobs/data/createSupabaseJobsDatasource"
import {
  clearDistinctCache,
  fetchJobsDistinctCached,
} from "@/modules/jobs/data/jobsRpc"
import { getLargeTextEditorColDef } from "@/modules/jobs/editors/LargeTextCellEditor"
import { ApplyActionCellRenderer } from "@/modules/jobs/grid/ApplyActionCellRenderer"
import { JobUrlCellRenderer } from "@/modules/jobs/grid/JobUrlCellRenderer"
import {
  loadGridState,
  saveGridState,
  type JobsGridPersistedState,
} from "@/modules/jobs/grid/persistence"
import {
  getDaysSinceUpdated,
  getEffectiveUpdatedDate,
  isGroupRow,
  type JobRow,
  type JobsGridRow,
  type JobsTableName,
} from "@/modules/jobs/types"

export type JobsGridState = {
  isLoading: boolean
  isEmpty: boolean
  error: string | null
}

type JobsGridProps = {
  tableName: JobsTableName
  onSelectJob: (job: JobRow) => void
  onStateChange?: (state: JobsGridState) => void
  toolbarLeadingAction?: ReactNode
  enableRowDelete?: boolean
}

export type JobsGridHandle = {
  refreshData: () => void
  getSelectedRows: () => JobsGridRow[]
  clearSelection: () => void
  expandAllGroups: () => void
  collapseAllGroups: () => void
}

type JobsToolPanelId = "columns" | "filters-new"

const INITIAL_STATE: JobsGridState = {
  isLoading: true,
  isEmpty: false,
  error: null,
}

const APPLY_STATUS_OPTIONS = ["Filter", "Apply", "Resume", "Applied"] as const

const jobsGridTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#0c0d0d",
  dataBackgroundColor: "#0c0d0d",
  chromeBackgroundColor: "#090a0b",
  headerBackgroundColor: "#090a0b",
  oddRowBackgroundColor: "#0c0d0d",
  borderColor: "#15191b",
  rowHoverColor: "#161a1c",
  browserColorScheme: "dark",
})

function formatDate(value: string | null): string {
  return value ?? ""
}

function formatDays(value: number | null): string {
  if (value === null) {
    return ""
  }

  return `${value} day${value === 1 ? "" : "s"}`
}

function normalizeEditedValue(field: keyof JobRow, value: unknown): JobRow[keyof JobRow] {
  if (field === "is_remote") {
    if (typeof value === "boolean") {
      return value
    }

    if (typeof value === "string") {
      return value.trim().toLowerCase() === "true"
    }

    if (typeof value === "number") {
      return value !== 0
    }
  }

  if (field === "date_published" || field === "date_updated" || field === "status") {
    if (typeof value !== "string") {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  return value as JobRow[keyof JobRow]
}

function countSelectableLeafRows(rows: JobsGridRow[]): number {
  let count = 0
  for (const row of rows) {
    if (!isGroupRow(row)) {
      count += 1
    }
  }
  return count
}

export const JobsGrid = forwardRef<JobsGridHandle, JobsGridProps>(function JobsGrid(
  {
    tableName,
    onSelectJob,
    onStateChange,
    toolbarLeadingAction,
    enableRowDelete = true,
  },
  ref,
) {
  const gridRef = useRef<AgGridReact<JobsGridRow>>(null)
  const isRevertingCellRef = useRef(false)
  const gridPersistenceHydratedRef = useRef(false)
  const [gridState, setGridState] = useState<JobsGridState>(INITIAL_STATE)
  const [selectedLeafCount, setSelectedLeafCount] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const updateGridState = useCallback((nextState: Partial<JobsGridState>) => {
    setGridState((prev) => ({
      ...prev,
      ...nextState,
    }))
  }, [])

  useEffect(() => {
    onStateChange?.(gridState)
  }, [gridState, onStateChange])

  useEffect(() => {
    gridPersistenceHydratedRef.current = false
  }, [tableName])

  const refreshData = useCallback(() => {
    updateGridState({ isLoading: true, error: null })
    clearDistinctCache()
    gridRef.current?.api?.refreshServerSide({ purge: true })
  }, [updateGridState])

  const getSelectedRows = useCallback((): JobsGridRow[] => {
    return gridRef.current?.api?.getSelectedRows() ?? []
  }, [])

  const clearSelection = useCallback(() => {
    gridRef.current?.api?.deselectAll()
  }, [])

  const expandAllGroups = useCallback(() => {
    gridRef.current?.api?.expandAll()
  }, [])

  const collapseAllGroups = useCallback(() => {
    gridRef.current?.api?.collapseAll()
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      refreshData,
      getSelectedRows,
      clearSelection,
      expandAllGroups,
      collapseAllGroups,
    }),
    [refreshData, getSelectedRows, clearSelection, expandAllGroups, collapseAllGroups],
  )

  const datasource = useMemo(() => {
    const callbacks: SupabaseDatasourceCallbacks = {
      onLoadStart: () => {
        updateGridState({ isLoading: true, error: null })
      },
      onLoadSuccess: ({ query, response }) => {
        updateGridState({
          isLoading: false,
          error: null,
          isEmpty: query.groupKeys.length === 0 ? response.lastRow === 0 : false,
        })
      },
      onLoadError: (message) => {
        updateGridState({ isLoading: false, error: message })
      },
    }

    return createSupabaseJobsDatasource(tableName, { callbacks })
  }, [tableName, updateGridState])

  const sideBar = useMemo<SideBarDef>(
    () => ({
      toolPanels: ["columns", "filters-new"],
      defaultToolPanel: "columns",
      hiddenByDefault: true,
    }),
    [],
  )

  // Set Filter values come from the jobs_distinct RPC (cached per session, cleared on Refresh).
  const setFilterValuesFor = useCallback(
    (column: string) =>
      (params: SetFilterValuesFuncParams<JobsGridRow>) => {
        void fetchJobsDistinctCached(tableName, column).then((result) => {
          params.success(result.ok ? result.data : [])
        })
      },
    [tableName],
  )

  const baseColumnDefs = useMemo<ColDef<JobsGridRow>[]>(
    () => [
      {
        field: "company",
        filterParams: { values: setFilterValuesFor("company") },
      },
      {
        field: "job_title",
        headerName: "Job Title",
        width: 240,
        minWidth: 130,
      },
      {
        field: "job_description",
        headerName: "Description",
        width: 360,
        minWidth: 160,
        ...getLargeTextEditorColDef<JobsGridRow>(),
      },
      {
        field: "location",
        width: 165,
        minWidth: 105,
      },
      {
        field: "salary",
        width: 150,
        minWidth: 105,
      },
      {
        field: "is_remote",
        headerName: "Remote",
        width: 110,
        minWidth: 90,
        filter: "agSelectableColumnFilter",
        filterParams: { values: setFilterValuesFor("is_remote") },
        cellDataType: "boolean",
        cellRenderer: "agCheckboxCellRenderer",
        cellEditor: "agCheckboxCellEditor",
        editable: (params) => Boolean(params.data && !isGroupRow(params.data)),
      },
      {
        field: "workplace_type",
        headerName: "Workplace",
        width: 150,
        minWidth: 105,
        filterParams: { values: setFilterValuesFor("workplace_type") },
      },
      {
        field: "department",
        width: 150,
        minWidth: 105,
        filterParams: { values: setFilterValuesFor("department") },
      },
      {
        field: "date_published",
        headerName: "Published",
        width: 145,
        minWidth: 105,
        filter: "agSelectableColumnFilter",
        cellDataType: "dateString",
        valueFormatter: ({ value }) => formatDate(value ?? null),
      },
      {
        colId: "date_updated",
        field: "date_updated",
        headerName: "Updated",
        width: 145,
        minWidth: 105,
        filter: "agSelectableColumnFilter",
        cellDataType: "dateString",
        valueGetter: (params: ValueGetterParams<JobsGridRow>) => {
          if (!params.data || isGroupRow(params.data)) {
            return null
          }

          return getEffectiveUpdatedDate(params.data)
        },
        valueFormatter: ({ value }) => formatDate(value ?? null),
      },
      {
        colId: "days_since_updated",
        headerName: "Days",
        width: 105,
        minWidth: 85,
        editable: false,
        filter: "agSelectableColumnFilter",
        cellDataType: "number",
        valueGetter: (params: ValueGetterParams<JobsGridRow>) => {
          if (!params.data || isGroupRow(params.data)) {
            return null
          }

          return getDaysSinceUpdated(params.data)
        },
        valueFormatter: ({ value }) =>
          formatDays(typeof value === "number" ? value : null),
        cellClassRules: {
          "jobs-grid-cell--fresh": (params) =>
            typeof params.value === "number" && params.value <= 5,
        },
      },
      {
        field: "job_url",
        headerName: "Job URL",
        width: 300,
        minWidth: 170,
        editable: true,
        cellRenderer: JobUrlCellRenderer,
      },
      {
        colId: "apply_action",
        headerName: "Apply",
        width: 115,
        minWidth: 95,
        editable: false,
        sortable: false,
        filter: false,
        cellRenderer: ApplyActionCellRenderer,
      },
    ],
    [setFilterValuesFor],
  )

  const columnDefs = useMemo<ColDef<JobsGridRow>[]>(() => {
    const cols: ColDef<JobsGridRow>[] = [...baseColumnDefs]

    if (tableName === "apply") {
      cols.push({
        field: "keywords",
        headerName: "Keywords",
        width: 240,
        minWidth: 140,
        ...getLargeTextEditorColDef<JobsGridRow>(),
      })
    }

    if (tableName === "apply") {
      cols.push({
        field: "status",
        headerName: "Status",
        width: 150,
        minWidth: 120,
        filter: "agSelectableColumnFilter",
        filterParams: { values: setFilterValuesFor("status") },
        editable: (params) => Boolean(params.data && !isGroupRow(params.data)),
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: [...APPLY_STATUS_OPTIONS],
        },
        valueFormatter: ({ value }) => (typeof value === "string" ? value : ""),
      })
    }

    return cols
  }, [baseColumnDefs, setFilterValuesFor, tableName])

  const autoGroupColumnDef = useMemo<ColDef<JobsGridRow>>(
    () => ({
      headerName: "Group",
      width: 260,
      minWidth: 150,
      cellRendererParams: {
        suppressCount: false,
      },
    }),
    [],
  )

  const defaultColDef = useMemo<ColDef<JobsGridRow>>(
    () => ({
      editable: true,
      sortable: true,
      filter: "agSelectableColumnFilter",
      resizable: true,
      enableRowGroup: true,
      minWidth: 80,
      suppressMovable: false,
    }),
    [],
  )

  // Stable row ids for SSRM transactions. Leaf rows use job_url (PK).
  // Group rows use the group field's value, which is unique within a level's block.
  const getRowId = useCallback((params: GetRowIdParams<JobsGridRow>): string => {
    if (isGroupRow(params.data)) {
      for (const [key, value] of Object.entries(params.data)) {
        if (key !== "__group" && key !== "child_count") {
          return `__g|${String(value ?? "")}`
        }
      }
      return "__g|empty"
    }
    return params.data.job_url
  }, [])

  const defaultPersistedState = useMemo<JobsGridPersistedState>(
    () => ({
      rowGroup: {
        groupColIds: ["company"],
      },
      columnVisibility: {
        hiddenColIds: ["company"],
      },
      partialColumnState: true,
    }),
    [],
  )

  const handleGridReady = (event: GridReadyEvent<JobsGridRow>) => {
    gridPersistenceHydratedRef.current = false

    void loadGridState(tableName).then((result) => {
      event.api.setState(result.state ?? defaultPersistedState)
      gridPersistenceHydratedRef.current = true

      if (result.warning) {
        updateGridState({ error: result.warning })
      }
    })
  }

  const handleStateUpdated = (event: StateUpdatedEvent<JobsGridRow>) => {
    if (
      event.sources.includes("gridInitializing") ||
      !gridPersistenceHydratedRef.current
    ) {
      return
    }

    void saveGridState(tableName, event.state).then((result) => {
      if (!result.ok) {
        updateGridState({ error: result.error })
      }
    })
  }

  const handleGridPreDestroyed = (event: GridPreDestroyedEvent<JobsGridRow>) => {
    if (!gridPersistenceHydratedRef.current) {
      return
    }

    void saveGridState(tableName, event.state)
  }

  const handleSelectionChanged = useCallback(() => {
    const api = gridRef.current?.api
    if (!api) {
      return
    }
    setSelectedLeafCount(countSelectableLeafRows(api.getSelectedRows()))
  }, [])

  const handleRowClicked = (event: RowClickedEvent<JobsGridRow>) => {
    if (!event.data || event.node.group || isGroupRow(event.data)) {
      return
    }

    onSelectJob(event.data)
  }

  const handleCellValueChanged = async (event: CellValueChangedEvent<JobsGridRow>) => {
    // Guard against recursion: setDataValue (used to revert on failure) re-fires this event.
    if (isRevertingCellRef.current) {
      isRevertingCellRef.current = false
      return
    }

    if (!event.data || isGroupRow(event.data)) {
      return
    }

    const field = event.colDef.field as keyof JobRow | undefined
    if (!field) {
      return
    }

    const patch: Partial<JobRow> = {
      [field]: normalizeEditedValue(field, event.newValue),
    }

    const mutationResult = await updateSupabaseRow(tableName, event.data.job_url, patch)

    if (!mutationResult.ok) {
      // Revert the visible cell; the row will reconcile with the server on the next refresh.
      isRevertingCellRef.current = true
      event.node.setDataValue(field, event.oldValue)
      updateGridState({ error: mutationResult.error })
      return
    }

    // Apply as a server-side transaction so the cache stays in sync without refetching the block.
    event.api.applyServerSideTransaction({
      route: event.node.getRoute() ?? [],
      update: [event.data],
    })
    updateGridState({ error: null })
  }

  const withApi = (run: (api: GridApi<JobsGridRow>) => void) => {
    const api = gridRef.current?.api
    if (!api) {
      return
    }

    run(api)
  }

  const handleRefresh = () => {
    refreshData()
  }

  const handleExportCsv = () => {
    withApi((api) => api.exportDataAsCsv())
  }

  const handleExportExcel = () => {
    withApi((api) => api.exportDataAsExcel())
  }

  const handleToggleToolPanel = (panelId: JobsToolPanelId) => {
    withApi((api) => {
      const currentlyOpen = api.getOpenedToolPanel()
      const isPanelVisible = api.isSideBarVisible()

      if (currentlyOpen === panelId && isPanelVisible) {
        api.closeToolPanel()
        api.setSideBarVisible(false)
        return
      }

      api.setSideBarVisible(true)
      api.openToolPanel(panelId)
    })
  }

  const handleToggleColumns = () => {
    handleToggleToolPanel("columns")
  }

  const handleToggleFilters = () => {
    handleToggleToolPanel("filters-new")
  }

  const handleConfirmDelete = async () => {
    const api = gridRef.current?.api
    if (!api) {
      setIsDeleteDialogOpen(false)
      return
    }

    // Snapshot the selected leaf nodes (data + route) BEFORE the delete, so we can replay
    // the changes to the SSRM cache without a full refetch. Group rows are skipped.
    const selectedNodes = api.getSelectedNodes()
    const removalsByRoute = new Map<string, { route: string[]; rows: JobsGridRow[] }>()
    for (const node of selectedNodes) {
      const data = node.data
      if (!data || isGroupRow(data)) {
        continue
      }
      const route = node.getRoute() ?? []
      const key = route.join(" ")
      const bucket = removalsByRoute.get(key)
      if (bucket) {
        bucket.rows.push(data)
      } else {
        removalsByRoute.set(key, { route, rows: [data] })
      }
    }

    const jobUrls = Array.from(removalsByRoute.values())
      .flatMap((bucket) => bucket.rows.map((row) => (row as JobRow).job_url))
    if (jobUrls.length === 0) {
      setIsDeleteDialogOpen(false)
      return
    }

    setIsDeleting(true)
    const deleteResult = await deleteSupabaseJobs(tableName, jobUrls)

    if (!deleteResult.ok) {
      updateGridState({ error: deleteResult.error })
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
      // Pull truth from server since some rows may or may not have been deleted.
      api.refreshServerSide({ purge: true })
      return
    }

    updateGridState({ error: null })

    // Remove the rows from the SSRM cache without a full refetch.
    for (const { route, rows } of removalsByRoute.values()) {
      api.applyServerSideTransaction({ route, remove: rows })
    }

    setIsDeleting(false)
    setIsDeleteDialogOpen(false)
    api.deselectAll()
    setSelectedLeafCount(0)
  }

  return (
    <AgGridProvider modules={[AllEnterpriseModule]}>
      <div className="jobs-grid-shell flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-end gap-2">
          {toolbarLeadingAction}
          {enableRowDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={selectedLeafCount === 0 || isDeleting}
            >
              <RiDeleteBin6Line />
              {selectedLeafCount > 1 ? `Delete (${selectedLeafCount})` : "Delete"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RiRefreshLine />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleColumns}>
            <RiLayoutColumnLine />
            Columns
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleFilters}>
            Filters
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <RiDownload2Line />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <RiFileExcel2Line />
            Excel
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          <AgGridReact<JobsGridRow>
            ref={gridRef}
            theme={jobsGridTheme}
            rowModelType="serverSide"
            serverSideDatasource={datasource}
            getRowId={getRowId}
            columnDefs={columnDefs}
            autoGroupColumnDef={autoGroupColumnDef}
            defaultColDef={defaultColDef}
            maintainColumnOrder={true}
            sideBar={sideBar}
            enableFilterHandlers={true}
            rowGroupPanelShow="always"
            groupDisplayType="singleColumn"
            groupDefaultExpanded={0}
            showOpenedGroup={true}
            pagination={true}
            paginationPageSize={100}
            paginationPageSizeSelector={[100, 250, 500, 1000]}
            cacheBlockSize={100}
            rowSelection={{ mode: "multiRow" }}
            onGridReady={handleGridReady}
            onStateUpdated={handleStateUpdated}
            onGridPreDestroyed={handleGridPreDestroyed}
            onSelectionChanged={handleSelectionChanged}
            onRowClicked={handleRowClicked}
            onCellValueChanged={handleCellValueChanged}
            suppressAggFuncInHeader={true}
            animateRows={true}
          />
        </div>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedLeafCount === 1 ? "this row" : `these ${selectedLeafCount} rows`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected {selectedLeafCount === 1 ? "row" : "rows"} from
              the {tableName} table. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                handleConfirmDelete()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AgGridProvider>
  )
})
