import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"

import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api, DEFAULT_ALLOCATION_BY_TYPE, formatEur } from "@/lib/api"
import { ALLOCATION_ITEMS, ALLOCATION_KEYS, ALLOCATION_PER_INVOICE_HINT } from "@/lib/billing-labels"

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

function defaultInvoiceForm(year: number) {
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

export function PropertyBillingPage() {
  const { id, year } = useParams()
  const propertyId = Number(id)
  const billingYear = Number(year)
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

  const { data: invoices } = useQuery({
    queryKey: ["property-invoices", propertyId, billingYear],
    queryFn: () => api.propertyInvoices(propertyId, billingYear),
    enabled: !!propertyId && !!billingYear,
  })

  const [invoiceForm, setInvoiceForm] = useState(defaultInvoiceForm(billingYear))
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null)
  const [pendingPdf, setPendingPdf] = useState<File | null>(null)

  const createInvoice = useMutation({
    mutationFn: async () => {
      const created = await api.createPropertyInvoice(propertyId, billingYear, {
        ...invoiceForm,
        allocation_scope: "property",
      })
      if (pendingPdf) {
        try {
          await api.uploadInvoiceDocument(created.id, pendingPdf)
        } catch (uploadError) {
          throw new Error(
            `Rechnung gespeichert, PDF-Upload fehlgeschlagen: ${(uploadError as Error).message}`,
          )
        }
      }
      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-invoices", propertyId, billingYear] })
      queryClient.invalidateQueries({ queryKey: ["property-billing-years", propertyId] })
      setInvoiceForm(defaultInvoiceForm(billingYear))
      setPendingPdf(null)
    },
  })

  const updateInvoice = useMutation({
    mutationFn: async () => {
      const updated = await api.updateInvoice(editingInvoiceId!, invoiceForm)
      if (pendingPdf) {
        await api.uploadInvoiceDocument(updated.id, pendingPdf)
      }
      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-invoices", propertyId, billingYear] })
      setEditingInvoiceId(null)
      setInvoiceForm(defaultInvoiceForm(billingYear))
      setPendingPdf(null)
    },
  })

  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: number) => api.deleteInvoice(invoiceId),
    onSuccess: (_, invoiceId) => {
      queryClient.invalidateQueries({ queryKey: ["property-invoices", propertyId, billingYear] })
      if (editingInvoiceId === invoiceId) {
        setEditingInvoiceId(null)
        setInvoiceForm(defaultInvoiceForm(billingYear))
      }
    },
  })

  function startEditInvoice(invoice: NonNullable<typeof invoices>[number]) {
    setEditingInvoiceId(invoice.id)
    setPendingPdf(null)
    setInvoiceForm({
      invoice_type: invoice.invoice_type,
      allocation_key: invoice.allocation_key,
      label: invoice.label,
      amount: invoice.amount,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      note: invoice.note,
    })
  }

  function cancelEditInvoice() {
    setEditingInvoiceId(null)
    setPendingPdf(null)
    setInvoiceForm(defaultInvoiceForm(billingYear))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Abrechnung {billingYear}</h1>
          <p className="text-muted-foreground">{property?.name}</p>
        </div>
        <LinkButton variant="outline" to={`/gebaeude/${propertyId}`}>
          Zum Gebäude
        </LinkButton>
      </div>

      {billingYears && billingYears.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {billingYears.map((by) => (
            <LinkButton
              key={by.id}
              variant={by.year === billingYear ? "default" : "outline"}
              size="sm"
              to={`/gebaeude/${propertyId}/abrechnung/${by.year}`}
            >
              {by.year}
            </LinkButton>
          ))}
        </div>
      )}

      <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{editingInvoiceId ? "Rechnung bearbeiten" : "Rechnung erfassen"}</CardTitle>
              <CardDescription>
                Haus-Rechnungen auf Gebäude-Ebene. {ALLOCATION_PER_INVOICE_HINT}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Kostenart</Label>
                <Select
                  value={invoiceForm.invoice_type}
                  items={INVOICE_TYPE_ITEMS}
                  onValueChange={(v) =>
                    v &&
                    setInvoiceForm({
                      ...invoiceForm,
                      invoice_type: v,
                      allocation_key: DEFAULT_ALLOCATION_BY_TYPE[v] || "flaeche_qm",
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVOICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Verteilerquote</Label>
                <Select
                  value={invoiceForm.allocation_key}
                  items={ALLOCATION_ITEMS}
                  onValueChange={(v) => v && setInvoiceForm({ ...invoiceForm, allocation_key: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALLOCATION_KEYS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bezeichnung</Label>
                <Input value={invoiceForm.label} onChange={(e) => setInvoiceForm({ ...invoiceForm, label: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Betrag (€)</Label>
                <Input type="number" step="0.01" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Rechnungszeitraum von</Label>
                <Input type="date" value={invoiceForm.period_start} onChange={(e) => setInvoiceForm({ ...invoiceForm, period_start: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Rechnungszeitraum bis</Label>
                <Input type="date" value={invoiceForm.period_end} onChange={(e) => setInvoiceForm({ ...invoiceForm, period_end: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Notiz</Label>
                <Textarea value={invoiceForm.note} onChange={(e) => setInvoiceForm({ ...invoiceForm, note: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>PDF-Beleg</Label>
                <Input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setPendingPdf(e.target.files?.[0] ?? null)}
                />
                {editingInvoiceId && invoices?.find((i) => i.id === editingInvoiceId)?.has_document ? (
                  <p className="text-sm text-muted-foreground">
                    Beleg vorhanden —{" "}
                    <a className="underline" href={api.downloadInvoiceDocument(editingInvoiceId)} target="_blank" rel="noreferrer">
                      anzeigen
                    </a>
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-3">
                {editingInvoiceId ? (
                  <>
                    <Button onClick={() => updateInvoice.mutate()} disabled={!invoiceForm.amount || updateInvoice.isPending}>
                      Speichern
                    </Button>
                    <Button variant="outline" onClick={cancelEditInvoice} disabled={updateInvoice.isPending}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => createInvoice.mutate()} disabled={!invoiceForm.amount || createInvoice.isPending}>
                    Hinzufügen
                  </Button>
                )}
              </div>
              {createInvoice.isError && (
                <p className="text-sm text-destructive md:col-span-3">
                  Rechnung konnte nicht gespeichert werden: {(createInvoice.error as Error).message}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Table className="min-w-max table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Art</TableHead>
                    <TableHead>Verteilerquote</TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead>Rechnungsbetrag</TableHead>
                    <TableHead>Anteil {billingYear}</TableHead>
                    <TableHead>Beleg</TableHead>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead className="sticky right-0 z-10 min-w-[11rem] border-l bg-card">
                      Aktionen
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices?.map((inv) => (
                    <TableRow key={inv.id} className="group">
                      <TableCell>{inv.invoice_type_label}</TableCell>
                      <TableCell>{inv.allocation_key_label}</TableCell>
                      <TableCell>{inv.label || "—"}</TableCell>
                      <TableCell>{formatEur(inv.amount)}</TableCell>
                      <TableCell>{inv.prorated_amount ? formatEur(inv.prorated_amount) : "—"}</TableCell>
                      <TableCell>
                        {inv.has_document ? (
                          <a className="text-sm underline" href={api.downloadInvoiceDocument(inv.id)} target="_blank" rel="noreferrer">PDF</a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.period_start} – {inv.period_end}</TableCell>
                      <TableCell className="sticky right-0 z-10 min-w-[11rem] space-x-1 border-l bg-card group-hover:bg-muted/50">
                        <Button variant="outline" size="sm" onClick={() => startEditInvoice(inv)}>
                          Bearbeiten
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm("Rechnung wirklich löschen?")) {
                              deleteInvoice.mutate(inv.id)
                            }
                          }}
                          disabled={deleteInvoice.isPending}
                        >
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
    </div>
  )
}
