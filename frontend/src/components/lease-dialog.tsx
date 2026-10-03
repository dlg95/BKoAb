import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, errorMessage, type Apartment, type Lease } from "@/lib/api"

type LeaseDialogProps = {
  apartmentId: number
  rooms: Apartment["rooms"]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing lease to edit; omit to create a new one. */
  lease?: Lease | null
  /** Pre-selected room when creating (e.g. from a room card). */
  defaultRoomId?: number | null
}

type LeaseForm = {
  tenant_name: string
  tenant_contact: string
  room_id: string
  persons: string
  move_in: string
  move_out: string
  advance: string
}

function initialForm(lease: Lease | null | undefined, defaultRoomId: number | null | undefined, rooms: Apartment["rooms"]): LeaseForm {
  if (lease) {
    return {
      tenant_name: lease.tenant_name,
      tenant_contact: lease.tenant_contact ?? "",
      room_id: String(lease.room_id),
      persons: String(lease.persons),
      move_in: lease.move_in,
      move_out: lease.move_out ?? "",
      advance: "",
    }
  }
  const roomId = defaultRoomId ?? (rooms.length === 1 ? rooms[0].id : null)
  return {
    tenant_name: "",
    tenant_contact: "",
    room_id: roomId ? String(roomId) : "",
    persons: "1",
    move_in: "",
    move_out: "",
    advance: "",
  }
}

/** Create or edit a Mietpartei. Mietparteien belong to the WG; each one lives in one Zimmer. */
export function LeaseDialog(props: LeaseDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <LeaseDialogBody key={`${props.lease?.id ?? "new"}-${props.defaultRoomId ?? ""}`} {...props} />
      ) : null}
    </Dialog>
  )
}

function LeaseDialogBody({ apartmentId, rooms, onOpenChange, lease, defaultRoomId }: LeaseDialogProps) {
  const queryClient = useQueryClient()
  const isEdit = !!lease
  const [form, setForm] = useState<LeaseForm>(() => initialForm(lease, defaultRoomId, rooms))
  const multiplePeriods = (lease?.person_periods.length ?? 0) > 1

  const roomItems = Object.fromEntries(rooms.map((room) => [String(room.id), room.name]))
  const datesInvalid = !!form.move_in && !!form.move_out && form.move_out < form.move_in

  const mutation = useMutation({
    mutationFn: () => {
      if (lease) {
        return api.updateLease(lease.id, {
          tenant_name: form.tenant_name.trim(),
          tenant_contact: form.tenant_contact.trim(),
          room_id: Number(form.room_id),
          move_in: form.move_in,
          move_out: form.move_out || null,
          ...(multiplePeriods ? {} : { persons: Number(form.persons) }),
        })
      }
      return api.createLease(apartmentId, {
        tenant_name: form.tenant_name.trim(),
        tenant_contact: form.tenant_contact.trim(),
        room_id: Number(form.room_id),
        persons: Number(form.persons),
        move_in: form.move_in,
        move_out: form.move_out || null,
        advance_payment_monthly: form.advance || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leases", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["advance", apartmentId] })
      onOpenChange(false)
    },
  })

  const canSubmit =
    !!form.tenant_name.trim() &&
    !!form.room_id &&
    !!form.move_in &&
    Number(form.persons) >= 1 &&
    !datesInvalid &&
    !mutation.isPending

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Mietpartei bearbeiten" : "Mietpartei hinzufügen"}</DialogTitle>
        <DialogDescription>
          Mietparteien gehören zur WG-Wohnung und werden gemeinsam abgerechnet. Jede Mietpartei
          bewohnt ein Zimmer.
        </DialogDescription>
      </DialogHeader>

      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) mutation.mutate()
        }}
      >
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lease-tenant">Name der Mietpartei</Label>
          <Input
            id="lease-tenant"
            autoFocus
            value={form.tenant_name}
            onChange={(e) => setForm({ ...form, tenant_name: e.target.value })}
            placeholder="z. B. Anna Beispiel"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lease-contact">Kontakt (optional)</Label>
          <Input
            id="lease-contact"
            value={form.tenant_contact}
            onChange={(e) => setForm({ ...form, tenant_contact: e.target.value })}
            placeholder="E-Mail oder Telefon"
          />
        </div>
        <div className="space-y-2">
          <Label>Zimmer</Label>
          <Select
            value={form.room_id || null}
            items={roomItems}
            onValueChange={(v) => v && setForm({ ...form, room_id: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Zimmer wählen" />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={String(room.id)}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lease-persons">{isEdit ? "Personen" : "Personen bei Einzug"}</Label>
          <Input
            id="lease-persons"
            type="number"
            min={1}
            value={form.persons}
            disabled={multiplePeriods}
            onChange={(e) => setForm({ ...form, persons: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lease-move-in">Einzug</Label>
          <Input
            id="lease-move-in"
            type="date"
            value={form.move_in}
            onChange={(e) => setForm({ ...form, move_in: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lease-move-out">Auszug (leer = unbefristet)</Label>
          <Input
            id="lease-move-out"
            type="date"
            value={form.move_out}
            min={form.move_in || undefined}
            onChange={(e) => setForm({ ...form, move_out: e.target.value })}
          />
        </div>

        {!isEdit ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="lease-advance">NK-Vorauszahlung pro Monat in € (optional)</Label>
            <Input
              id="lease-advance"
              type="number"
              step="0.01"
              min={0}
              value={form.advance}
              onChange={(e) => setForm({ ...form, advance: e.target.value })}
              placeholder="z. B. 80"
            />
            <p className="text-xs text-muted-foreground">
              Gilt ab Einzug als Soll für alle Monate; Abweichungen tragen Sie in der Abrechnung ein.
            </p>
          </div>
        ) : null}

        <div className="space-y-3 sm:col-span-2">
          {multiplePeriods ? (
            <Callout>
              Die Personenzahl ändert sich während des Mietverhältnisses — bitte über
              „Personenzahl“ bearbeiten. Ein- und Auszug werden automatisch übernommen.
            </Callout>
          ) : !isEdit ? (
            <Callout>
              Ändert sich die Personenzahl später (z. B. Nachzug), passen Sie das über
              „Personenzahl“ an der Mietpartei an.
            </Callout>
          ) : null}
          {datesInvalid ? <Callout variant="error">Der Auszug liegt vor dem Einzug.</Callout> : null}
          {mutation.isError ? (
            <Callout variant="error">{errorMessage(mutation.error, "Speichern fehlgeschlagen.")}</Callout>
          ) : null}
        </div>

        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {mutation.isPending ? "Speichert…" : isEdit ? "Speichern" : "Mietpartei anlegen"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
