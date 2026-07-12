import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"

import { LinkButton } from "@/components/link-button"
import { PersonPeriodsEditor } from "@/components/person-periods-editor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"

function formatPersonPeriods(lease: { person_periods: { valid_from: string; valid_to: string | null; persons: number }[]; persons: number }) {
  if (!lease.person_periods.length) return `${lease.persons} Personen`
  return lease.person_periods
    .map((p) => `${p.persons} Personen (${p.valid_from}${p.valid_to ? `–${p.valid_to}` : "–…"})`)
    .join(", ")
}

export function LeasesPage() {
  const { id } = useParams()
  const apartmentId = Number(id)
  const queryClient = useQueryClient()
  const [editingLeaseId, setEditingLeaseId] = useState<number | null>(null)

  const { data: apartment } = useQuery({
    queryKey: ["apartment", apartmentId],
    queryFn: () => api.getApartment(apartmentId),
    enabled: !!apartmentId,
  })
  const { data: leases } = useQuery({
    queryKey: ["leases", apartmentId],
    queryFn: () => api.leases(apartmentId),
    enabled: !!apartmentId,
  })

  const [form, setForm] = useState({
    tenant_name: "",
    tenant_contact: "",
    room_id: "",
    persons: "1",
    move_in: "",
    move_out: "",
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.createLease(apartmentId, {
        tenant_name: form.tenant_name,
        tenant_contact: form.tenant_contact,
        room_id: Number(form.room_id),
        persons: Number(form.persons),
        move_in: form.move_in,
        move_out: form.move_out || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leases", apartmentId] })
      setForm({ tenant_name: "", tenant_contact: "", room_id: "", persons: "1", move_in: "", move_out: "" })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (leaseId: number) => api.deleteLease(leaseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leases", apartmentId] }),
  })

  const editingLease = leases?.find((l) => l.id === editingLeaseId)
  const roomItems = Object.fromEntries(
    (apartment?.rooms ?? []).map((room) => [String(room.id), room.name]),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mietparteien</h1>
          <p className="text-muted-foreground">{apartment?.name}</p>
        </div>
        <LinkButton variant="outline" to={`/wohnungen/${apartmentId}`}>
          Zurück
        </LinkButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Neuer Mietvertrag</CardTitle>
          <CardDescription>
            Die anfängliche Personenzahl gilt für den gesamten Mietzeitraum. Änderungen später unter „Personenzahl bearbeiten“.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Mietername</Label>
            <Input value={form.tenant_name} onChange={(e) => setForm({ ...form, tenant_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Kontakt</Label>
            <Input value={form.tenant_contact} onChange={(e) => setForm({ ...form, tenant_contact: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Zimmer</Label>
            <Select
              value={form.room_id || null}
              items={roomItems}
              onValueChange={(v) => v && setForm({ ...form, room_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Zimmer wählen" />
              </SelectTrigger>
              <SelectContent>
                {apartment?.rooms.map((room) => (
                  <SelectItem key={room.id} value={String(room.id)}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Personen (initial)</Label>
            <Input type="number" min={1} value={form.persons} onChange={(e) => setForm({ ...form, persons: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Einzug</Label>
            <Input type="date" value={form.move_in} onChange={(e) => setForm({ ...form, move_in: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Auszug (optional)</Label>
            <Input type="date" value={form.move_out} onChange={(e) => setForm({ ...form, move_out: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.tenant_name || !form.room_id || !form.move_in || createMutation.isPending}
            >
              Anlegen
            </Button>
          </div>
        </CardContent>
      </Card>

      {editingLease && (
        <PersonPeriodsEditor
          lease={editingLease}
          apartmentId={apartmentId}
          onClose={() => setEditingLeaseId(null)}
        />
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mieter</TableHead>
                <TableHead>Zimmer</TableHead>
                <TableHead>Personenzahl-Zeiträume</TableHead>
                <TableHead>Einzug</TableHead>
                <TableHead>Auszug</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leases?.map((lease) => (
                <TableRow key={lease.id}>
                  <TableCell>{lease.tenant_name}</TableCell>
                  <TableCell>{lease.room_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatPersonPeriods(lease)}
                  </TableCell>
                  <TableCell>{lease.move_in}</TableCell>
                  <TableCell>{lease.move_out || "—"}</TableCell>
                  <TableCell className="w-0 space-x-1">
                    <Button variant="outline" size="sm" onClick={() => setEditingLeaseId(lease.id)}>
                      Personenzahl
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(lease.id)}>
                      Löschen
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
