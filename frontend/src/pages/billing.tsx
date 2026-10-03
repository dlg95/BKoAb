import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileArchive, FolderOpen, Loader2, ReceiptText } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { useState } from "react"

import { BillingYearsCard } from "@/components/billing-years-card"
import { Callout } from "@/components/callout"
import { EmptyState } from "@/components/empty-state"
import { LinkButton } from "@/components/link-button"
import { PageHeader } from "@/components/page-header"
import { PlausibilityPanel } from "@/components/plausibility-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  api,
  DEFAULT_ALLOCATION_KEY,
  errorMessage,
  formatDate,
  formatEur,
  MONTHS,
  type ExportFormat,
  type PlausibilityCheck,
} from "@/lib/api"
import { ALLOCATION_ITEMS, ALLOCATION_KEYS } from "@/lib/billing-labels"
import { pickExportDirectory, saveDocxBlob, saveExportBlob, savePdfBlob } from "@/lib/download"
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

const ALLOCATION_SHORT: Record<string, string> = {
  personenmonate: "PM",
  flaeche_qm: "m²",
  wohneinheiten: "Einheiten",
  direktzuordnung: "direkt",
  mea: "MEA",
}

function formatShareBasis(line: { allocation_key: string; party_numerator: string; party_denominator: string }) {
  const num = parseFloat(line.party_numerator)
  const den = parseFloat(line.party_denominator)
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return "—"
  const fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 })
  return `${fmt(num)} / ${fmt(den)}`
}

/** Remount per apartment/year so drafts never leak from one billing year into another. */
export function BillingRoute() {
  const { id, year } = useParams()
  return <BillingPage key={`${id}-${year}`} />
}

function defaultInvoiceForm(year: number) {
  return {
    invoice_type: "gas",
    allocation_key: DEFAULT_ALLOCATION_KEY,
    label: "",
    amount: "",
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    note: "",
    target_lease_ids: [] as number[],
  }
}

function BillingPage() {
  const { id, year } = useParams()
  const apartmentId = Number(id)
  const billingYear = Number(year)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

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
  const { data: leases } = useQuery({
    queryKey: ["leases", apartmentId],
    queryFn: () => api.leases(apartmentId),
    enabled: !!apartmentId,
  })
  const { data: advanceRows } = useQuery({
    queryKey: ["advance", apartmentId, billingYear],
    queryFn: () => api.advancePayments(apartmentId, billingYear),
    enabled: !!apartmentId && !!billingYear && !!billingYearInfo,
  })
  const [tab, setTab] = useState("rechnungen")
  const {
    data: preview,
    refetch: refetchPreview,
    isFetching: previewLoading,
    error: previewError,
  } = useQuery({
    queryKey: ["preview", apartmentId, billingYear],
    queryFn: () => api.preview(apartmentId, billingYear),
    enabled: tab === "vorschau" && !!billingYearInfo,
  })

  const [invoiceForm, setInvoiceForm] = useState(defaultInvoiceForm(billingYear))
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null)
  const [pendingPdf, setPendingPdf] = useState<File | null>(null)
  const [advanceDraft, setAdvanceDraft] = useState<Record<string, string>>({})
  const [uniformAmount, setUniformAmount] = useState("")
  const [advanceSaved, setAdvanceSaved] = useState(false)
  const [exportDirHandle, setExportDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [exportDirName, setExportDirName] = useState<string | null>(null)
  const [exportingLeaseId, setExportingLeaseId] = useState<number | null>(null)
  const [exportingFormat, setExportingFormat] = useState<"docx" | "pdf" | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [includeSuggestion, setIncludeSuggestion] = useState(true)
  const [zipFormat, setZipFormat] = useState<ExportFormat>("both")
  const [zipExporting, setZipExporting] = useState(false)

  const direktzuordnungIncomplete =
    invoiceForm.allocation_key === "direktzuordnung" && invoiceForm.target_lease_ids.length === 0

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
      queryClient.invalidateQueries({ queryKey: ["preview", apartmentId, billingYear] })
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
      queryClient.invalidateQueries({ queryKey: ["preview", apartmentId, billingYear] })
      setEditingInvoiceId(null)
      setInvoiceForm(defaultInvoiceForm(billingYear))
      setPendingPdf(null)
    },
  })

  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: number) => api.deleteInvoice(invoiceId),
    onSuccess: (_, invoiceId) => {
      queryClient.invalidateQueries({ queryKey: ["invoices", apartmentId, billingYear] })
      queryClient.invalidateQueries({ queryKey: ["preview", apartmentId, billingYear] })
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
      target_lease_ids: invoice.target_lease_ids ?? [],
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
          // Empty cell = no own entry → the Soll of the Mietpartei applies again.
          return { lease_id: Number(leaseId), month: Number(month), amount: amount === "" ? null : amount }
        })
        .filter(({ lease_id, month }) => {
          const row = advanceRows?.find((r) => r.lease_id === lease_id)
          return row?.occupied_months.includes(month)
        })
      return api.updateAdvancePayments(apartmentId, billingYear, payments)
    },
    onSuccess: () => {
      setAdvanceDraft({})
      setAdvanceSaved(true)
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["advance", apartmentId, billingYear] })
      queryClient.invalidateQueries({ queryKey: ["preview", apartmentId, billingYear] })
    },
  })

  async function chooseExportDirectory() {
    const handle = await pickExportDirectory()
    if (!handle) return
    setExportDirHandle(handle)
    setExportDirName(handle.name)
    setExportStatus(`Zielordner: ${handle.name}`)
  }

  function confirmExportDespiteErrors() {
    const errors = preview?.checks.filter((c) => c.severity === "error") ?? []
    if (!errors.length) return true
    return window.confirm(
      `Die Prüfung hat ${errors.length} Fehler gefunden:\n\n${errors.map((e) => `• ${e.message}`).join("\n")}\n\nTrotzdem exportieren?`,
    )
  }

  async function exportParty(leaseId: number, tenantName: string, roomName: string, format: "docx" | "pdf") {
    if (!confirmExportDespiteErrors()) return
    setExportingLeaseId(leaseId)
    setExportingFormat(format)
    setExportStatus(`${format.toUpperCase()} wird erstellt für ${tenantName} (${roomName})…`)
    try {
      const { blob, filename } =
        format === "pdf"
          ? await api.exportPartyPdf(apartmentId, billingYear, leaseId, tenantName, roomName, includeSuggestion)
          : await api.exportPartyDocx(apartmentId, billingYear, leaseId, tenantName, roomName, includeSuggestion)
      const save = format === "pdf" ? savePdfBlob : saveDocxBlob
      const result = await save(blob, filename, exportDirHandle)
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
      setExportingFormat(null)
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    }
  }

  async function exportAllZip() {
    if (!confirmExportDespiteErrors()) return
    setZipExporting(true)
    setExportStatus("ZIP mit allen Abrechnungen wird erstellt…")
    try {
      const { blob, filename } = await api.exportAllZip(apartmentId, billingYear, zipFormat, includeSuggestion)
      const result = await saveExportBlob(blob, filename, exportDirHandle, "application/zip", "ZIP-Archiv", ".zip")
      setExportStatus(result === "cancelled" ? "Speichern abgebrochen." : `${filename} gespeichert.`)
    } catch (error) {
      setExportStatus(errorMessage(error, "Export fehlgeschlagen."))
    } finally {
      setZipExporting(false)
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    }
  }

  function navigateToCheck(area: PlausibilityCheck["area"]) {
    if (area === "rechnungen" || area === "vorauszahlungen") setTab(area)
    else if (area === "mietparteien") navigate(`/wohnungen/${apartmentId}`)
    else if (area === "stammdaten") navigate(`/wohnungen/${apartmentId}`)
    else if (area === "einstellungen") navigate("/einstellungen")
  }

  function resetOverrides() {
    if (!advanceRows) return
    const draft: Record<string, string> = { ...advanceDraft }
    for (const row of advanceRows) {
      for (const month of row.overridden_months) draft[`${row.lease_id}-${month}`] = ""
    }
    setAdvanceDraft(draft)
    setAdvanceSaved(false)
  }

  const checkProblems = preview?.checks.filter((c) => c.severity !== "info").length ?? 0

  function getAdvanceValue(leaseId: number, month: number) {
    const key = `${leaseId}-${month}`
    if (key in advanceDraft) return advanceDraft[key]
    const row = advanceRows?.find((r) => r.lease_id === leaseId)
    // Months without own entry stay empty and show the Soll as placeholder.
    if (!row?.overridden_months.includes(month)) return ""
    return row.months[String(month)] ?? ""
  }

  function plannedLabel(row: { planned: Record<string, string | null> }) {
    const values = [...new Set(Object.values(row.planned).filter((v): v is string => v != null))]
    if (!values.length) return "—"
    return values.map((v) => formatEur(v)).join(" → ")
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
    setAdvanceSaved(false)
  }

  function isOccupiedMonth(row: { occupied_months: number[] }, month: number) {
    return row.occupied_months.includes(month)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "WG-Wohnungen", to: "/wohnungen" },
          { label: apartment?.name ?? "…", to: `/wohnungen/${apartmentId}` },
          { label: `Abrechnung ${billingYear}` },
        ]}
        title={`Abrechnung ${billingYear}`}
        description={`${apartment?.name ?? ""} · Abrechnungszeitraum 01.01.${billingYear} – 31.12.${billingYear} · Frist für die Zustellung: 31.12.${billingYear + 1}`}
        actions={
          billingYears && billingYears.length > 1 ? (
            <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
              {billingYears.map((by) => (
                <LinkButton
                  key={by.id}
                  variant={by.year === billingYear ? "default" : "ghost"}
                  size="sm"
                  to={`/wohnungen/${apartmentId}/abrechnung/${by.year}`}
                >
                  {by.year}
                </LinkButton>
              ))}
            </div>
          ) : null
        }
      />

      {billingYearMissing ? (
        <BillingYearsCard apartmentId={apartmentId} unitName={apartment?.name} />
      ) : (
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="rechnungen">1 · Rechnungen</TabsTrigger>
          <TabsTrigger value="vorauszahlungen">2 · Vorauszahlungen</TabsTrigger>
          <TabsTrigger value="vorschau">
            3 · Vorschau & Export
            {checkProblems > 0 ? (
              <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-800 dark:text-amber-200">
                {checkProblems}
              </span>
            ) : null}
          </TabsTrigger>
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
                      allocation_key: DEFAULT_ALLOCATION_KEY,
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
                  onValueChange={(v) =>
                    v &&
                    setInvoiceForm({
                      ...invoiceForm,
                      allocation_key: v,
                      target_lease_ids:
                        v === "direktzuordnung" ? invoiceForm.target_lease_ids : [],
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALLOCATION_KEYS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {invoiceForm.allocation_key === "direktzuordnung" ? (
                <div className="space-y-2 md:col-span-3">
                  <Label>Mietparteien für Direktzuordnung</Label>
                  <p className="text-sm text-muted-foreground">
                    Die Rechnung wird gleichmäßig auf die ausgewählten Mietparteien verteilt und erscheint nur bei diesen in der Abrechnung.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(leases ?? []).map((lease) => {
                      const checked = invoiceForm.target_lease_ids.includes(lease.id)
                      return (
                        <label
                          key={lease.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? invoiceForm.target_lease_ids.filter((id) => id !== lease.id)
                                : [...invoiceForm.target_lease_ids, lease.id]
                              setInvoiceForm({ ...invoiceForm, target_lease_ids: next })
                            }}
                          />
                          <span>
                            {lease.tenant_name} ({lease.room_name})
                          </span>
                        </label>
                      )
                    })}
                    {!leases?.length ? (
                      <p className="text-sm text-muted-foreground">Keine Mietparteien vorhanden.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
              {(createInvoice.isError || updateInvoice.isError) && (
                <Callout variant="error" className="md:col-span-3">
                  {errorMessage(createInvoice.error ?? updateInvoice.error, "Rechnung konnte nicht gespeichert werden.")}
                </Callout>
              )}
              <div className="flex flex-wrap gap-2 md:col-span-3">
                {editingInvoiceId ? (
                  <>
                    <Button
                      onClick={() => updateInvoice.mutate()}
                      disabled={!invoiceForm.amount || direktzuordnungIncomplete || updateInvoice.isPending}
                    >
                      Speichern
                    </Button>
                    <Button variant="outline" onClick={cancelEditInvoice} disabled={updateInvoice.isPending}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => createInvoice.mutate()}
                    disabled={!invoiceForm.amount || direktzuordnungIncomplete || createInvoice.isPending}
                  >
                    Hinzufügen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {invoices && invoices.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Noch keine Rechnungen erfasst"
              description="Erfassen Sie oben alle Kosten des Jahres (z. B. Gas, Strom, Grundsteuer). Rechnungszeiträume, die vom Kalenderjahr abweichen, werden automatisch anteilig berechnet."
            />
          ) : (
          <Card>
            <CardContent className="overflow-x-auto pt-6">
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
                      <TableCell className="text-sm text-muted-foreground">{formatDate(inv.period_start)} – {formatDate(inv.period_end)}</TableCell>
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
                  {invoices && invoices.length > 1 ? (
                    <TableRow className="font-medium">
                      <TableCell colSpan={3}>Summe</TableCell>
                      <TableCell>{formatEur(invoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0))}</TableCell>
                      <TableCell>
                        {formatEur(invoices.reduce((sum, inv) => sum + parseFloat(inv.prorated_amount ?? "0"), 0))}
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="vorauszahlungen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Vorauszahlungen pro Mietpartei</CardTitle>
              <CardDescription>
                Grau = Soll-Vorauszahlung der Mietpartei (auf der WG-Seite unter „Vorauszahlung“
                hinterlegt). Nur abweichende Zahlungen eintragen; ein geleertes Feld gilt wieder als Soll.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-48"
                  type="number"
                  step="0.01"
                  placeholder="Monatsbetrag (€)"
                  value={uniformAmount}
                  onChange={(e) => setUniformAmount(e.target.value)}
                />
                <Button variant="secondary" onClick={() => fillUniform(uniformAmount || "0")}>
                  Für alle bewohnten Monate übernehmen
                </Button>
                {advanceRows?.some((r) => r.overridden_months.length > 0) ? (
                  <Button variant="ghost" onClick={resetOverrides}>
                    Abweichungen zurücksetzen
                  </Button>
                ) : null}
                <Button
                  onClick={() => saveAdvance.mutate()}
                  disabled={saveAdvance.isPending || Object.keys(advanceDraft).length === 0}
                >
                  Speichern
                </Button>
                {Object.keys(advanceDraft).length > 0 ? (
                  <span className="text-sm text-amber-700 dark:text-amber-300">Ungespeicherte Änderungen</span>
                ) : advanceSaved ? (
                  <span className="text-sm text-muted-foreground">Gespeichert.</span>
                ) : null}
                {saveAdvance.isError ? (
                  <span className="text-sm text-destructive">{errorMessage(saveAdvance.error)}</span>
                ) : null}
              </div>
              {advanceRows && advanceRows.length === 0 ? (
                <Callout variant="warning">
                  Keine Mietpartei wohnt im Jahr {billingYear} in dieser WG. Mietparteien legen Sie
                  auf der Seite der WG-Wohnung an.
                </Callout>
              ) : null}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44 whitespace-nowrap">Mieter</TableHead>
                      <TableHead className="w-36 whitespace-nowrap">Zimmer</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">Soll/Monat</TableHead>
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
                        <TableCell className="whitespace-nowrap text-muted-foreground">{plannedLabel(row)}</TableCell>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                          <TableCell key={month} className="w-20 p-1">
                            {isOccupiedMonth(row, month) ? (
                              <Input
                                className={
                                  getAdvanceValue(row.lease_id, month) !== ""
                                    ? "w-20 bg-primary/10 font-medium"
                                    : "w-20"
                                }
                                type="number"
                                step="0.01"
                                placeholder={row.planned[String(month)] ?? "0"}
                                title={
                                  row.planned[String(month)] != null
                                    ? `Soll: ${formatEur(row.planned[String(month)]!)}`
                                    : "Keine Soll-Vorauszahlung"
                                }
                                value={getAdvanceValue(row.lease_id, month)}
                                onChange={(e) => {
                                  setAdvanceSaved(false)
                                  setAdvanceDraft({ ...advanceDraft, [`${row.lease_id}-${month}`]: e.target.value })
                                }}
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
            <Button onClick={() => refetchPreview()} disabled={previewLoading}>
              {previewLoading ? <Loader2 className="size-4 animate-spin" /> : null}
              Neu berechnen
            </Button>
            <Button variant="outline" onClick={() => chooseExportDirectory()}>
              <FolderOpen className="size-4" />
              Zielordner wählen
            </Button>
            <div className="flex items-center gap-1 rounded-full bg-muted p-1">
              <select
                aria-label="Format für ZIP-Export"
                className="h-7 rounded-full bg-transparent px-2 text-sm outline-none"
                value={zipFormat}
                onChange={(e) => setZipFormat(e.target.value as ExportFormat)}
              >
                <option value="both">DOCX + PDF</option>
                <option value="docx">nur DOCX</option>
                <option value="pdf">nur PDF</option>
              </select>
              <Button
                size="sm"
                onClick={() => exportAllZip()}
                disabled={zipExporting || exportingLeaseId !== null || !preview?.parties.length}
              >
                {zipExporting ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4" />}
                Alle als ZIP
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeSuggestion}
                onChange={(e) => setIncludeSuggestion(e.target.checked)}
              />
              Vorschlag zur künftigen Vorauszahlung aufnehmen
            </label>
          </div>
          <div className="text-sm text-muted-foreground">
            {exportDirName ? (
              <span>Speicherort: {exportDirName}</span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Ohne Zielordner öffnet sich beim Export der Speichern-Dialog. PDF-Export hängt hochgeladene Rechnungs-PDFs an.
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

          {previewError ? (
            <Callout variant="error">{errorMessage(previewError, "Vorschau konnte nicht berechnet werden.")}</Callout>
          ) : null}

          {preview ? <PlausibilityPanel checks={preview.checks} onNavigate={navigateToCheck} /> : null}

          {preview && preview.parties.length === 0 ? (
            <Callout variant="warning">
              Keine Mietpartei im Jahr {billingYear}. Ohne Mietparteien kann keine Abrechnung erstellt werden.
            </Callout>
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
                      onClick={() => exportParty(party.lease_id, party.tenant_name, party.room_name, "docx")}
                    >
                      {exportingLeaseId === party.lease_id && exportingFormat === "docx" ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Erstellt DOCX…
                        </>
                      ) : (
                        "DOCX erstellen"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={exportingLeaseId !== null}
                      onClick={() => exportParty(party.lease_id, party.tenant_name, party.room_name, "pdf")}
                    >
                      {exportingLeaseId === party.lease_id && exportingFormat === "pdf" ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Erstellt PDF…
                        </>
                      ) : (
                        "PDF erstellen"
                      )}
                    </Button>
                    <Badge variant={party.balance_type === "nachzahlung" ? "destructive" : party.balance_type === "guthaben" ? "default" : "secondary"}>
                      {party.balance_type === "nachzahlung" ? "Nachzahlung" : party.balance_type === "guthaben" ? "Guthaben" : "Ausgeglichen"} {formatEur(Math.abs(parseFloat(party.balance)))}
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  Personenmonate: {parseFloat(party.head_months).toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                  {party.is_current_tenant ? "" : " · ausgezogen (kein Vorschlag zur Vorauszahlung)"}
                </CardDescription>
                {party.is_current_tenant && party.suggested_advance_payment ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Vorschlag künftige Vorauszahlung: </span>
                    <span className="font-medium">{formatEur(party.suggested_advance_payment)}/Monat</span>
                    <span className="text-muted-foreground">
                      {party.current_advance_payment != null
                        ? ` (bisher ${formatEur(party.current_advance_payment)})`
                        : " (bisher kein Soll hinterlegt)"}
                    </span>
                  </p>
                ) : null}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kostenart</TableHead>
                      <TableHead>Quote</TableHead>
                      <TableHead>Anteil (Basis)</TableHead>
                      <TableHead className="text-right">Gesamt (WG)</TableHead>
                      <TableHead className="text-right">Ihr Anteil</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {party.cost_lines.map((line) => (
                      <TableRow key={line.invoice_id}>
                        <TableCell>{line.label}</TableCell>
                        <TableCell>{ALLOCATION_SHORT[line.allocation_key] ?? line.allocation_key}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{formatShareBasis(line)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatEur(line.total_prorated)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatEur(line.party_share)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={4} className="font-medium">Summe Ihrer Betriebskosten</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatEur(party.total_costs)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={4}>Abzüglich Ihrer Vorauszahlungen</TableCell>
                      <TableCell className="text-right tabular-nums">− {formatEur(party.total_advance_payments)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={4} className="font-semibold">
                        {party.balance_type === "nachzahlung" ? "Nachzahlung" : party.balance_type === "guthaben" ? "Guthaben" : "Ausgeglichen"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatEur(Math.abs(parseFloat(party.balance)))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          {preview && (
            <p className="text-sm text-muted-foreground">
              Personenmonate gesamt: {parseFloat(preview.total_head_months).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ·
              Leerstand Vermieter: {parseFloat(preview.landlord_vacancy_head_months).toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              {preview.unit_area_sqm && preview.total_property_area_sqm ? (
                <> · Wohnfläche: {parseFloat(preview.unit_area_sqm).toFixed(2)} / {parseFloat(preview.total_property_area_sqm).toFixed(2)} m²</>
              ) : null}
            </p>
          )}
        </TabsContent>
      </Tabs>
      )}
    </div>
  )
}
