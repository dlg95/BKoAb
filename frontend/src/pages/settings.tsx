import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { saveExportBlob } from "@/lib/download"

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
  const [exportMessage, setExportMessage] = useState<string | null>(null)

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
          <CardTitle>Daten exportieren</CardTitle>
          <CardDescription>
            Alle Nutzerdaten als ZIP — für Sicherung oder Verwendung auf einem anderen Gerät.
            Enthalten: Datenbank (Wohnungen, ggf. Gebäude, Mietparteien, Abrechnungen),
            Rechnungs-PDFs, Briefkopf-Dateien und erzeugte Exporte. Kein Programmcode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => {
              setExportMessage(null)
              exportMutation.mutate()
            }}
            disabled={exportMutation.isPending}
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
          <p className="text-xs text-muted-foreground">
            Wiederherstellung: App beenden, Inhalt von <code>data/</code> aus dem ZIP in das
            BKoAb-Datenverzeichnis kopieren (macOS-App:{" "}
            <code>~/Library/Application Support/BKoAb</code>), danach App starten. Details stehen in{" "}
            <code>LIESMICH.txt</code> im ZIP.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
