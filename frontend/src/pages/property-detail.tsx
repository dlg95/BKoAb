import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"

import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, DEFAULT_ALLOCATION_BY_TYPE, formatEur } from "@/lib/api"
import { ALLOCATION_PER_INVOICE_HINT, BILLING_LABELS } from "@/lib/billing-labels"

const INVOICE_TYPES = [
  { value: "grundsteuer", label: "Grundsteuer" },
  { value: "versicherung", label: "Gebäudeversicherung" },
  { value: "aufzug", label: "Aufzug / Lift" },
  { value: "hausmeister", label: "Hausmeister / Reinigung" },
  { value: "wasser_abwasser", label: "Wasser / Abwasser" },
  { value: "muell", label: "Müll / Straßenreinigung" },
  { value: "heizung_gebaeude", label: "Heizkosten (Gebäude)" },
  { value: "kabel", label: "Kabel / Gemeinschaftsantenne" },
  { value: "schornsteinfeger", label: "Schornsteinfeger" },
  { value: "weg", label: "WEG-Betriebskosten" },
  { value: "sonstiges", label: "Sonstiges" },
] as const

const INVOICE_TYPE_ITEMS = Object.fromEntries(INVOICE_TYPES.map((t) => [t.value, t.label]))

const ALLOCATION_KEYS = [
  { value: "flaeche_qm", label: "Fläche (m²)" },
  { value: "personenmonate", label: "Personenmonate" },
] as const

const ALLOCATION_ITEMS = Object.fromEntries(ALLOCATION_KEYS.map((k) => [k.value, k.label]))

function defaultPropertyInvoiceForm(year: number) {
  return {
    invoice_type: "grundsteuer",
    allocation_key: "flaeche_qm",
    label: "",
    amount: "",
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    note: "",
  }
}

export function PropertyDetailPage() {
  const { id, year: yearParam } = useParams()
  const propertyId = Number(id)
  const billingYear = Number(yearParam || new Date().getFullYear())
  const queryClient = useQueryClient()

  const { data: property } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => api.getProperty(propertyId),
    enabled: !!propertyId,
  })

  const { data: billingYears } = useQuery({
    queryKey: ["property-billing-years", propertyId],
    queryFn: () => api.propertyBillingYears(propertyId),
    enabled: !!propertyId,
  })

  const { data: billingYearInfo } = useQuery({
    queryKey: ["property-billing-year", propertyId, billingYear],
    queryFn: () => api.getPropertyBillingYear(propertyId, billingYear),
    enabled: !!propertyId && !!billingYear,
    retry: false,
  })

  const { data: invoices } = useQuery({
    queryKey: ["property-invoices", propertyId, billingYear],
    queryFn: () => api.propertyInvoices(propertyId, billingYear),
    enabled: !!propertyId && !!billingYearInfo,
  })

  const [form, setForm] = useState(defaultPropertyInvoiceForm(billingYear))
  const [unitForm, setUnitForm] = useState({ name: "", living_area_sqm: "" })
  const [propertyForm, setPropertyForm] = useState({
    name: "",
    street: "",
    city: "",
    total_area_sqm: "",
    common_area_sqm: "",
    property_type: "mfh",
  })

  useEffect(() => {
    if (property) {
      setPropertyForm({
        name: property.name,
        street: property.street,
        city: property.city,
        total_area_sqm: property.total_area_sqm || "",
        common_area_sqm: property.common_area_sqm || "",
        property_type: property.property_type,
      })
    }
  }, [property])

  const createBillingYear = useMutation({
    mutationFn: (year: number) => api.createPropertyBillingYear(propertyId, year),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["property-billing-years", propertyId] }),
  })

  const saveProperty = useMutation({
    mutationFn: () =>
      api.updateProperty(propertyId, {
        ...propertyForm,
        total_area_sqm: propertyForm.total_area_sqm || null,
        common_area_sqm: propertyForm.common_area_sqm || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["property", propertyId] }),
  })

  const createUnit = useMutation({
    mutationFn: () =>
      api.createUnit(propertyId, {
        name: unitForm.name,
        living_area_sqm: unitForm.living_area_sqm || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      setUnitForm({ name: "", living_area_sqm: "" })
    },
  })

  const createInvoice = useMutation({
    mutationFn: () =>
      api.createPropertyInvoice(propertyId, billingYear, {
        ...form,
        allocation_key: form.allocation_key,
        allocation_scope: "property",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["property-invoices", propertyId, billingYear] }),
  })

  if (!property) return <p>Laden…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{property.name}</h1>
          <p className="text-muted-foreground">
            {BILLING_LABELS.mfh.topUnit} · {property.property_type_label}
          </p>
        </div>
        <LinkButton variant="outline" to="/gebaeude">Zurück</LinkButton>
      </div>

      <Tabs defaultValue="stammdaten">
        <TabsList>
          <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>
          <TabsTrigger value="wohnungen">{BILLING_LABELS.mfh.subUnitPlural}</TabsTrigger>
          <TabsTrigger value="hausrechnungen">Haus-Rechnungen</TabsTrigger>
        </TabsList>

        <TabsContent value="stammdaten" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{BILLING_LABELS.mfh.topUnit} — Stammdaten</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Name</Label><Input value={propertyForm.name} onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Gesamtfläche (m²)</Label><Input type="number" step="0.01" value={propertyForm.total_area_sqm} onChange={(e) => setPropertyForm({ ...propertyForm, total_area_sqm: e.target.value })} /></div>
              <div className="space-y-2"><Label>Straße</Label><Input value={propertyForm.street} onChange={(e) => setPropertyForm({ ...propertyForm, street: e.target.value })} /></div>
              <div className="space-y-2"><Label>Gemeinschaftsfläche (m²)</Label><Input type="number" step="0.01" value={propertyForm.common_area_sqm} onChange={(e) => setPropertyForm({ ...propertyForm, common_area_sqm: e.target.value })} /></div>
              <div className="space-y-2"><Label>PLZ / Ort</Label><Input value={propertyForm.city} onChange={(e) => setPropertyForm({ ...propertyForm, city: e.target.value })} /></div>
              <div className="md:col-span-2"><Button onClick={() => saveProperty.mutate()} disabled={saveProperty.isPending}>Speichern</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wohnungen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{BILLING_LABELS.mfh.subUnitPlural} im {BILLING_LABELS.mfh.topUnit}</CardTitle>
              <CardDescription>
                Untereinheiten des Gebäudes — Nutzfläche je {BILLING_LABELS.mfh.subUnit} für Rechnungen
                mit Verteilerquote Fläche (m²). {ALLOCATION_PER_INVOICE_HINT}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Fläche (m²)</TableHead>
                    <TableHead>Zimmer</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {property.units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell>{unit.name}</TableCell>
                      <TableCell>{unit.living_area_sqm || "—"}</TableCell>
                      <TableCell>{unit.room_count}</TableCell>
                      <TableCell><LinkButton size="sm" variant="outline" to={`/wohnungen/${unit.id}`}>Öffnen</LinkButton></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-end gap-2 border-t pt-4">
                <div className="space-y-2"><Label>Neue {BILLING_LABELS.mfh.subUnit}</Label><Input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="Whg 1" className="w-48" /></div>
                <div className="space-y-2"><Label>m²</Label><Input type="number" step="0.01" value={unitForm.living_area_sqm} onChange={(e) => setUnitForm({ ...unitForm, living_area_sqm: e.target.value })} className="w-32" /></div>
                <Button onClick={() => createUnit.mutate()} disabled={!unitForm.name || createUnit.isPending}>Anlegen</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hausrechnungen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Abrechnungsjahr {billingYear}</CardTitle>
              <CardDescription>
                Rechnungen auf Gebäude-Ebene (z. B. Grundsteuer, Versicherung). Verteilerquote je Rechnung wählen —
                bei Fläche (m²) wird der Betrag anteilig nach Wohnungsflächen verteilt.
                {" "}
                {ALLOCATION_PER_INVOICE_HINT}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {billingYears?.map((by) => (
                <LinkButton key={by.id} variant={by.year === billingYear ? "default" : "outline"} size="sm" to={`/gebaeude/${propertyId}/abrechnung/${by.year}`}>
                  {by.year}
                </LinkButton>
              ))}
              <Button variant="secondary" size="sm" onClick={() => createBillingYear.mutate(billingYear)} disabled={createBillingYear.isPending}>
                Jahr {billingYear} anlegen
              </Button>
            </CardContent>
          </Card>

          {billingYearInfo && (
            <>
              <Card>
                <CardHeader><CardTitle>Haus-Rechnung erfassen</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Kostenart</Label>
                    <Select
                      value={form.invoice_type}
                      items={INVOICE_TYPE_ITEMS}
                      onValueChange={(v) => v && setForm({ ...form, invoice_type: v, allocation_key: DEFAULT_ALLOCATION_BY_TYPE[v] || "flaeche_qm" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{INVOICE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Verteilerquote</Label>
                    <Select value={form.allocation_key} items={ALLOCATION_ITEMS} onValueChange={(v) => v && setForm({ ...form, allocation_key: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ALLOCATION_KEYS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Betrag (€)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Bezeichnung</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Von</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Bis</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
                  <div className="space-y-2 md:col-span-3"><Label>Notiz</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
                  <div className="md:col-span-3"><Button onClick={() => createInvoice.mutate()} disabled={!form.amount || createInvoice.isPending}>Hinzufügen</Button></div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Art</TableHead>
                        <TableHead>Verteilerquote</TableHead>
                        <TableHead>Betrag</TableHead>
                        <TableHead>Anteil {billingYear}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices?.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>{inv.invoice_type_label}</TableCell>
                          <TableCell>{inv.allocation_key_label}</TableCell>
                          <TableCell>{formatEur(inv.amount)}</TableCell>
                          <TableCell>{inv.prorated_amount ? formatEur(inv.prorated_amount) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
