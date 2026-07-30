import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, useParams } from "react-router-dom"
import { useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"

import { GuidedLeaseDialog } from "@/components/guided-lease-dialog"
import { LinkButton } from "@/components/link-button"
import { BillingYearsCard } from "@/components/billing-years-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
import { formatSqm, wgAreaMismatch } from "@/lib/area"
import { ALLOCATION_PER_INVOICE_HINT, BILLING_LABELS, TOP_UNIT_STAMMDATEN } from "@/lib/billing-labels"

export function ApartmentDetailPage() {
  const { id } = useParams()
  const apartmentId = Number(id)
  const queryClient = useQueryClient()
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
    name: "",
    street: "",
    city: "",
    total_area_sqm: "",
  })
  const [newRoom, setNewRoom] = useState({ name: "", area_sqm: "" })
  const [roomDrafts, setRoomDrafts] = useState<Record<number, { name: string; area_sqm: string }>>({})
  const [leasePrompt, setLeasePrompt] = useState<{ name: string; roomId: number } | null>(null)

  useEffect(() => {
    if (apartment) {
      setForm({
        name: apartment.name,
        street: apartment.street,
        city: apartment.city,
        total_area_sqm: apartment.total_area_sqm || "",
      })
      setRoomDrafts(
        Object.fromEntries(
          apartment.rooms.map((room) => [
            room.id,
            { name: room.name, area_sqm: room.area_sqm || "" },
          ]),
        ),
      )
    }
  }, [apartment])

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateApartment(apartmentId, {
        ...form,
        total_area_sqm: form.total_area_sqm || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const addRoomMutation = useMutation({
    mutationFn: () => api.addRoom(apartmentId, newRoom.name.trim(), newRoom.area_sqm || undefined),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      const name = newRoom.name.trim()
      setNewRoom({ name: "", area_sqm: "" })
      setLeasePrompt({ name, roomId: room.id })
    },
  })

  const deleteRoomMutation = useMutation({
    mutationFn: (roomId: number) => api.deleteRoom(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["leases", apartmentId] })
    },
  })

  const saveRoomMutation = useMutation({
    mutationFn: (roomId: number) => {
      const draft = roomDrafts[roomId]
      return api.updateRoom(roomId, {
        name: draft.name,
        area_sqm: draft.area_sqm || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const areaWarning = useMemo(() => {
    if (!apartment) return null
    const draftAreas = apartment.rooms.map((r) => roomDrafts[r.id]?.area_sqm ?? r.area_sqm)
    return wgAreaMismatch(form.total_area_sqm || apartment.total_area_sqm, draftAreas)
  }, [apartment, form.total_area_sqm, roomDrafts])

  const leaseCountByRoom = useMemo(() => {
    const map = new Map<number, number>()
    for (const lease of leases ?? []) {
      map.set(lease.room_id, (map.get(lease.room_id) ?? 0) + 1)
    }
    return map
  }, [leases])

  if (!apartment) return <p>Laden…</p>

  if (apartment.billing_kind === "mfh" && apartment.property_id) {
    return <Navigate to={`/gebaeude/${apartment.property_id}`} replace />
  }

  const nextRoomLabel = `Zimmer ${apartment.rooms.length + 1}`
  const roomsWithoutLease = apartment.rooms.filter((r) => (leaseCountByRoom.get(r.id) ?? 0) === 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{apartment.name}</h1>
          <p className="text-sm text-muted-foreground">
            {BILLING_LABELS.wg.hierarchyHint}
          </p>
        </div>
        <LinkButton variant="outline" to={`/wohnungen/${apartmentId}/mietparteien`}>
          Alle Mietparteien
        </LinkButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {BILLING_LABELS.wg.subUnitPlural} ({apartment.rooms.length})
          </CardTitle>
          <CardDescription>
            Zuerst Zimmer anlegen, danach je Zimmer die Mietparteien. {ALLOCATION_PER_INVOICE_HINT}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apartment.rooms.length === 0 && (
            <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm">
              Noch keine Zimmer. Legen Sie das erste Zimmer an — danach werden Sie zur Mietpartei
              geführt.
            </p>
          )}

          {roomsWithoutLease.length > 0 && apartment.rooms.length > 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              Für {roomsWithoutLease.map((r) => r.name).join(", ")} fehlt noch eine Mietpartei
              (optional, empfohlen).
            </p>
          )}

          {apartment.rooms.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Fläche (m²)</TableHead>
                  <TableHead>Mietparteien</TableHead>
                  <TableHead className="min-w-[12rem]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {apartment.rooms.map((room) => {
                  const draft = roomDrafts[room.id] ?? {
                    name: room.name,
                    area_sqm: room.area_sqm || "",
                  }
                  const leaseCount = leaseCountByRoom.get(room.id) ?? 0
                  return (
                    <TableRow key={room.id}>
                      <TableCell>
                        <Input
                          value={draft.name}
                          onChange={(e) =>
                            setRoomDrafts({
                              ...roomDrafts,
                              [room.id]: { ...draft, name: e.target.value },
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.area_sqm}
                          onChange={(e) =>
                            setRoomDrafts({
                              ...roomDrafts,
                              [room.id]: { ...draft, area_sqm: e.target.value },
                            })
                          }
                          className="w-32"
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {leaseCount === 0 ? "keine" : `${leaseCount}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => saveRoomMutation.mutate(room.id)}
                            disabled={saveRoomMutation.isPending || !draft.name.trim()}
                          >
                            Speichern
                          </Button>
                          <LinkButton
                            size="sm"
                            to={`/wohnungen/${apartmentId}/mietparteien?room=${room.id}`}
                          >
                            Mietpartei
                          </LinkButton>
                          {apartment.rooms.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteRoomMutation.mutate(room.id)}
                              disabled={deleteRoomMutation.isPending}
                            >
                              Entfernen
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {areaWarning && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              Die Summe der Zimmerflächen ({formatSqm(areaWarning.roomsSum)} m²) weicht von der
              WG-Gesamtfläche ({formatSqm(areaWarning.total)} m²) ab. Bei WG-Abrechnungen sollten
              diese übereinstimmen.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="space-y-2">
              <Label>
                {apartment.rooms.length === 0
                  ? "Erstes Zimmer"
                  : `Weiteres ${BILLING_LABELS.wg.subUnit}`}
              </Label>
              <Input
                value={newRoom.name}
                onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                placeholder={nextRoomLabel}
                className="w-48"
              />
            </div>
            <div className="space-y-2">
              <Label>Fläche (m²)</Label>
              <Input
                type="number"
                step="0.01"
                value={newRoom.area_sqm}
                onChange={(e) => setNewRoom({ ...newRoom, area_sqm: e.target.value })}
                className="w-32"
              />
            </div>
            <Button
              onClick={() => addRoomMutation.mutate()}
              disabled={!newRoom.name.trim() || addRoomMutation.isPending}
            >
              <Plus className="mr-1 size-4" />
              Zimmer anlegen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardDescription>
            Gesamtfläche der WG-Wohnung. Die Summe der Zimmerflächen sollte damit übereinstimmen.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["name", TOP_UNIT_STAMMDATEN.name],
              ["street", TOP_UNIT_STAMMDATEN.street],
              ["city", TOP_UNIT_STAMMDATEN.city],
              ["total_area_sqm", TOP_UNIT_STAMMDATEN.total_area_sqm],
            ] as const
          ).map(([key, label]) => (
            <div className="space-y-2" key={key}>
              <Label>{label}</Label>
              <Input
                type={key === "total_area_sqm" ? "number" : "text"}
                step={key === "total_area_sqm" ? "0.01" : undefined}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      <BillingYearsCard apartmentId={apartmentId} unitName={apartment.name} />

      <GuidedLeaseDialog
        open={leasePrompt != null}
        onOpenChange={(open) => {
          if (!open) setLeasePrompt(null)
        }}
        subUnitLabel={BILLING_LABELS.wg.subUnit}
        subUnitName={leasePrompt?.name ?? ""}
        leasesPath={`/wohnungen/${apartmentId}/mietparteien?room=${leasePrompt?.roomId ?? ""}`}
      />
    </div>
  )
}
