import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"

import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { ALLOCATION_PER_INVOICE_HINT, BILLING_LABELS, TOP_UNIT_STAMMDATEN } from "@/lib/billing-labels"

export function PropertiesPage() {
  const queryClient = useQueryClient()
  const { data: properties } = useQuery({ queryKey: ["properties"], queryFn: api.properties })
  const mfhProperties = properties?.filter((p) => p.property_type !== "einfamilien") ?? []
  const [form, setForm] = useState({
    name: "",
    street: "",
    city: "",
    total_area_sqm: "",
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.createProperty({
        name: form.name,
        street: form.street,
        city: form.city,
        total_area_sqm: form.total_area_sqm || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      setForm({ name: "", street: "", city: "", total_area_sqm: "" })
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
            <Label>{TOP_UNIT_STAMMDATEN.name}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{TOP_UNIT_STAMMDATEN.street}</Label>
            <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{TOP_UNIT_STAMMDATEN.city}</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{TOP_UNIT_STAMMDATEN.total_area_sqm}</Label>
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
              <div className="flex gap-2">
                <LinkButton to={`/gebaeude/${prop.id}`}>Bearbeiten</LinkButton>
                <LinkButton variant="outline" to={`/gebaeude/${prop.id}/mietparteien`}>
                  Mietparteien
                </LinkButton>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
