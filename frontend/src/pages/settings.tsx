import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { saveExportBlob } from "@/lib/download"

export function SettingsPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: landlord } = useQuery({ queryKey: ["landlord"], queryFn: api.landlord })
  const [form, setForm] = useState({
    name: "",
    street: "",
    city: "",
    phone: "",
    email: "",
    payment_text_template: "",
  })
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importError, setImportError] = useState(false)

  useEffect(() => {
    if (landlord)
      setForm({
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
      setExportMessage((error as Error).message || "Export fehlgeschlagen.")
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
      let message = (error as Error).message || "Import fehlgeschlagen."
      try {
        const parsed = JSON.parse(message) as { detail?: string }
        if (parsed.detail) message = parsed.detail
      } catch {
        /* plain text */
      }
      setImportMessage(message)
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Briefkopf & Zahlungstext</CardTitle>
          <CardDescription>Vermieterdaten für Abrechnungsexporte</CardDescription>
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
              <p
                className={
                  exportMutation.isError
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {exportMessage}
              </p>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Importieren</h3>
            <p className="text-sm text-muted-foreground">
              Ersetzt die aktuellen Nutzerdaten durch einen zuvor erstellten BKoAb-Datenexport.
              Vor dem Überschreiben wird automatisch eine Sicherung angelegt.
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
              <p className={importError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                {importMessage}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
