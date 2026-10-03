import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Callout } from "@/components/callout"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, errorMessage, type Lease } from "@/lib/api"

type RateDraft = { month: string; amount: string }

type AdvanceRatesDialogProps = {
  lease: Lease | null
  apartmentId: number
  onOpenChange: (open: boolean) => void
}

/** Planned monthly NK-Vorauszahlung (Soll) of one Mietpartei, with changes over time. */
export function AdvanceRatesDialog({ lease, apartmentId, onOpenChange }: AdvanceRatesDialogProps) {
  return (
    <Dialog open={lease != null} onOpenChange={onOpenChange}>
      {lease ? (
        <AdvanceRatesBody key={lease.id} lease={lease} apartmentId={apartmentId} onClose={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  )
}

function AdvanceRatesBody({ lease, apartmentId, onClose }: { lease: Lease; apartmentId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [rates, setRates] = useState<RateDraft[]>(() =>
    lease.advance_rates.length
      ? lease.advance_rates.map((r) => ({ month: r.valid_from.slice(0, 7), amount: r.amount }))
      : [{ month: lease.move_in.slice(0, 7), amount: "" }],
  )

  const valid = rates.every((r) => r.month && r.amount !== "" && Number(r.amount) >= 0)
  const duplicateMonths = new Set(rates.map((r) => r.month)).size !== rates.length

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateAdvanceRates(
        lease.id,
        rates.filter((r) => r.month && r.amount !== "").map((r) => ({ valid_from: `${r.month}-01`, amount: r.amount })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leases", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["advance", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["preview", apartmentId] })
      onClose()
    },
  })

  /** New row starting next month, prefilled with the last amount. */
  function addRate() {
    const last = rates[rates.length - 1]
    const next = new Date()
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
    const month = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`
    setRates([...rates, { month, amount: last?.amount ?? "" }])
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>NK-Vorauszahlung — {lease.tenant_name}</DialogTitle>
        <DialogDescription>
          Monatlicher Soll-Betrag. Er wird in jeder Abrechnung automatisch für alle bewohnten Monate
          angesetzt; einzelne abweichende Zahlungen tragen Sie in der Abrechnung unter
          „Vorauszahlungen“ ein. Bei einer Erhöhung einfach eine neue Zeile „ab Monat“ hinzufügen.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        {rates.map((rate, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`rate-month-${index}`}>Ab Monat</Label>
              <Input
                id={`rate-month-${index}`}
                type="month"
                value={rate.month}
                onChange={(e) => setRates(rates.map((r, i) => (i === index ? { ...r, month: e.target.value } : r)))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`rate-amount-${index}`}>Betrag €/Monat</Label>
              <Input
                id={`rate-amount-${index}`}
                type="number"
                step="0.01"
                min={0}
                value={rate.amount}
                onChange={(e) => setRates(rates.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zeile entfernen"
              onClick={() => setRates(rates.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {rates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Soll-Vorauszahlung hinterlegt.</p>
        ) : null}
      </div>

      {duplicateMonths ? <Callout variant="error">Jeder Monat darf nur einmal vorkommen.</Callout> : null}
      {saveMutation.isError ? <Callout variant="error">{errorMessage(saveMutation.error)}</Callout> : null}

      <DialogFooter className="sm:justify-between">
        <Button variant="secondary" onClick={addRate}>
          <Plus className="size-4" />
          Änderung ab Monat
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!valid || duplicateMonths || saveMutation.isPending}>
            Speichern
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}
