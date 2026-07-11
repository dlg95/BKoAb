import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, type Lease } from "@/lib/api"

type PeriodDraft = {
  valid_from: string
  valid_to: string
  persons: string
}

type PersonPeriodsEditorProps = {
  lease: Lease
  apartmentId: number
  onClose?: () => void
}

function toDrafts(lease: Lease): PeriodDraft[] {
  if (lease.person_periods.length === 0) {
    return [{
      valid_from: lease.move_in,
      valid_to: lease.move_out || "",
      persons: String(lease.persons),
    }]
  }
  return lease.person_periods.map((p) => ({
    valid_from: p.valid_from,
    valid_to: p.valid_to || "",
    persons: String(p.persons),
  }))
}

export function PersonPeriodsEditor({ lease, apartmentId, onClose }: PersonPeriodsEditorProps) {
  const queryClient = useQueryClient()
  const [periods, setPeriods] = useState<PeriodDraft[]>(toDrafts(lease))
  const [error, setError] = useState("")

  useEffect(() => {
    setPeriods(toDrafts(lease))
    setError("")
  }, [lease])

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updatePersonPeriods(
        lease.id,
        periods.map((p) => ({
          valid_from: p.valid_from,
          valid_to: p.valid_to || null,
          persons: Number(p.persons),
        })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leases", apartmentId] })
      onClose?.()
    },
    onError: (err: Error) => setError(err.message),
  })

  function addPeriod() {
    const last = periods[periods.length - 1]
    const nextStart = last?.valid_to
      ? new Date(new Date(last.valid_to).getTime() + 86400000).toISOString().slice(0, 10)
      : lease.move_in
    setPeriods([
      ...periods.slice(0, -1),
      { ...periods[periods.length - 1], valid_to: nextStart },
      { valid_from: nextStart, valid_to: lease.move_out || "", persons: last?.persons || "1" },
    ])
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">Kopfzahl-Zeiträume — {lease.tenant_name}</CardTitle>
        <CardDescription>
          Innerhalb eines Mietvertrags kann sich die Personenzahl ändern (z. B. Nachzug). Die Zeiträume müssen
          lückenlos von Einzug bis Auszug reichen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {periods.map((period, index) => (
          <div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Von</Label>
              <Input
                type="date"
                value={period.valid_from}
                onChange={(e) => {
                  const next = [...periods]
                  next[index] = { ...period, valid_from: e.target.value }
                  setPeriods(next)
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Bis</Label>
              <Input
                type="date"
                value={period.valid_to}
                placeholder={lease.move_out ? "" : "offen"}
                onChange={(e) => {
                  const next = [...periods]
                  next[index] = { ...period, valid_to: e.target.value }
                  setPeriods(next)
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Köpfe</Label>
              <Input
                type="number"
                min={1}
                value={period.persons}
                onChange={(e) => {
                  const next = [...periods]
                  next[index] = { ...period, persons: e.target.value }
                  setPeriods(next)
                }}
              />
            </div>
            <div className="flex items-end">
              {periods.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPeriods(periods.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={addPeriod}>
            <Plus className="mr-1 size-4" />
            Zeitraum hinzufügen
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Kopfzahl-Zeiträume speichern
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Schließen
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
