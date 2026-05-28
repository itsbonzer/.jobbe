import { useMemo, useRef, useState } from "react"
import { MagnifyingglassIcon } from "@exawizards/exabase-design-system-icons-react"

import { Input } from "@/components/ui/input"

import { CompanyDirectoryItem } from "./CompanyDirectoryItem"
import type { CompanyDirectoryRow } from "./types"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

export type CompanyDirectoryProps = {
  companies: CompanyDirectoryRow[]
  selectedCompany: string | null
  onSelectCompany: (company: string) => void
}

type LetterSection = {
  letter: string
  rows: CompanyDirectoryRow[]
}

export function CompanyDirectory({
  companies,
  selectedCompany,
  onSelectCompany,
}: CompanyDirectoryProps) {
  const [query, setQuery] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const trimmedQuery = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (trimmedQuery.length === 0) {
      return companies
    }
    return companies.filter((c) =>
      c.company.toLowerCase().includes(trimmedQuery),
    )
  }, [companies, trimmedQuery])

  const sections = useMemo<LetterSection[]>(() => {
    const groups = new Map<string, CompanyDirectoryRow[]>()
    for (const row of filtered) {
      const letter = firstLetter(row.company)
      const bucket = groups.get(letter) ?? []
      bucket.push(row)
      groups.set(letter, bucket)
    }
    return Array.from(groups.entries())
      .map(([letter, rows]) => ({ letter, rows }))
      .sort((a, b) => a.letter.localeCompare(b.letter))
  }, [filtered])

  const activeLetters = useMemo(() => {
    const set = new Set<string>()
    for (const section of sections) {
      set.add(section.letter)
    }
    return set
  }, [sections])

  const handleRailClick = (letter: string) => {
    if (!activeLetters.has(letter)) {
      return
    }
    const target = scrollRef.current?.querySelector<HTMLElement>(
      `[data-letter-section="${letter}"]`,
    )
    target?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  return (
    <div className="company-directory">
      <div className="company-directory__search">
        <MagnifyingglassIcon
          className="company-directory__search-icon"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search companies"
          aria-label="Search companies"
          className="company-directory__search-input"
        />
      </div>

      <div className="company-directory__body">
        <div className="company-directory__scroll" ref={scrollRef}>
          {sections.length === 0 ? (
            <div className="company-directory__empty">
              No companies match &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : (
            sections.map((section) => (
              <section
                key={section.letter}
                data-letter-section={section.letter}
                className="company-directory__section"
              >
                <h3 className="company-directory__section-heading">
                  {section.letter}
                </h3>
                <div className="company-directory__section-list" role="list">
                  {section.rows.map((row) => (
                    <CompanyDirectoryItem
                      key={row.company}
                      company={row}
                      isSelected={selectedCompany === row.company}
                      onClick={() => onSelectCompany(row.company)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <nav className="company-directory__rail" aria-label="Jump to letter">
          {ALPHABET.map((letter) => {
            const active = activeLetters.has(letter)
            return (
              <button
                key={letter}
                type="button"
                disabled={!active}
                onClick={() => handleRailClick(letter)}
                className={`company-directory__rail-letter ${
                  active ? "company-directory__rail-letter--active" : ""
                }`}
                aria-label={`Jump to ${letter}`}
                tabIndex={active ? 0 : -1}
              >
                {letter}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

function firstLetter(name: string): string {
  for (const char of name) {
    const upper = char.toUpperCase()
    if (upper >= "A" && upper <= "Z") {
      return upper
    }
  }
  return "#"
}
