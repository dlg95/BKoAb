import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useParams } from "react-router-dom"
import { useState } from "react"

import { BillingYearsCard } from "@/components/billing-years-card"
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
import { api, DEFAULT_ALLOCATION_BY_TYPE, formatEur, MONTHS } from "@/lib/api"
import { ALLOCATION_ITEMS, ALLOCATION_KEYS } from "@/lib/billing-labels"
import { pickExportDirectory, saveDocxBlob } from "@/lib/download"
import { abbreviateTenantName } from "@/lib/utils"

const INVOICE_TYPES = [
  { value: "gas", label: "Gas" },
  { value: "strom", label: "Strom" },
  { value: "handwerker", label: "Handwerker" },
  { value: "grundsteuer", label: "Grundsteuer" },
  { value: "hausmeister", label: "Hausmeister / Reinigung" },
  { value: "aufzug", label: "Aufzug / Lift" },
  { value: "versicherung", label: "Gebäudeversicherung" },
  { value: "schornsteinfeger", label: "Schornsteinfeger" },
  { value: "wasser_abwasser", label: "Wasser / Abwasser" },
  { value: "muell", label: "Müll / Straßenreinigung" },
  { value: "kabel", label: "Kabel / Gemeinschaftsantenne" },
  { value: "heizung_gebaeude", label: "Heizkosten (Gebäude)" },
  { value: "weg", label: "WEG-Betriebskosten" },
  { value: "sonstiges", label: "Sonstiges" },
] as const

const INVOICE_TYPE_ITEMS = Object.fromEntries(
  INVOICE_TYPES.map((type) => [type.value, type.label]),
)

function defaultInvoiceForm(year: number) {
  return {
    invoice_type: "gas",
    allocation_key: "personenmonate",
    label: "",
    amount: "",
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    note: "",
  }
}

export function BillingPage() {
  const { id, year } = useParams()
  const apartmentId = Number(id)
  const billingYear = Number(year)
  const queryClient = useQueryClient()

  const { data: billingYears } = useQuery({
    queryKey: ["billing-years", apartmentId],
    queryFn: () => api.billingYears(apartmentId),
    enabled: !!apartmentId,
  })
  const { data: billingYearInfo, isError: billingYearMissing } = useQuery({
    queryKey: ["billing-year", apartmentId, billingYear],
    queryFn: () => api.getBillingYear(apartmentId, billingYear),
    enabled: !!apartmentId && !!billingYear,
    retry: false,
  })
  const { data: apartment } = useQuery({
    queryKey: ["apartment", apartmentId],
    queryFn: () => api.getApartment(apartmentId),
    enabled: !!apartmentId,
  })
  const { data: invoices } = useQuery({
    queryKey: ["invoices", apartmentId, billingYear],
    queryFn: () => api.invoices(apartmentId, billingYear),
    enabled: !!apartmentId && !!billingYear && !!billingYearInfo,
  })
  const { data: advanceRows } = useQuery({
    queryKey: ["advance", apartmentId, billingYear],
    queryFn: () => api.advancePayments(apartmentId, billingYear),
    enabled: !!apartmentId && !!billingYear && !!billingYearInfo,
  })
  const { data: preview, refetch: refetchPreview } = useQuery({
    queryKey: ["preview", apartmentId, billingYear],
    queryFn: () => api.preview(apartmentId, billingYear),
    enabled: false,
  })

  const [invoiceForm, setInvoiceForm] = useState(defaultInvoiceForm(billingYear))
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null)
  const [pendingPdf, setPendingPdf] = useState<File | null>(null)
  const [advanceDraft, setAdvanceDraft] = useState<Record<string, string>>({})
  const [exportDirHandle, setExportDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [exportDirName, setExportDirName] = useState<string | null>(null)
  const [exportingLeaseId, setExportingLeaseId] = useState<number | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const createInvoice = useMutation({
    mutationFn: async () => {
      const created = await api.createInvoice(apartmentId, billingYear, {
        ...invoiceForm,
        amount: invoiceForm.amount,
      })
      if (pendingPdf) {
        await api.uploadInvoiceDocument(created.id, pendingPdf)
      }
      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", apartmentId, billingYear] })
      setInvoiceForm(defaultInvoiceForm(billingYear))
      setPendingPdf(null)
    },
  })

  const updateInvoice = useMutation({
    mutationFn: async () => {
      const updated = await api.updateInvoice(editingInvoiceId!, {
        ...invoiceForm,
        amount: invoiceForm.amount,
      })
      if (pendingPdf) {
        await api.uploadInvoiceDocument(updated.id, pendingPdf)
      }
      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", apartmentId, billingYear] })
      setEditingInvoiceId(null)
      setInvoiceForm(defaultInvoiceForm(billingYear))
      setPendingPdf(null)
    },
  })

  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: number) => api.deleteInvoice(invoiceId),
    onSuccess: (_, invoiceId) => {
      queryClient.invalidateQueries({ queryKey: ["invoices", apartmentId, billingYear] })
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

  const saveAdvance = useMutation({
    mutationFn: () => {
      const payments = Object.entries(advanceDraft)
        .map(([key, amount]) => {
          const [leaseId, month] = key.split("-")
          return { lease_id: Number(leaseId), month: Number(month), amount: amount || "0" }
        })
        .filter(({ lease_id, month }) => {
          const row = advanceRows?.find((r) => r.lease_id === lease_id)
          return row?.occupied_months.includes(month)
        })
      return api.updateAdvancePayments(apartmentId, billingYear, payments)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["advance", apartmentId, billingYear] }),
  })

  async function chooseExportDirectory() {
    const handle = await pickExportDirectory()
    if (!handle) return
    setExportDirHandle(handle)
    setExportDirName(handle.name)
    setExportStatus(`Zielordner: ${handle.name}`)
  }

  async function exportPartyDocx(leaseId: number, tenantName: string, roomName: string) {
    setExportingLeaseId(leaseId)
    setExportStatus(`DOCX wird erstellt für ${tenantName} (${roomName})…`)
    try {
      const { blob, filename } = await api.exportPartyDocx(
        apartmentId,
        billingYear,
        leaseId,
        tenantName,
        roomName,
      )
      const result = await saveDocxBlob(blob, filename, exportDirHandle)
      if (result === "cancelled") {
        setExportStatus("Speichern abgebrochen.")
        return
      }
      if (result === "directory" && exportDirName) {
        setExportStatus(`${filename} gespeichert in ${exportDirName}.`)
        return
      }
      setExportStatus(`${filename} gespeichert.`)
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Export fehlgeschlagen.")
    } finally {
      setExportingLeaseId(null)
    }
  }

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
      for (const month of row.occupied_months) {
        draft[`${row.lease_id}-${month}`] = amount
      }
    })
    setAdvanceDraft(draft)
  }

  function isOccupiedMonth(row: { occupied_months: number[] }, month: number) {
    return row.occupied_months.includes(month)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Abrechnung {billingYear}</h1>
          <p className="text-muted-foreground">{apartment?.name}</p>
        </div>
        <LinkButton variant="outline" to={`/wohnungen/${apartmentId}`}>
          Zur WG-Wohnung
        </LinkButton>
      </div>

      {billingYears && billingYears.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {billingYears.map((by) => (
            <LinkButton
              key={by.id}
              variant={by.year === billingYear ? "default" : "outline"}
              size="sm"
              to={`/wohnungen/${apartmentId}/abrechnung/${by.year}`}
            >
              {by.year}
            </LinkButton>
          ))}
        </div>
      )}

      {billingYearMissing ? (
        <BillingYearsCard apartmentId={apartmentId} unitName={apartment?.name} />
      ) : (
      <Tabs defaultValue="rechnungen">
        <TabsList>
          <TabsTrigger value="rechnungen">Rechnungen</TabsTrigger>
          <TabsTrigger value="vorauszahlungen">Vorauszahlungen</TabsTrigger>
          <TabsTrigger value="vorschau">Vorschau & Export</TabsTrigger>
        </TabsList>

        <TabsContent value="rechnungen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{editingInvoiceId ? "Rechnung bearbeiten" : "Rechnung erfassen"}</CardTitle>
              <CardDescription>
                {editingInvoiceId
                  ? "Änderungen speichern oder die Bearbeitung abbrechen."
                  : "Alle Kostenarten sind optional"}
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
                      allocation_key: DEFAULT_ALLOCATION_BY_TYPE[v] || "personenmonate",
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
                    <Button
                      onClick={() => updateInvoice.mutate()}
                      disabled={!invoiceForm.amount || updateInvoice.isPending}
                    >
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
                      <TableHead className="w-44 whitespace-nowrap">Mieter</TableHead>
                      <TableHead className="w-36 whitespace-nowrap">Zimmer</TableHead>
                      {MONTHS.map((m) => <TableHead key={m} className="w-20 whitespace-nowrap">{m}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {advanceRows?.map((row) => (
                      <TableRow key={row.lease_id}>
                        <TableCell
                          className="overflow-visible whitespace-nowrap"
                          title={row.tenant_name}
                        >
                          {abbreviateTenantName(row.tenant_name)}
                        </TableCell>
                        <TableCell className="overflow-visible whitespace-nowrap">
                          {row.room_name}
                        </TableCell>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                          <TableCell key={month} className="w-20 p-1">
                            {isOccupiedMonth(row, month) ? (
                              <Input
                                className="w-20"
                                type="number"
                                step="0.01"
                                value={getAdvanceValue(row.lease_id, month)}
                                onChange={(e) => setAdvanceDraft({ ...advanceDraft, [`${row.lease_id}-${month}`]: e.target.value })}
                              />
                            ) : (
                              <span className="flex h-9 w-20 items-center justify-center text-muted-foreground">—</span>
                            )}
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
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => refetchPreview()}>Vorschau berechnen</Button>
            <Button variant="outline" onClick={() => chooseExportDirectory()}>
              Zielordner wählen
            </Button>
            {exportDirName ? (
              <span className="text-sm text-muted-foreground">Speicherort: {exportDirName}</span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Ohne Zielordner öffnet sich beim Export der Speichern-Dialog.
              </span>
            )}
          </div>

          {exportStatus ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm">
                {exportingLeaseId !== null ? <Loader2 className="size-4 animate-spin" /> : null}
                {exportStatus}
              </CardContent>
            </Card>
          ) : null}

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
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{party.tenant_name} — {party.room_name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={exportingLeaseId !== null}
                      onClick={() => exportPartyDocx(party.lease_id, party.tenant_name, party.room_name)}
                    >
                      {exportingLeaseId === party.lease_id ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Erstellt DOCX…
                        </>
                      ) : (
                        "DOCX erstellen"
                      )}
                    </Button>
                    <Badge variant={party.balance_type === "nachzahlung" ? "destructive" : party.balance_type === "guthaben" ? "default" : "secondary"}>
                      {party.balance_type === "nachzahlung" ? "Nachzahlung" : party.balance_type === "guthaben" ? "Guthaben" : "Ausgeglichen"} {formatEur(Math.abs(parseFloat(party.balance)))}
                    </Badge>
                  </div>
                </div>
                <CardDescription>Personenmonate: {parseFloat(party.head_months).toFixed(2)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kostenart</TableHead>
                      <TableHead>Quote</TableHead>
                      <TableHead>Gesamt (Objekt)</TableHead>
                      <TableHead>Ihr Anteil</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {party.cost_lines.map((line) => (
                      <TableRow key={line.invoice_id}>
                        <TableCell>{line.label}</TableCell>
                        <TableCell>{line.allocation_key === "personenmonate" ? "PM" : "m²"}</TableCell>
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

          {preview && (
            <p className="text-sm text-muted-foreground">
              Personenmonate gesamt: {parseFloat(preview.total_head_months).toFixed(2)} ·
              Leerstand Vermieter: {parseFloat(preview.landlord_vacancy_head_months).toFixed(2)}
              {preview.unit_area_sqm && preview.total_property_area_sqm ? (
                <> · Wohnfläche: {parseFloat(preview.unit_area_sqm).toFixed(2)} / {parseFloat(preview.total_property_area_sqm).toFixed(2)} m²</>
              ) : null}
            </p>
          )}
        </TabsContent>
      </Tabs>
      )}
      <Separator />
    </div>
  )
}
