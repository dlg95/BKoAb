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
import { ALLOCATION_PER_INVOICE_HINT, BILLING_LABELS } from "@/lib/billing-labels"

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
    living_area_sqm: "",
    iban: "",
    account_holder: "",
    payment_reference_hint: "",
  })
  const [newRoomName, setNewRoomName] = useState("")

  useEffect(() => {
    if (apartment) {
      setForm({
        name: apartment.name,
        street: apartment.street,
        city: apartment.city,
        living_area_sqm: apartment.living_area_sqm || "",
        iban: apartment.iban,
        account_holder: apartment.account_holder,
        payment_reference_hint: apartment.payment_reference_hint,
      })
    }
  }, [apartment])

  const saveMutation = useMutation({
    mutationFn: () => api.updateApartment(apartmentId, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] }),
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
          <CardTitle>Stammdaten & Bankverbindung</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["name", "Name"],
              ["street", "Straße"],
              ["city", "PLZ / Ort"],
              ["living_area_sqm", "Wohnfläche (m²)"],
              ["iban", "IBAN"],
              ["account_holder", "Kontoinhaber"],
              ["payment_reference_hint", "Verwendungszweck-Hinweis"],
            ] as const
          ).map(([key, label]) => (
            <div className="space-y-2" key={key}>
              <Label>{label}</Label>
              <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
          <div className="md:col-span-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      <BillingYearsCard apartmentId={apartmentId} apartmentName={apartment.name} />

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
                <TableHead>{BILLING_LABELS.wg.subUnit}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apartment.rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell>
                    {room.name}
                  </TableCell>
                  <TableCell className="w-24">
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
              ))}
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
