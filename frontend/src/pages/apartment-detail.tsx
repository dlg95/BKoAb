import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"
import { Plus } from "lucide-react"

import { LinkButton } from "@/components/link-button"
import { BillingYearsCard } from "@/components/billing-years-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
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

  const [form, setForm] = useState({
    name: "",
    street: "",
    city: "",
    total_area_sqm: "",
  })
  const [newRoomName, setNewRoomName] = useState("")
  const [roomDrafts, setRoomDrafts] = useState<
    Record<number, { name: string; area_sqm: string; consumption_amount: string }>
  >({})

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
            {
              name: room.name,
              area_sqm: room.area_sqm || "",
              consumption_amount: room.consumption_amount || "",
            },
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
    mutationFn: () => api.addRoom(apartmentId, newRoomName.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      setNewRoomName("")
    },
  })

  const deleteRoomMutation = useMutation({
    mutationFn: (roomId: number) => api.deleteRoom(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const saveRoomMutation = useMutation({
    mutationFn: (roomId: number) => {
      const draft = roomDrafts[roomId]
      return api.updateRoom(roomId, {
        name: draft.name,
        area_sqm: draft.area_sqm || null,
        consumption_amount: draft.consumption_amount || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  if (!apartment) return <p>Laden…</p>

  const nextRoomLabel = `Zimmer ${apartment.rooms.length + 1}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{apartment.name}</h1>
          <p className="text-sm text-muted-foreground">{BILLING_LABELS.wg.topUnit}</p>
        </div>
        <LinkButton variant="outline" to={`/wohnungen/${apartmentId}/mietparteien`}>
          Mietparteien
        </LinkButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardDescription>
            Gesamtfläche dient als Nenner bei m²-Kostenverteilungen.
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

      <Card>
        <CardHeader>
          <CardTitle>{BILLING_LABELS.wg.subUnitPlural} ({apartment.rooms.length})</CardTitle>
          <CardDescription>
            Untereinheiten der WG-Wohnung. Personenmonate je {BILLING_LABELS.wg.subUnit} ergeben sich aus
            Bewohnerzahl und Mietzeitraum — relevant für Rechnungen mit Verteilerquote Personenmonate.
            Leerstehende {BILLING_LABELS.wg.subUnitPlural} zählen als fiktive Personenmonate beim Vermieter.
            {" "}
            {ALLOCATION_PER_INVOICE_HINT}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bezeichnung</TableHead>
                <TableHead>Fläche (m²)</TableHead>
                <TableHead>Verbrauch</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apartment.rooms.map((room) => {
                const draft = roomDrafts[room.id] ?? {
                  name: room.name,
                  area_sqm: room.area_sqm || "",
                  consumption_amount: room.consumption_amount || "",
                }
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
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={draft.consumption_amount}
                        onChange={(e) =>
                          setRoomDrafts({
                            ...roomDrafts,
                            [room.id]: { ...draft, consumption_amount: e.target.value },
                          })
                        }
                        className="w-32"
                        placeholder="z.B. m³"
                      />
                    </TableCell>
                    <TableCell className="space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => saveRoomMutation.mutate(room.id)}
                        disabled={saveRoomMutation.isPending || !draft.name.trim()}
                      >
                        Speichern
                      </Button>
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
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="space-y-2">
              <Label>
                {apartment.rooms.length === 0
                  ? `${BILLING_LABELS.wg.subUnit} hinzufügen`
                  : `Weiteres ${BILLING_LABELS.wg.subUnit} hinzufügen`}
              </Label>
              <Input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder={nextRoomLabel}
                className="w-64"
              />
            </div>
            <Button
              onClick={() => addRoomMutation.mutate()}
              disabled={!newRoomName.trim() || addRoomMutation.isPending}
            >
              <Plus className="mr-1 size-4" />
              {BILLING_LABELS.wg.subUnit} anlegen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
