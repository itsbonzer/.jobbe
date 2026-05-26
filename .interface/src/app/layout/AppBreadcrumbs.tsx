import { Fragment } from "react"
import { Link, useLocation } from "react-router-dom"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { PATH_LABELS } from "@/app/navigation/routes"

import "./app-breadcrumbs.css"

type Crumb = {
  path: string
  label: string
}

function buildTrail(pathname: string): Crumb[] {
  const trail: Crumb[] = [{ path: "/", label: PATH_LABELS["/"] }]

  const segments = pathname.split("/").filter(Boolean)
  let acc = ""
  for (const segment of segments) {
    acc += "/" + segment
    const label =
      PATH_LABELS[acc] ??
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")
    trail.push({ path: acc, label })
  }
  return trail
}

export function AppBreadcrumbs() {
  const { pathname } = useLocation()
  const trail = buildTrail(pathname)

  return (
    <Breadcrumb className="app-breadcrumbs">
      <BreadcrumbList>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1
          return (
            <Fragment key={crumb.path}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.path} />}>
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
