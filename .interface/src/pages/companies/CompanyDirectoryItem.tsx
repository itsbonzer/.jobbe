import type { CompanyDirectoryRow } from "./types"

export type CompanyDirectoryItemProps = {
  company: CompanyDirectoryRow
  isSelected: boolean
  onClick: () => void
}

export function CompanyDirectoryItem({
  company,
  isSelected,
  onClick,
}: CompanyDirectoryItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`${company.company}, ${company.job_count} ${company.job_count === 1 ? "job" : "jobs"}${company.has_recent_alert ? ", new posting in last 24 hours" : ""}`}
      className={`company-directory-item${
        isSelected ? " company-directory-item--selected" : ""
      }`}
    >
      {company.has_recent_alert ? (
        <span className="company-directory-item__alert" aria-hidden="true" />
      ) : null}

      <div className="company-directory-item__header">
        <span className="company-directory-item__title">{company.company}</span>
        {company.workplace_type ? (
          <span className="company-directory-item__chip">
            {company.workplace_type}
          </span>
        ) : null}
      </div>

      <div className="company-directory-item__footer">
        <span className="company-directory-item__count">
          {company.job_count} {company.job_count === 1 ? "job" : "jobs"}
        </span>
        <span className="company-directory-item__date">
          {formatLastPosted(company.latest_date_updated)}
        </span>
      </div>
    </button>
  )
}

function formatLastPosted(iso: string | null): string {
  if (!iso) {
    return "—"
  }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return "—"
  }
  const diffMs = Date.now() - parsed.getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / dayMs)
  if (days < 1) {
    return "Today"
  }
  if (days < 2) {
    return "Yesterday"
  }
  if (days < 7) {
    return `${days}d ago`
  }
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks}w ago`
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
