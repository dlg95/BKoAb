import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"

import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"
import { ALLOCATION_PER_INVOICE_HINT, BILLING_LABELS } from "@/lib/billing-labels"

const PROPERTY_TYPES = [
  { value: "mfh", label: "Mehrfamilienhaus" },
  { value: "weg", label: "WEG" },
] as const

const TYPE_ITEMS = Object.fromEntries(PROPERTY_TYPES.map((t) => [t.value, t.label]))

export function PropertiesPage() {
  const queryClient = useQueryClient()
  const { data: properties } = useQuery({ queryKey: ["properties"], queryFn: api.properties })
  const mfhProperties = properties?.filter((p) => p.property_type !== "einfamilien") ?? []
  const [form, setForm] = useState({
    name: "",
    street: "",
    city: "",
    total_area_sqm: "",
    property_type: "mfh",
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.createProperty({
        ...form,
        total_area_sqm: form.total_area_sqm || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      setForm({ name: "", street: "", city: "", total_area_sqm: "", property_type: "mfh" })
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{BILLING_LABELS.mfh.topUnitPlural} (MFH/WEG)</h1>

      <Card>
        <CardHeader>
          <CardTitle>{BILLING_LABELS.mfh.createTop}</CardTitle>
          <CardDescription>
            {BILLING_LABELS.mfh.hierarchyHint}. {ALLOCATION_PER_INVOICE_HINT}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Typ</Label>
            <Select value={form.property_type} items={TYPE_ITEMS} onValueChange={(v) => v && setForm({ ...form, property_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Straße</Label>
            <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>PLZ / Ort</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Gesamtfläche (m²)</Label>
            <Input type="number" step="0.01" value={form.total_area_sqm} onChange={(e) => setForm({ ...form, total_area_sqm: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}>
              Anlegen
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {mfhProperties.map((prop) => (
          <Card key={prop.id}>
            <CardContent className="flex items-center justify-between py-6">
              <div>
                <p className="font-medium">{prop.name}</p>
                <p className="text-sm text-muted-foreground">
                  {prop.property_type_label} · {prop.units.length} {BILLING_LABELS.mfh.subUnitPlural}
                  {prop.total_area_sqm ? ` · ${prop.total_area_sqm} m² gesamt` : ""}
                </p>
              </div>
              <LinkButton to={`/gebaeude/${prop.id}`}>Verwalten</LinkButton>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
