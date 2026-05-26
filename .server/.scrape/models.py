from dataclasses import dataclass, field


@dataclass
class CompanyInput:
    name: str
    keywords: list[str] = field(default_factory=list)
    api_url: str = ""
    record_id: str = ""


@dataclass
class ATSMatch:
    company_name: str
    ats: str        # "greenhouse", "ashby", "lever", "workable"
    slug: str       # the slug variation that worked
    board_url: str  # full probe URL that returned data


@dataclass
class Job:
    job_url: str
    company: str
    job_title: str
    department: str
    job_description: str
    location: str
    salary: str
    is_remote: str       # "Yes", "No", or ""
    workplace_type: str  # "Remote", "Hybrid", "On-site", or ""
    date_published: str
    date_updated: str
    ats: str


@dataclass
class UnresolvedCompany:
    company_name: str
    slug_attempts: list[str] = field(default_factory=list)
    ats_attempts: list[str] = field(default_factory=list)
    reason: str = ""


@dataclass
class RunMetadata:
    run_id: str
    started_at: str
    finished_at: str
    status: str  # "running", "completed", "failed"
    total_companies: int = 0
    matched_companies: int = 0
    jobs_seen: int = 0
    unresolved_count: int = 0
    error_count: int = 0