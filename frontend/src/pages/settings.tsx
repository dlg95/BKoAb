import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: landlord } = useQuery({ queryKey: ["landlord"], queryFn: api.landlord })
  const [form, setForm] = useState({
    name: "",
    street: "",
    city: "",
    phone: "",
    email: "",
    payment_text_template: "",
  })

  useEffect(() => {
    if (landlord) setForm({
      name: landlord.name,
      street: landlord.street,
      city: landlord.city,
      phone: landlord.phone,
      email: landlord.email,
      payment_text_template: landlord.payment_text_template,
    })
  }, [landlord])

  const saveMutation = useMutation({
    mutationFn: () => api.updateLandlord(form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["landlord"] }),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Briefkopf & Zahlungstext</h1>
      <Card>
        <CardHeader>
          <CardTitle>Vermieterdaten</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["name", "Name"],
              ["street", "Straße"],
              ["city", "PLZ / Ort"],
              ["phone", "Telefon"],
              ["email", "E-Mail"],
            ] as const
          ).map(([key, label]) => (
            <div className="space-y-2" key={key}>
              <Label>{label}</Label>
              <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
          <div className="space-y-2 md:col-span-2">
            <Label>Zahlungstext-Vorlage</Label>
            <Textarea
              rows={4}
              value={form.payment_text_template}
              onChange={(e) => setForm({ ...form, payment_text_template: e.target.value })}
              placeholder="Bitte überweisen Sie den offenen Betrag auf folgendes Konto…"
            />
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Speichern
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
