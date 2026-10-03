import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Callout } from "@/components/callout"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, errorMessage } from "@/lib/api"
import { TOP_UNIT_STAMMDATEN } from "@/lib/billing-labels"

const EMPTY = { name: "", street: "", city: "", total_area_sqm: "" }

/** „WG-Wohnung anlegen“ — opens the new apartment right after creation. */
export function CreateApartmentDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>{trigger}</DialogTrigger>
      {open ? <CreateApartmentForm onDone={() => setOpen(false)} /> : null}
    </Dialog>
  )
}

function CreateApartmentForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY)

  const createMutation = useMutation({
    mutationFn: () =>
      api.createApartment({
        name: form.name.trim(),
        street: form.street,
        city: form.city,
        total_area_sqm: form.total_area_sqm || null,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["apartments"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      onDone()
      navigate(`/wohnungen/${created.id}`)
    },
  })

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>WG-Wohnung anlegen</DialogTitle>
        <DialogDescription>
          Danach legen Sie Zimmer und Mietparteien an. Alles lässt sich später ändern.
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (form.name.trim() && !createMutation.isPending) createMutation.mutate()
        }}
      >
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="new-apt-name">{TOP_UNIT_STAMMDATEN.name}</Label>
          <Input
            id="new-apt-name"
            autoFocus
            placeholder="z. B. WG Musterstraße"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-apt-street">{TOP_UNIT_STAMMDATEN.street}</Label>
          <Input id="new-apt-street" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-apt-city">{TOP_UNIT_STAMMDATEN.city}</Label>
          <Input id="new-apt-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="new-apt-area">{TOP_UNIT_STAMMDATEN.total_area_sqm} — optional</Label>
          <Input
            id="new-apt-area"
            type="number"
            step="0.01"
            min={0}
            value={form.total_area_sqm}
            onChange={(e) => setForm({ ...form, total_area_sqm: e.target.value })}
          />
        </div>
        {createMutation.isError ? (
          <Callout variant="error" className="sm:col-span-2">
            {errorMessage(createMutation.error, "Anlegen fehlgeschlagen.")}
          </Callout>
        ) : null}
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={!form.name.trim() || createMutation.isPending}>
            Anlegen
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
