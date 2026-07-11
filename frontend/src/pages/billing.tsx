import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"

import { LinkButton } from "@/components/link-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, formatEur, MONTHS } from "@/lib/api"

const INVOICE_TYPES = [
  { value: "weg", label: "WEG-Betriebskosten" },
  { value: "gas", label: "Gas" },
  { value: "strom", label: "Strom" },
  { value: "handwerker", label: "Handwerker" },
  { value: "grundsteuer", label: "Grundsteuer" },
  { value: "sonstiges", label: "Sonstiges" },
]

export function BillingPage() {
  const { id, year } = useParams()
  const apartmentId = Number(id)
  const billingYear = Number(year)
  const queryClient = useQueryClient()

  const { data: apartment } = useQuery({
    queryKey: ["apartment", apartmentId],
    queryFn: () => api.getApartment(apartmentId),
    enabled: !!apartmentId,
  })
  const { data: invoices } = useQuery({
    queryKey: ["invoices", apartmentId, billingYear],
    queryFn: () => api.invoices(apartmentId, billingYear),
    enabled: !!apartmentId && !!billingYear,
  })
  const { data: advanceRows } = useQuery({
    queryKey: ["advance", apartmentId, billingYear],
    queryFn: () => api.advancePayments(apartmentId, billingYear),
    enabled: !!apartmentId && !!billingYear,
  })
  const { data: preview, refetch: refetchPreview } = useQuery({
    queryKey: ["preview", apartmentId, billingYear],
    queryFn: () => api.preview(apartmentId, billingYear),
    enabled: false,
  })

  const [invoiceForm, setInvoiceForm] = useState({
    invoice_type: "weg",
    label: "",
    amount: "",
    period_start: `${billingYear}-01-01`,
    period_end: `${billingYear}-12-31`,
    note: "",
  })
  const [advanceDraft, setAdvanceDraft] = useState<Record<string, string>>({})
  const [exportFiles, setExportFiles] = useState<{ filename: string; tenant_name: string }[]>([])

  const createInvoice = useMutation({
    mutationFn: () =>
      api.createInvoice(apartmentId, billingYear, {
        ...invoiceForm,
        amount: invoiceForm.amount,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices", apartmentId, billingYear] }),
  })

  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: number) => api.deleteInvoice(invoiceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices", apartmentId, billingYear] }),
  })

  const saveAdvance = useMutation({
    mutationFn: () => {
      const payments = Object.entries(advanceDraft).map(([key, amount]) => {
        const [leaseId, month] = key.split("-")
        return { lease_id: Number(leaseId), month: Number(month), amount: amount || "0" }
      })
      return api.updateAdvancePayments(apartmentId, billingYear, payments)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["advance", apartmentId, billingYear] }),
  })

  const exportMutation = useMutation({
    mutationFn: () => api.export(apartmentId, billingYear),
    onSuccess: (data) => setExportFiles(data.files),
  })

  function getAdvanceValue(leaseId: number, month: number) {
    const key = `${leaseId}-${month}`
    if (key in advanceDraft) return advanceDraft[key]
    const row = advanceRows?.find((r) => r.lease_id === leaseId)
    return row?.months[month] ?? row?.months[String(month)] ?? "0"
  }

  function fillUniform(amount: string) {
    if (!advanceRows) return
    const draft: Record<string, string> = {}
    advanceRows.forEach((row) => {
      for (let m = 1; m <= 12; m++) draft[`${row.lease_id}-${m}`] = amount
    })
    setAdvanceDraft(draft)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Abrechnung {billingYear}</h1>
          <p className="text-muted-foreground">{apartment?.name}</p>
        </div>
        <LinkButton variant="outline" to="/">
          Dashboard
        </LinkButton>
      </div>

      <Tabs defaultValue="rechnungen">
        <TabsList>
          <TabsTrigger value="rechnungen">Rechnungen</TabsTrigger>
          <TabsTrigger value="vorauszahlungen">Vorauszahlungen</TabsTrigger>
          <TabsTrigger value="vorschau">Vorschau & Export</TabsTrigger>
        </TabsList>

        <TabsContent value="rechnungen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rechnung erfassen</CardTitle>
              <CardDescription>Alle Kostenarten sind optional</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Kostenart</Label>
                <Select value={invoiceForm.invoice_type} onValueChange={(v) => v && setInvoiceForm({ ...invoiceForm, invoice_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVOICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
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
              <Button onClick={() => createInvoice.mutate()} disabled={!invoiceForm.amount}>Hinzufügen</Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Art</TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead>Rechnungsbetrag</TableHead>
                    <TableHead>Anteil {billingYear}</TableHead>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices?.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.invoice_type_label}</TableCell>
                      <TableCell>{inv.label || "—"}</TableCell>
                      <TableCell>{formatEur(inv.amount)}</TableCell>
                      <TableCell>{inv.prorated_amount ? formatEur(inv.prorated_amount) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.period_start} – {inv.period_end}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => deleteInvoice.mutate(inv.id)}>Löschen</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vorauszahlungen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Vorauszahlungen pro Mietpartei</CardTitle>
              <CardDescription>Manuelle Eingabe vor der Abrechnungserstellung</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input className="max-w-xs" placeholder="Betrag für alle Monate" id="uniform-amount" />
                <Button variant="secondary" onClick={() => {
                  const el = document.getElementById("uniform-amount") as HTMLInputElement
                  fillUniform(el?.value || "0")
                }}>
                  Gleicher Betrag für alle Monate
                </Button>
                <Button onClick={() => saveAdvance.mutate()} disabled={saveAdvance.isPending}>Speichern</Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mieter</TableHead>
                      <TableHead>Zimmer</TableHead>
                      {MONTHS.map((m) => <TableHead key={m}>{m}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {advanceRows?.map((row) => (
                      <TableRow key={row.lease_id}>
                        <TableCell>{row.tenant_name}</TableCell>
                        <TableCell>{row.room_name}</TableCell>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                          <TableCell key={month}>
                            <Input
                              className="w-20"
                              type="number"
                              step="0.01"
                              value={getAdvanceValue(row.lease_id, month)}
                              onChange={(e) => setAdvanceDraft({ ...advanceDraft, [`${row.lease_id}-${month}`]: e.target.value })}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vorschau" className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={() => refetchPreview()}>Vorschau berechnen</Button>
            <Button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              DOCX exportieren
            </Button>
          </div>

          {preview?.warnings?.length ? (
            <Card>
              <CardContent className="pt-6 text-sm text-amber-700">
                {preview.warnings.map((w) => <p key={w}>{w}</p>)}
              </CardContent>
            </Card>
          ) : null}

          {preview?.parties.map((party) => (
            <Card key={party.lease_id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{party.tenant_name} — {party.room_name}</CardTitle>
                  <Badge variant={party.balance_type === "nachzahlung" ? "destructive" : party.balance_type === "guthaben" ? "default" : "secondary"}>
                    {party.balance_type === "nachzahlung" ? "Nachzahlung" : party.balance_type === "guthaben" ? "Guthaben" : "Ausgeglichen"} {formatEur(Math.abs(parseFloat(party.balance)))}
                  </Badge>
                </div>
                <CardDescription>Kopfmonate: {parseFloat(party.head_months).toFixed(2)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kostenart</TableHead>
                      <TableHead>Gesamt (Objekt)</TableHead>
                      <TableHead>Ihr Anteil</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {party.cost_lines.map((line) => (
                      <TableRow key={line.invoice_id}>
                        <TableCell>{line.label}</TableCell>
                        <TableCell>{formatEur(line.total_prorated)}</TableCell>
                        <TableCell>{formatEur(line.party_share)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-medium">Summe Nebenkosten</TableCell>
                      <TableCell />
                      <TableCell className="font-medium">{formatEur(party.total_costs)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Abzüglich Vorauszahlungen</TableCell>
                      <TableCell />
                      <TableCell>{formatEur(party.total_advance_payments)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          {exportFiles.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Exportierte Dateien</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {exportFiles.map((f) => (
                  <div key={f.filename}>
                    <a
                      className="text-primary underline"
                      href={`/api/apartments/${apartmentId}/billing-years/${billingYear}/export/${f.filename}`}
                      download
                    >
                      {f.filename} ({f.tenant_name})
                    </a>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {preview && (
            <p className="text-sm text-muted-foreground">
              Gesamtkopfmonate: {parseFloat(preview.total_head_months).toFixed(2)} ·
              Leerstand Vermieter: {parseFloat(preview.landlord_vacancy_head_months).toFixed(2)}
            </p>
          )}
        </TabsContent>
      </Tabs>
      <Separator />
    </div>
  )
}
