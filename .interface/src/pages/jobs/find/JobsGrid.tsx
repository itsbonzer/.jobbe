import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowClockwiseIcon,
  BoxOutArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocCsvIcon,
  DocXlsxIcon,
  FilterIcon,
  TableIcon,
  TrashIcon,
} from "@exawizards/exabase-design-system-icons-react"
import type {
  CellValueChangedEvent,
  ColDef,
  GridPreDestroyedEvent,
  GridReadyEvent,
  GetRowIdParams,
  ICellRendererParams,
  RowClickedEvent,
  SetFilterValuesFuncParams,
  SideBarDef,
  StateUpdatedEvent,
  ValueFormatterParams,
  ValueGetterParams,
} from "ag-grid-community"
import { colorSchemeDark, themeQuartz } from "ag-grid-community"
import { AllEnterpriseModule } from "ag-grid-enterprise"
import { AgGridProvider, AgGridReact } from "ag-grid-react"

import { Button } from "@/components/ui/button"

import { createJobsDatasource } from "./createJobsDatasource"
import {
  DEFAULT_JOBS_GRID_STATE,
  loadJobsGridState,
  saveJobsGridState,
} from "./gridState"
import { deleteJobRows, fetchJobsDistinctValues, updateJobRow } from "./jobsApi"
import {
  getDaysSinceUpdated,
  getEffectiveUpdatedDate,
  isGroupRow,
  type JobRow,
  type JobsGridRow,
} from "./types"
import { JobDetailsPanel } from "./JobDetailsPanel"

export type JobsGridState = {
  isLoading: boolean
  isEmpty: boolean
  error: string | null
}

type JobsGridProps = {
  onStateChange?: (state: JobsGridState) => void
}

const INITIAL_STATE: JobsGridState = {
  isLoading: true,
  isEmpty: false,
  error: null,
}

const BOOLEAN_FIELDS = new Set<keyof JobRow>([
  "is_listed",
  "is_remote",
  "telecommuting",
])
const NULLABLE_TEXT_FIELDS = new Set<keyof JobRow>([
  "location",
  "department",
  "job_description",
  "salary",
  "date_published",
  "date_updated",
  "ats",
  "workplace_type",
  "education",
  "experience",
  "status",
  "keywords",
])

const jobsGridTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#101317",
  dataBackgroundColor: "#1a1f25",
  chromeBackgroundColor: "#090a0b",
  headerBackgroundColor: "#090a0b",
  oddRowBackgroundColor: "#1a1f25",
  borderColor: "#232931",
  rowHoverColor: "#272d35",
  browserColorScheme: "dark",
})

export function JobsGrid({ onStateChange }: JobsGridProps) {
  const gridRef = useRef<AgGridReact<JobsGridRow>>(null)
  const distinctValuesCache = useRef(new Map<string, Array<string | null>>())
  const isRevertingCellRef = useRef(false)
  const gridStateHydratedRef = useRef(false)
  const [gridState, setGridState] = useState<JobsGridState>(INITIAL_STATE)
  const [selectedLeafCount, setSelectedLeafCount] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [detailsJob, setDetailsJob] = useState<JobRow | null>(null)

  const updateGridState = useCallback((nextState: Partial<JobsGridState>) => {
    setGridState((prev) => ({
      ...prev,
      ...nextState,
    }))
  }, [])

  useEffect(() => {
    onStateChange?.(gridState)
  }, [gridState, onStateChange])

  const datasource = useMemo(
    () =>
      createJobsDatasource({
        table: "jobs",
        callbacks: {
          onLoadStart: () => {
            updateGridState({ isLoading: true, error: null })
          },
          onLoadSuccess: ({ query, response }) => {
            updateGridState({
              isLoading: false,
              error: null,
              isEmpty:
                query.groupKeys.length === 0 ? response.lastRow === 0 : false,
            })
          },
          onLoadError: (message) => {
            updateGridState({ isLoading: false, error: message })
          },
        },
      }),
    [updateGridState],
  )

  const createSetFilterValues = useCallback(
    (column: string) =>
      (params: SetFilterValuesFuncParams<JobsGridRow, string>) => {
        const cachedValues = distinctValuesCache.current.get(column)
        if (cachedValues) {
          params.success(cachedValues)
          return
        }

        void fetchJobsDistinctValues({ table: "jobs", column }).then((result) => {
          if (!result.ok) {
            updateGridState({ error: result.error })
            params.success([])
            return
          }

          distinctValuesCache.current.set(column, result.data.values)
          params.success(result.data.values)
        })
      },
    [updateGridState],
  )

  const columnDefs = useMemo<ColDef<JobsGridRow>[]>(
    () => {
      const setFilter = (column: string) => ({
        filter: "agSetColumnFilter",
        filterParams: {
          values: createSetFilterValues(column),
          suppressClearModelOnRefreshValues: true,
        },
      })

      return [
        {
          field: "company",
          rowGroup: true,
          hide: true,
          ...setFilter("company"),
        },
        {
          field: "job_title",
          headerName: "Job Title",
          minWidth: 180,
          width: 260,
        },
        {
          field: "job_description",
          headerName: "Description",
          minWidth: 180,
          width: 360,
          cellRenderer: (
            params: ICellRendererParams<JobsGridRow, string | null>,
          ) => {
            const job = params.data
            if (!job || isGroupRow(job)) {
              return null
            }

            const description = params.value?.trim() || "No description"
            return (
              <span className="jobs-grid-description-text" title={description}>
                {description}
              </span>
            )
          },
        },
        {
          field: "location",
          minWidth: 140,
          width: 180,
          ...setFilter("location"),
        },
        {
          field: "department",
          minWidth: 140,
          width: 180,
          ...setFilter("department"),
        },
        {
          field: "salary",
          minWidth: 130,
          width: 170,
        },
        {
          field: "is_remote",
          headerName: "Remote",
          cellDataType: "boolean",
          cellRenderer: "agCheckboxCellRenderer",
          cellEditor: "agCheckboxCellEditor",
          minWidth: 100,
          width: 110,
          ...setFilter("is_remote"),
        },
        {
          field: "workplace_type",
          headerName: "Workplace",
          minWidth: 120,
          width: 150,
          ...setFilter("workplace_type"),
        },
        {
          field: "date_published",
          headerName: "Published",
          cellDataType: "dateString",
          filter: "agDateColumnFilter",
          minWidth: 120,
          width: 135,
          valueFormatter: formatNullableValue,
        },
        {
          colId: "date_updated",
          field: "date_updated",
          headerName: "Updated",
          cellDataType: "dateString",
          filter: "agDateColumnFilter",
          minWidth: 120,
          width: 135,
          valueGetter: (params: ValueGetterParams<JobsGridRow>) => {
            if (!params.data || isGroupRow(params.data)) {
              return null
            }

            return getEffectiveUpdatedDate(params.data)
          },
          valueFormatter: formatNullableValue,
        },
        {
          colId: "days_since_updated",
          headerName: "Days",
          minWidth: 90,
          width: 105,
          editable: false,
          cellDataType: "number",
          filter: "agNumberColumnFilter",
          valueGetter: (params: ValueGetterParams<JobsGridRow>) => {
            if (!params.data || isGroupRow(params.data)) {
              return null
            }

            return getDaysSinceUpdated(params.data)
          },
          valueFormatter: ({ value }) =>
            typeof value === "number" ? `${value}` : "",
        },
        {
          field: "ats",
          headerName: "ATS",
          minWidth: 110,
          width: 130,
          ...setFilter("ats"),
        },
        {
          colId: "apply_action",
          headerName: "Apply",
          editable: false,
          sortable: false,
          filter: false,
          minWidth: 95,
          width: 115,
          cellRenderer: (
            params: ICellRendererParams<JobsGridRow, string | null>,
          ) => {
            const job = params.data
            if (!job || isGroupRow(job)) {
              return null
            }

            return (
              <button
                type="button"
                className="jobs-grid-cell-button jobs-grid-apply-button"
                onClick={(event) => {
                  event.stopPropagation()
                  openJobPost(job.job_url)
                }}
                title="Open original job post"
              >
                <BoxOutArrowUpIcon aria-hidden="true" />
                <span>Apply</span>
              </button>
            )
          },
        },
        {
          field: "job_url",
          headerName: "Job URL",
          editable: false,
          minWidth: 240,
          width: 320,
        },
      ]
    },
    [createSetFilterValues],
  )

  const defaultColDef = useMemo<ColDef<JobsGridRow>>(
    () => ({
      editable: (params) => Boolean(params.data && !isGroupRow(params.data)),
      sortable: true,
      filter: "agTextColumnFilter",
      resizable: true,
      enableRowGroup: true,
      minWidth: 90,
    }),
    [],
  )

  const autoGroupColumnDef = useMemo<ColDef<JobsGridRow>>(
    () => ({
      headerName: "Company",
      minWidth: 220,
      width: 280,
      cellRendererParams: {
        suppressCount: false,
      },
    }),
    [],
  )

  const sideBar = useMemo<SideBarDef>(
    () => ({
      toolPanels: ["columns", "filters"],
      hiddenByDefault: true,
    }),
    [],
  )

  const getRowId = useCallback((params: GetRowIdParams<JobsGridRow>): string => {
    if (isGroupRow(params.data)) {
      const groupEntry = Object.entries(params.data).find(
        ([key]) => key !== "__group" && key !== "child_count",
      )
      return `group:${groupEntry?.[0] ?? "unknown"}:${String(groupEntry?.[1] ?? "")}`
    }

    return params.data.job_url
  }, [])

  const handleSelectionChanged = useCallback(() => {
    const selectedRows = gridRef.current?.api.getSelectedRows() ?? []
    setSelectedLeafCount(selectedRows.filter(isJobRow).length)
  }, [])

  const handleRowClicked = useCallback((event: RowClickedEvent<JobsGridRow>) => {
    const row = event.data
    if (!row || isGroupRow(row)) {
      return
    }

    setDetailsJob(row)
  }, [])

  const handleCellValueChanged = useCallback(
    async (event: CellValueChangedEvent<JobsGridRow>) => {
      if (isRevertingCellRef.current) {
        isRevertingCellRef.current = false
        return
      }

      if (!event.data || isGroupRow(event.data)) {
        return
      }

      const field = event.colDef.field as keyof JobRow | undefined
      if (!field || field === "job_url") {
        return
      }

      const nextValue = normalizeEditedValue(field, event.newValue)
      if (Object.is(nextValue, event.oldValue)) {
        return
      }

      const patch = { [field]: nextValue } as Partial<JobRow>
      const result = await updateJobRow(event.data.job_url, {
        table: "jobs",
        patch,
      })

      if (!result.ok) {
        isRevertingCellRef.current = true
        event.node.setDataValue(field, event.oldValue)
        updateGridState({ error: result.error })
        return
      }

      updateGridState({ error: null })
    },
    [updateGridState],
  )

  const handleRefresh = () => {
    distinctValuesCache.current.clear()
    setSelectedLeafCount(0)
    updateGridState({ isLoading: true, error: null })
    gridRef.current?.api.refreshServerSide({ purge: true })
  }

  const handleExpandAll = () => {
    gridRef.current?.api.expandAll()
  }

  const handleCollapseAll = () => {
    gridRef.current?.api.collapseAll()
  }

  const handleGridReady = (event: GridReadyEvent<JobsGridRow>) => {
    gridStateHydratedRef.current = false

    void loadJobsGridState().then((result) => {
      event.api.setState(result.state ?? DEFAULT_JOBS_GRID_STATE)
      gridStateHydratedRef.current = true

      if (result.warning) {
        updateGridState({ error: result.warning })
      }
    })
  }

  const handleStateUpdated = (event: StateUpdatedEvent<JobsGridRow>) => {
    if (
      !gridStateHydratedRef.current ||
      event.sources.includes("gridInitializing") ||
      event.sources.includes("api")
    ) {
      return
    }

    void saveJobsGridState(event.state).then((result) => {
      if (!result.ok) {
        updateGridState({ error: result.error })
      }
    })
  }

  const handleGridPreDestroyed = (
    event: GridPreDestroyedEvent<JobsGridRow>,
  ) => {
    if (!gridStateHydratedRef.current) {
      return
    }

    void saveJobsGridState(event.state)
  }

  const handleToggleToolPanel = (panelId: string) => {
    const api = gridRef.current?.api
    if (!api) {
      return
    }

    const isOpen = api.isSideBarVisible() && api.getOpenedToolPanel() === panelId
    if (isOpen) {
      api.closeToolPanel()
      api.setSideBarVisible(false)
      return
    }

    api.setSideBarVisible(true)
    api.openToolPanel(panelId)
  }

  const handleExportCsv = () => {
    gridRef.current?.api.exportDataAsCsv()
  }

  const handleExportExcel = () => {
    gridRef.current?.api.exportDataAsExcel()
  }

  const handleDeleteSelected = async () => {
    const api = gridRef.current?.api
    if (!api || selectedLeafCount === 0) {
      return
    }

    const selectedRows = api.getSelectedRows().filter(isJobRow)
    if (selectedRows.length === 0) {
      setSelectedLeafCount(0)
      return
    }

    const rowLabel = selectedRows.length === 1 ? "row" : "rows"
    const confirmed = window.confirm(
      `Delete ${selectedRows.length} selected ${rowLabel}? This cannot be undone.`,
    )
    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    const result = await deleteJobRows({
      table: "jobs",
      jobUrls: selectedRows.map((row) => row.job_url),
    })

    setIsDeleting(false)

    if (!result.ok) {
      updateGridState({ error: result.error })
      api.refreshServerSide({ purge: true })
      return
    }

    api.deselectAll()
    setSelectedLeafCount(0)
    updateGridState({ error: null, isLoading: true })
    api.refreshServerSide({ purge: true })
  }

  return (
    <AgGridProvider modules={[AllEnterpriseModule]}>
      <div className="jobs-grid-shell">
        <div className="jobs-grid-toolbar">
          <Button
            variant="outline"
            onClick={handleExpandAll}
            aria-label="Expand all company groups"
            title="Expand all company groups"
          >
            <ChevronDownIcon aria-hidden="true" />
            <span>Expand</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleCollapseAll}
            aria-label="Collapse all company groups"
            title="Collapse all company groups"
          >
            <ChevronUpIcon aria-hidden="true" />
            <span>Collapse</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            aria-label="Refresh jobs"
            title="Refresh jobs"
          >
            <ArrowClockwiseIcon aria-hidden="true" />
            <span>Refresh</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => handleToggleToolPanel("columns")}
            aria-label="Show columns"
            title="Show columns"
          >
            <TableIcon aria-hidden="true" />
            <span>Columns</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => handleToggleToolPanel("filters")}
            aria-label="Show filters"
            title="Show filters"
          >
            <FilterIcon aria-hidden="true" />
            <span>Filters</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCsv}
            aria-label="Export CSV"
            title="Export CSV"
          >
            <DocCsvIcon aria-hidden="true" />
            <span>CSV</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleExportExcel}
            aria-label="Export Excel"
            title="Export Excel"
          >
            <DocXlsxIcon aria-hidden="true" />
            <span>Excel</span>
          </Button>
          <Button
            variant="destructive-outline"
            onClick={handleDeleteSelected}
            disabled={selectedLeafCount === 0 || isDeleting}
            aria-label="Delete selected jobs"
            title="Delete selected jobs"
          >
            <TrashIcon aria-hidden="true" />
            <span>
              {selectedLeafCount > 0 ? `Delete (${selectedLeafCount})` : "Delete"}
            </span>
          </Button>
        </div>

        <div className="jobs-grid-frame">
          <AgGridReact<JobsGridRow>
            ref={gridRef}
            theme={jobsGridTheme}
            rowModelType="serverSide"
            serverSideDatasource={datasource}
            getRowId={getRowId}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            autoGroupColumnDef={autoGroupColumnDef}
            maintainColumnOrder={true}
            sideBar={sideBar}
            groupDisplayType="singleColumn"
            groupDefaultExpanded={0}
            showOpenedGroup={true}
            rowGroupPanelShow="always"
            rowSelection={{ mode: "multiRow" }}
            isRowSelectable={(node) =>
              Boolean(node.data && !isGroupRow(node.data))
            }
            onGridReady={handleGridReady}
            onStateUpdated={handleStateUpdated}
            onGridPreDestroyed={handleGridPreDestroyed}
            onSelectionChanged={handleSelectionChanged}
            onRowClicked={handleRowClicked}
            onCellValueChanged={handleCellValueChanged}
            pagination={true}
            paginationPageSize={100}
            paginationPageSizeSelector={[100, 250, 500, 1000]}
            cacheBlockSize={100}
            suppressAggFuncInHeader={true}
          />
        </div>

        <JobDetailsPanel job={detailsJob} onClose={() => setDetailsJob(null)} />
      </div>
    </AgGridProvider>
  )
}

function openJobPost(jobUrl: string): void {
  const nextWindow = window.open(jobUrl, "_blank", "noopener,noreferrer")
  if (nextWindow) {
    nextWindow.opener = null
  }
}

function formatNullableValue(
  params: ValueFormatterParams<JobsGridRow, string | null>,
): string {
  return params.value ?? ""
}

function isJobRow(row: JobsGridRow): row is JobRow {
  return !isGroupRow(row)
}

function normalizeEditedValue(
  field: keyof JobRow,
  value: unknown,
): JobRow[keyof JobRow] {
  if (BOOLEAN_FIELDS.has(field)) {
    if (typeof value === "boolean") {
      return value
    }

    if (typeof value === "string") {
      return value.trim().toLowerCase() === "true"
    }

    if (typeof value === "number") {
      return value !== 0
    }

    return null
  }

  if (NULLABLE_TEXT_FIELDS.has(field)) {
    if (typeof value !== "string") {
      return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  return value as JobRow[keyof JobRow]
}
