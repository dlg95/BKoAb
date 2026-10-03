import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PlausibilityCheck } from "@/lib/api"
import { cn } from "@/lib/utils"

const ICONS = {
  error: { icon: XCircle, className: "text-destructive" },
  warning: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
  info: { icon: Info, className: "text-primary" },
} as const

const CHECK_AREA_LABEL: Record<PlausibilityCheck["area"], string | null> = {
  rechnungen: "Zu den Rechnungen",
  vorauszahlungen: "Zu den Vorauszahlungen",
  mietparteien: "Zu den Mietparteien",
  stammdaten: "Zu den Zimmern",
  einstellungen: "Zum Briefkopf",
  verteilung: null,
  frist: null,
}

type PlausibilityPanelProps = {
  checks: PlausibilityCheck[]
  onNavigate: (area: PlausibilityCheck["area"]) => void
}

/** „Prüfung vor dem Versand“ — errors, warnings and hints with a jump to the place to fix them. */
export function PlausibilityPanel({ checks, onNavigate }: PlausibilityPanelProps) {
  const errors = checks.filter((c) => c.severity === "error").length
  const warnings = checks.filter((c) => c.severity === "warning").length

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {errors === 0 && warnings === 0 ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertTriangle className={cn("size-4", errors ? "text-destructive" : "text-amber-600")} />
          )}
          Prüfung vor dem Versand
        </CardTitle>
        <CardDescription>
          {errors === 0 && warnings === 0
            ? "Keine Auffälligkeiten gefunden. Bitte trotzdem kurz gegenlesen."
            : `${errors ? `${errors} Fehler` : ""}${errors && warnings ? " · " : ""}${warnings ? `${warnings} Hinweis${warnings === 1 ? "" : "e"} zum Prüfen` : ""}`}
        </CardDescription>
      </CardHeader>
      {checks.length ? (
        <CardContent>
          <ul className="divide-y rounded-2xl border">
            {checks.map((check, index) => {
              const { icon: Icon, className } = ICONS[check.severity]
              const linkLabel = CHECK_AREA_LABEL[check.area]
              return (
                <li key={`${check.message}-${index}`} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-sm">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
                  <span className="min-w-48 flex-1">{check.message}</span>
                  {linkLabel ? (
                    <Button variant="ghost" size="xs" onClick={() => onNavigate(check.area)}>
                      {linkLabel}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  )
}
