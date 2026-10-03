import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

type StatProps = {
  icon: LucideIcon
  label: string
  value: ReactNode
}

/** Compact key figure (icon + value + label) for headers and summaries. */
export function Stat({ icon: Icon, label, value }: StatProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg leading-tight font-semibold tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
