import { Fragment } from "react"
import { LinkButton } from "@/components/link-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { COPYRIGHT_HOLDER, COPYRIGHT_YEAR, LEGAL_SECTIONS } from "@/lib/legal"

const URL_RE = /(https?:\/\/[^\s]+)/g

function LinkedText({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("http") ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {part}
          </a>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        ),
      )}
    </>
  )
}

export function LegalPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Nutzungsbedingungen & Haftungsausschluss</h1>
          <p className="mt-1 text-muted-foreground">
            Copyright, Nutzungshinweise, Haftungsausschluss und Drittlizenzen für BKoAb
          </p>
        </div>
        <LinkButton variant="outline" to="/">
          Zum Dashboard
        </LinkButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kurzfassung</CardTitle>
          <CardDescription>
            Private Anwendung — keine Beratung, kein verifiziertes Produkt, Verwendung auf eigene Gefahr.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            BKoAb wird von {COPYRIGHT_HOLDER} als private Anwendung geteilt. Es ist keine Steuer-,
            Rechts- oder Finanzberatung und kein zertifiziertes oder behördlich geprüftes Tool.
          </p>
          <p>
            Berechnungen und Exporte können Fehler enthalten. Die Nutzung erfolgt auf eigene Gefahr;
            es wird keine Haftung übernommen.
          </p>
          <p>
            Für den PDF-Export wird primär dxpdf (MIT) verwendet; LibreOffice ist optionaler Fallback —
            siehe Abschnitt „Drittanbieter“ unten.
          </p>
          <p>
            © {COPYRIGHT_YEAR} {COPYRIGHT_HOLDER}
          </p>
        </CardContent>
      </Card>

      {LEGAL_SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-lg">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>
                <LinkedText text={paragraph} />
              </p>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
