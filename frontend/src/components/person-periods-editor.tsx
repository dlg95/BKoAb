import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Callout } from "@/components/callout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, errorMessage, formatDate, type Lease } from "@/lib/api"

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

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function firstOfNextMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
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

function usePersonPeriodsDraft(lease: Lease, apartmentId: number, onSaved?: () => void) {
  const queryClient = useQueryClient()
  const [periods, setPeriods] = useState<PeriodDraft[]>(() => toDrafts(lease))
  const [error, setError] = useState("")
  const [prevLease, setPrevLease] = useState(lease)
  if (prevLease !== lease) {
    // Reset drafts when a different/refreshed lease is passed in (no effect needed).
    setPrevLease(lease)
    setPeriods(toDrafts(lease))
    setError("")
  }

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
      onSaved?.()
    },
    onError: (err: Error) => setError(errorMessage(err)),
  })

  /** Split the last period: the new one starts on the 1st of the following month. */
  function addPeriod() {
    const last = periods[periods.length - 1]
    if (!last) return
    let split = firstOfNextMonth(last.valid_from || lease.move_in)
    if (last.valid_to && split > last.valid_to) split = last.valid_to
    if (split <= last.valid_from) split = addDays(last.valid_from, 1)
    setPeriods([
      ...periods.slice(0, -1),
      { ...last, valid_to: addDays(split, -1) },
      { valid_from: split, valid_to: last.valid_to, persons: last.persons },
    ])
  }

  return { periods, setPeriods, error, saveMutation, addPeriod }
}

function PeriodRows({ lease, periods, setPeriods }: { lease: Lease; periods: PeriodDraft[]; setPeriods: (p: PeriodDraft[]) => void }) {
  return (
    <>
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
              <Label>Personen</Label>
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
    </>
  )
}

/** Inline editor (legacy card layout, used by archived MFH pages). */
export function PersonPeriodsEditor({ lease, apartmentId, onClose }: PersonPeriodsEditorProps) {
  const { periods, setPeriods, error, saveMutation, addPeriod } = usePersonPeriodsDraft(lease, apartmentId, onClose)

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">Personenzahl-Zeiträume — {lease.tenant_name}</CardTitle>
        <CardDescription>
          Innerhalb eines Mietvertrags kann sich die Personenzahl ändern (z. B. Nachzug). Die Zeiträume müssen
          lückenlos von Einzug bis Auszug reichen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <PeriodRows lease={lease} periods={periods} setPeriods={setPeriods} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={addPeriod}>
            <Plus className="mr-1 size-4" />
            Zeitraum hinzufügen
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Personenzahl-Zeiträume speichern
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

type PersonPeriodsDialogProps = {
  lease: Lease | null
  apartmentId: number
  onOpenChange: (open: boolean) => void
}

/** Dialog variant: change the number of persons over time for one Mietpartei. */
export function PersonPeriodsDialog({ lease, apartmentId, onOpenChange }: PersonPeriodsDialogProps) {
  return (
    <Dialog open={lease != null} onOpenChange={onOpenChange}>
      {lease ? (
        <PersonPeriodsDialogBody key={lease.id} lease={lease} apartmentId={apartmentId} onClose={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  )
}

function PersonPeriodsDialogBody({ lease, apartmentId, onClose }: { lease: Lease; apartmentId: number; onClose: () => void }) {
  const { periods, setPeriods, error, saveMutation, addPeriod } = usePersonPeriodsDraft(lease, apartmentId, onClose)

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Personenzahl — {lease.tenant_name}</DialogTitle>
        <DialogDescription>
          Mietzeitraum {formatDate(lease.move_in)} – {formatDate(lease.move_out, "unbefristet")}. Die
          Zeiträume müssen lückenlos von Einzug bis Auszug reichen (z. B. bei Nachzug einen neuen
          Zeitraum anlegen).
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        <PeriodRows lease={lease} periods={periods} setPeriods={setPeriods} />
      </div>
      {error ? <Callout variant="error">{error}</Callout> : null}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={addPeriod}>
          <Plus className="mr-1 size-4" />
          Zeitraum hinzufügen
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Speichern
          </Button>
        </div>
      </div>
    </DialogContent>
  )
}
