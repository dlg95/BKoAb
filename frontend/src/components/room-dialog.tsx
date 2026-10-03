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
import { api, errorMessage, type Apartment } from "@/lib/api"

type Room = Apartment["rooms"][number]

type RoomDialogProps = {
  apartmentId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Room to edit; omit to create. */
  room?: Room | null
  /** Suggested name for a new room, e.g. "Zimmer 3". */
  suggestedName?: string
  onCreated?: (room: { id: number; name: string }) => void
}

export function RoomDialog(props: RoomDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <RoomDialogBody key={props.room?.id ?? "new"} {...props} /> : null}
    </Dialog>
  )
}

function RoomDialogBody({ apartmentId, onOpenChange, room, suggestedName, onCreated }: RoomDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(room?.name ?? suggestedName ?? "")
  const [area, setArea] = useState(room?.area_sqm ?? "")

  const mutation = useMutation({
    mutationFn: async () => {
      if (room) {
        await api.updateRoom(room.id, { name: name.trim(), area_sqm: area || null })
        return null
      }
      return api.addRoom(apartmentId, name.trim(), area || undefined)
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["apartments"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["leases", apartmentId] })
      onOpenChange(false)
      if (created) onCreated?.(created)
    },
  })

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{room ? "Zimmer bearbeiten" : "Zimmer hinzufügen"}</DialogTitle>
        <DialogDescription>
          Die Fläche wird nur für Rechnungen mit Verteilerquote „Fläche (m²)“ benötigt.
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && !mutation.isPending) mutation.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="room-name">Bezeichnung</Label>
          <Input id="room-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-area">Fläche in m² (optional)</Label>
          <Input
            id="room-area"
            type="number"
            step="0.01"
            min={0}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </div>
        {mutation.isError ? (
          <Callout variant="error">{errorMessage(mutation.error, "Speichern fehlgeschlagen.")}</Callout>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={!name.trim() || mutation.isPending}>
            {room ? "Speichern" : "Zimmer anlegen"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
