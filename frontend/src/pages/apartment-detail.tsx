import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"

import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

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
    iban: "",
    account_holder: "",
    payment_reference_hint: "",
  })

  useEffect(() => {
    if (apartment) {
      setForm({
        name: apartment.name,
        street: apartment.street,
        city: apartment.city,
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

  if (!apartment) return <p>Laden…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{apartment.name}</h1>
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

      <Card>
        <CardHeader>
          <CardTitle>Zimmer</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc text-sm">
            {apartment.rooms.map((room) => (
              <li key={room.id}>{room.name}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
