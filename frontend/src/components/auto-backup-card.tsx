import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, History, RotateCcw, ShieldCheck } from "lucide-react"

import { Callout } from "@/components/callout"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

const REASON_LABEL: Record<string, string> = {
  start: "beim Start",
  auto: "regelmäßig",
  beenden: "beim Beenden",
  manuell: "manuell",
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`
}

/** Automatische Sicherungen: list, create now, download or restore. */
export function AutoBackupCard() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["backups"], queryFn: api.backups })

  const createMutation = useMutation({
    mutationFn: api.createBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  })
  const restoreMutation = useMutation({
    mutationFn: (filename: string) => api.restoreBackup(filename),
    onSuccess: () => {
      void queryClient.invalidateQueries().then(() => window.location.reload())
    },
  })

  const enabled = (data?.interval_days ?? 0) > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          Automatische Sicherung
        </CardTitle>
        <CardDescription>
          {enabled
            ? `BKoAb sichert Ihre Daten beim Start und alle ${data?.interval_days} Tage sowie beim Beenden — jeweils nur, wenn sich seit der letzten Sicherung etwas geändert hat. Die letzten ${data?.keep} Sicherungen bleiben erhalten.`
            : "Automatische Sicherungen sind ausgeschaltet (BKOAB_AUTO_BACKUP_DAYS=0)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data ? (
          <p className="text-sm text-muted-foreground">
            Speicherort: <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">{data.directory}</code>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            <History className="size-4" />
            {createMutation.isPending ? "Sichert…" : "Jetzt sichern"}
          </Button>
          {createMutation.isError ? (
            <span className="text-sm text-destructive">{errorMessage(createMutation.error)}</span>
          ) : null}
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Laden…</p> : null}
        {data && data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Sicherung vorhanden.</p>
        ) : null}
        {data && data.items.length > 0 ? (
          <ul className="divide-y rounded-2xl border">
            {data.items.map((item) => (
              <li key={item.filename} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">
                    {new Date(item.created_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {REASON_LABEL[item.reason] ?? item.reason} · {formatSize(item.size_bytes)}
                  </p>
                </div>
                <a
                  href={api.backupDownloadUrl(item.filename)}
                  className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
                  download
                >
                  <Download className="size-3" />
                  Herunterladen
                </a>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={restoreMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Aktuelle Daten durch diese Sicherung ersetzen?\n\nDer jetzige Stand wird vorher automatisch gesichert.",
                      )
                    )
                      restoreMutation.mutate(item.filename)
                  }}
                >
                  <RotateCcw className="size-3" />
                  Wiederherstellen
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {restoreMutation.isError ? (
          <Callout variant="error">{errorMessage(restoreMutation.error, "Wiederherstellen fehlgeschlagen.")}</Callout>
        ) : null}
        {restoreMutation.isSuccess ? <Callout variant="success">Wiederhergestellt — Seite wird neu geladen…</Callout> : null}
      </CardContent>
    </Card>
  )
}
