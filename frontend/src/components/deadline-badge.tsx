import { Badge } from "@/components/ui/badge"
import type { Deadline } from "@/lib/api"
import { deadlineText } from "@/lib/deadlines"
import { cn } from "@/lib/utils"

const STYLE: Record<Deadline["state"], string> = {
  exported: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  open: "border-border bg-muted text-muted-foreground",
  due_soon: "border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-100",
  missing: "border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-100",
  overdue: "border-destructive/30 bg-destructive/10 text-destructive",
}

/** Abrechnungsfrist (§ 556 Abs. 3 BGB) as a colored chip. */
export function DeadlineBadge({ deadline }: { deadline: Deadline }) {
  return (
    <Badge variant="outline" className={cn("h-auto py-0.5", STYLE[deadline.state])}>
      {deadlineText(deadline)}
    </Badge>
  )
}
