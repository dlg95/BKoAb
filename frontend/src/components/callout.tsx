import type { ReactNode } from "react"
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"

const STYLES = {
  info: {
    icon: Info,
    className: "border-primary/20 bg-primary/5 text-foreground [&_svg]:text-primary",
  },
  warning: {
    icon: AlertTriangle,
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400",
  },
  success: {
    icon: CheckCircle2,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 [&_svg]:text-emerald-600",
  },
  error: {
    icon: XCircle,
    className: "border-destructive/30 bg-destructive/10 text-destructive [&_svg]:text-destructive",
  },
} as const

type CalloutProps = {
  variant?: keyof typeof STYLES
  title?: ReactNode
  children?: ReactNode
  className?: string
  action?: ReactNode
}

/** Inline hint box for guidance, warnings and results. */
export function Callout({ variant = "info", title, children, className, action }: CalloutProps) {
  const { icon: Icon, className: variantClass } = STYLES[variant]
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-2xl border px-4 py-3 text-sm", variantClass, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  )
}
