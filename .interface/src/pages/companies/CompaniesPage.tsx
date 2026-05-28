import { useEffect, useReducer, useRef } from "react"

import { CompanyDirectory } from "./CompanyDirectory"
import { CompanyJobsList } from "./CompanyJobsList"
import { JobDescriptionPanel } from "./JobDescriptionPanel"
import {
  fetchCompanies,
  fetchCompaniesSelection,
  fetchCompanyJobs,
  saveCompaniesSelection,
} from "./companiesApi"
import type { CompanyDirectoryRow, JobRow } from "./types"

import "./companies.css"

type CompaniesPageState = {
  companies: CompanyDirectoryRow[]
  jobs: JobRow[]
  selectedCompany: string | null
  selectedJob: JobRow | null
  loadingCompanies: boolean
  loadingJobs: boolean
  errorCompanies: string | null
  errorJobs: string | null
  selectionReady: boolean
}

type CompaniesPageAction =
  | { type: "companies/loading" }
  | {
      type: "companies/loaded"
      companies: CompanyDirectoryRow[]
      selectedCompany: string | null
      selectionReady: boolean
    }
  | { type: "companies/failed"; error: string }
  | { type: "jobs/loading" }
  | {
      type: "jobs/loaded"
      jobs: JobRow[]
      selectedJob: JobRow | null
      selectionReady: boolean
    }
  | { type: "jobs/failed"; error: string; selectionReady: boolean }
  | { type: "company/selected"; company: string }
  | { type: "job/selected"; job: JobRow }
  | { type: "job/cleared" }

const initialState: CompaniesPageState = {
  companies: [],
  jobs: [],
  selectedCompany: null,
  selectedJob: null,
  loadingCompanies: false,
  loadingJobs: false,
  errorCompanies: null,
  errorJobs: null,
  selectionReady: false,
}

export function CompaniesPage() {
  const [state, dispatch] = useReducer(companiesPageReducer, initialState)
  const pendingRestoreJobUrlRef = useRef<string | null>(null)
  const restoringCompanyRef = useRef<string | null>(null)
  const lastSavedSelectionRef = useRef(selectionSignature(null, null))

  const selectedJobUrl = state.selectedJob?.job_url ?? null

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      dispatch({ type: "companies/loading" })

      const [companiesResult, selectionResult] = await Promise.all([
        fetchCompanies(),
        fetchCompaniesSelection(),
      ])

      if (cancelled) {
        return
      }

      if (!companiesResult.ok) {
        pendingRestoreJobUrlRef.current = null
        restoringCompanyRef.current = null
        lastSavedSelectionRef.current = selectionSignature(null, null)
        dispatch({ type: "companies/failed", error: companiesResult.error })
        return
      }

      const companies = sortCompanies(companiesResult.data.companies)
      const savedSelection = selectionResult.ok ? selectionResult.data : null
      const savedCompany =
        savedSelection?.company &&
        companies.some((row) => row.company === savedSelection.company)
          ? savedSelection.company
          : null

      if (savedCompany) {
        pendingRestoreJobUrlRef.current = savedSelection?.jobUrl ?? null
        restoringCompanyRef.current = savedCompany
        dispatch({
          type: "companies/loaded",
          companies,
          selectedCompany: savedCompany,
          selectionReady: false,
        })
        return
      }

      pendingRestoreJobUrlRef.current = null
      restoringCompanyRef.current = null
      lastSavedSelectionRef.current = selectionSignature(null, null)
      dispatch({
        type: "companies/loaded",
        companies,
        selectedCompany: null,
        selectionReady: true,
      })
    }

    void loadInitialData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state.selectedCompany === null) {
      return
    }

    let cancelled = false
    const company = state.selectedCompany

    async function loadJobs() {
      dispatch({ type: "jobs/loading" })
      const jobsResult = await fetchCompanyJobs(company)

      if (cancelled) {
        return
      }

      const isRestore = restoringCompanyRef.current === company
      if (!jobsResult.ok) {
        if (isRestore) {
          pendingRestoreJobUrlRef.current = null
          restoringCompanyRef.current = null
          lastSavedSelectionRef.current = selectionSignature(company, null)
        }
        dispatch({
          type: "jobs/failed",
          error: jobsResult.error,
          selectionReady: true,
        })
        return
      }

      const jobs = sortJobs(jobsResult.data.jobs)
      let selectedJob: JobRow | null = null

      if (isRestore) {
        const restoreJobUrl = pendingRestoreJobUrlRef.current
        selectedJob = restoreJobUrl
          ? jobs.find((job) => job.job_url === restoreJobUrl) ?? null
          : null
        pendingRestoreJobUrlRef.current = null
        restoringCompanyRef.current = null
        lastSavedSelectionRef.current = selectionSignature(
          company,
          selectedJob?.job_url ?? null,
        )
      }

      dispatch({
        type: "jobs/loaded",
        jobs,
        selectedJob,
        selectionReady: true,
      })
    }

    void loadJobs()

    return () => {
      cancelled = true
    }
  }, [state.selectedCompany])

  useEffect(() => {
    if (!state.selectionReady) {
      return
    }

    const signature = selectionSignature(state.selectedCompany, selectedJobUrl)
    if (signature === lastSavedSelectionRef.current) {
      return
    }

    const timeout = window.setTimeout(() => {
      void saveCompaniesSelection({
        company: state.selectedCompany,
        jobUrl: selectedJobUrl,
      }).then((result) => {
        if (result.ok) {
          lastSavedSelectionRef.current = signature
        }
      })
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [state.selectedCompany, selectedJobUrl, state.selectionReady])

  const handleSelectCompany = (company: string) => {
    pendingRestoreJobUrlRef.current = null
    restoringCompanyRef.current = null
    dispatch({ type: "company/selected", company })
  }

  const handleApplyToJob = (job: JobRow) => {
    const nextWindow = window.open(job.job_url, "_blank", "noopener,noreferrer")
    if (nextWindow) {
      nextWindow.opener = null
    }
  }

  return (
    <div className="companies-page">
      <section className="companies-panel" aria-label="Companies directory">
        {state.loadingCompanies && state.companies.length === 0 ? (
          <div className="companies-panel__empty">Loading companies.</div>
        ) : state.errorCompanies ? (
          <div className="companies-panel__empty">{state.errorCompanies}</div>
        ) : (
          <CompanyDirectory
            companies={state.companies}
            selectedCompany={state.selectedCompany}
            onSelectCompany={handleSelectCompany}
          />
        )}
      </section>

      <section className="companies-panel" aria-label="Jobs at company">
        {state.selectedCompany === null ? (
          <div className="companies-panel__empty">Select a company.</div>
        ) : state.loadingJobs && state.jobs.length === 0 ? (
          <div className="companies-panel__empty">Loading jobs.</div>
        ) : state.errorJobs ? (
          <div className="companies-panel__empty">{state.errorJobs}</div>
        ) : (
          <CompanyJobsList
            jobs={state.jobs}
            selectedJobUrl={selectedJobUrl}
            onSelectJob={(job) => dispatch({ type: "job/selected", job })}
            onApplyToJob={handleApplyToJob}
          />
        )}
      </section>

      <section className="companies-panel" aria-label="Job description">
        <JobDescriptionPanel
          job={state.selectedJob}
          onClose={() => dispatch({ type: "job/cleared" })}
        />
      </section>
    </div>
  )
}

function companiesPageReducer(
  state: CompaniesPageState,
  action: CompaniesPageAction,
): CompaniesPageState {
  switch (action.type) {
    case "companies/loading":
      return {
        ...state,
        loadingCompanies: true,
        errorCompanies: null,
      }
    case "companies/loaded":
      return {
        ...state,
        companies: action.companies,
        selectedCompany: action.selectedCompany,
        selectedJob: null,
        jobs: [],
        loadingCompanies: false,
        errorCompanies: null,
        selectionReady: action.selectionReady,
      }
    case "companies/failed":
      return {
        ...state,
        companies: [],
        jobs: [],
        selectedCompany: null,
        selectedJob: null,
        loadingCompanies: false,
        errorCompanies: action.error,
        selectionReady: true,
      }
    case "jobs/loading":
      return {
        ...state,
        loadingJobs: true,
        errorJobs: null,
      }
    case "jobs/loaded":
      return {
        ...state,
        jobs: action.jobs,
        selectedJob: action.selectedJob,
        loadingJobs: false,
        errorJobs: null,
        selectionReady: action.selectionReady,
      }
    case "jobs/failed":
      return {
        ...state,
        jobs: [],
        selectedJob: null,
        loadingJobs: false,
        errorJobs: action.error,
        selectionReady: action.selectionReady,
      }
    case "company/selected":
      return {
        ...state,
        selectedCompany: action.company,
        selectedJob: null,
        jobs: [],
        loadingJobs: false,
        errorJobs: null,
      }
    case "job/selected":
      return {
        ...state,
        selectedJob: action.job,
      }
    case "job/cleared":
      return {
        ...state,
        selectedJob: null,
      }
  }
}

function sortCompanies(companies: CompanyDirectoryRow[]): CompanyDirectoryRow[] {
  return [...companies].sort((a, b) =>
    a.company.localeCompare(b.company, undefined, { sensitivity: "base" }),
  )
}

function sortJobs(jobs: JobRow[]): JobRow[] {
  return [...jobs].sort((a, b) => {
    const aDate = a.date_updated ?? a.date_published ?? ""
    const bDate = b.date_updated ?? b.date_published ?? ""
    return bDate.localeCompare(aDate)
  })
}

function selectionSignature(
  company: string | null,
  jobUrl: string | null,
): string {
  return JSON.stringify({ company, jobUrl })
}
