import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Upload } from "lucide-react"
import { useRef, useState } from "react"

import { Callout } from "@/components/callout"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage, type LandlordProfile } from "@/lib/api"
import { saveExportBlob } from "@/lib/download"

function landlordForm(landlord: LandlordProfile | null | undefined) {
  return {
    name: landlord?.name ?? "",
    street: landlord?.street ?? "",
    city: landlord?.city ?? "",
    phone: landlord?.phone ?? "",
    email: landlord?.email ?? "",
    payment_text_template: landlord?.payment_text_template ?? "",
  }
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: landlord, isLoading: landlordLoading } = useQuery({ queryKey: ["landlord"], queryFn: api.landlord })
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importError, setImportError] = useState(false)


  const exportMutation = useMutation({
    mutationFn: async () => {
      const { blob, filename } = await api.exportAllUserData()
      await saveExportBlob(blob, filename, null, "application/zip", "BKoAb Datenexport", ".zip")
      return filename
    },
    onSuccess: (filename) => {
      setExportMessage(`Export gespeichert: ${filename}`)
    },
    onError: (error) => {
      setExportMessage(errorMessage(error, "Export fehlgeschlagen."))
    },
  })

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importAllUserData(file),
    onSuccess: (result) => {
      setImportError(false)
      const backup = result.backup_path
        ? ` Vorherige Daten gesichert unter: ${result.backup_path}.`
        : ""
      setImportMessage(
        `Import erfolgreich (${result.imported_files} Dateien).${backup} Seite wird aktualisiert…`,
      )
      void queryClient.invalidateQueries().then(() => {
        window.location.reload()
      })
    },
    onError: (error) => {
      setImportError(true)
      setImportMessage(errorMessage(error, "Import fehlgeschlagen."))
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Einstellungen"
        description="Briefkopf für alle Abrechnungen sowie Sicherung und Übertragung Ihrer Daten."
      />

      {landlordLoading ? (
        <p className="text-muted-foreground">Laden…</p>
      ) : (
        <LandlordCard key={landlord?.id ?? "new"} landlord={landlord} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daten exportieren & importieren</CardTitle>
          <CardDescription>
            Sicherung oder Übertragung auf ein anderes Gerät. Enthalten: Datenbank (Wohnungen,
            Mietparteien, Abrechnungen), Rechnungs-PDFs, Briefköpfe und Exporte — kein Programmcode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Exportieren</h3>
            <Button
              onClick={() => {
                setExportMessage(null)
                exportMutation.mutate()
              }}
              disabled={exportMutation.isPending || importMutation.isPending}
            >
              <Download className="mr-1 size-4" />
              {exportMutation.isPending
                ? "Export wird erstellt…"
                : "Daten exportieren (u. a. für anderes Gerät)"}
            </Button>
            {exportMessage && (
              <Callout variant={exportMutation.isError ? "error" : "success"}>{exportMessage}</Callout>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Importieren</h3>
            <p className="text-sm text-muted-foreground">
              Ersetzt die aktuellen Nutzerdaten durch einen zuvor erstellten BKoAb-Datenexport.
              Vor dem Überschreiben wird automatisch eine Sicherung angelegt. Exporte älterer
              BKoAb-Versionen werden unterstützt und beim Import automatisch aktualisiert.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (!file) return
                const ok = window.confirm(
                  "Aktuelle Daten werden durch den Import ersetzt. Fortfahren?\n\n" +
                    "Es wird vorher automatisch eine Sicherung angelegt.",
                )
                if (!ok) return
                setImportMessage(null)
                setImportError(false)
                importMutation.mutate(file)
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending || exportMutation.isPending}
            >
              <Upload className="mr-1 size-4" />
              {importMutation.isPending ? "Import läuft…" : "Daten importieren…"}
            </Button>
            {importMessage && (
              <Callout variant={importError ? "error" : "success"}>{importMessage}</Callout>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LandlordCard({ landlord }: { landlord: LandlordProfile | null | undefined }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => landlordForm(landlord))
  const [saved, setSaved] = useState(false)

  const saveMutation = useMutation({
    mutationFn: () => api.updateLandlord(form),
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ["landlord"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Briefkopf & Zahlungstext</CardTitle>
        <CardDescription>Erscheint als Absender und Zahlungshinweis auf jeder Abrechnung (DOCX/PDF).</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            saveMutation.mutate()
          }}
        >
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
              <Label htmlFor={`landlord-${key}`}>{label}</Label>
              <Input
                id={`landlord-${key}`}
                value={form[key]}
                onChange={(e) => {
                  setSaved(false)
                  setForm({ ...form, [key]: e.target.value })
                }}
              />
            </div>
          ))}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="landlord-payment">Zahlungstext-Vorlage</Label>
            <Textarea
              id="landlord-payment"
              rows={4}
              value={form.payment_text_template}
              onChange={(e) => {
                setSaved(false)
                setForm({ ...form, payment_text_template: e.target.value })
              }}
              placeholder="Bitte überweisen Sie den offenen Betrag auf folgendes Konto…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={saveMutation.isPending}>
              Speichern
            </Button>
            {saved && <span className="text-sm text-muted-foreground">Gespeichert.</span>}
            {saveMutation.isError && (
              <span className="text-sm text-destructive">{errorMessage(saveMutation.error)}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
