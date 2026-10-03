import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"

type Crumb = { label: string; to?: string }

type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  /** Optional breadcrumb trail shown above the title. */
  breadcrumbs?: Crumb[]
  actions?: ReactNode
  children?: ReactNode
}

export function PageHeader({ title, description, breadcrumbs, actions, children }: PageHeaderProps) {
  return (
    <div className="space-y-3">
      {breadcrumbs?.length ? (
        <nav aria-label="Brotkrumen" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3" />}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-foreground hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}
