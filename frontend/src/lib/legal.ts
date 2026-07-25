/**
 * Shared legal / disclaimer copy for UI and docs.
 * Keep wording aligned across layout banner, legal page, and README.
 */

export const COPYRIGHT_HOLDER = "Daniel Glauert"
export const COPYRIGHT_YEAR = "2026"

export const LEGAL_BANNER =
  "Private Anwendung von Daniel Glauert — keine Steuer-, Rechts- oder Finanzberatung, kein verifiziertes oder zertifiziertes Produkt. Nutzung auf eigene Gefahr; keine Haftung. © Daniel Glauert."

export const LEGAL_SECTIONS = [
  {
    title: "Zweck und Charakter der Anwendung",
    paragraphs: [
      "BKoAb ist eine private Anwendung von Daniel Glauert. Sie wird lediglich als persönliche Hilfestellung geteilt und ist kein öffentlich angebotenes, geprüftes oder zertifiziertes Produkt.",
      "Es handelt sich ausdrücklich nicht um ein verifiziertes Tool, keine Software mit behördlicher oder fachlicher Zulassung und kein Ersatz für professionelle Beratung.",
    ],
  },
  {
    title: "Keine Steuer-, Rechts- oder Finanzberatung",
    paragraphs: [
      "Die Anwendung ersetzt keine Steuerberatung, Rechtsberatung oder Finanzberatung. Inhalte, Berechnungen und Exporte dienen nur der technischen Unterstützung und können fehlerhaft, unvollständig oder nicht aktuell sein.",
      "Entscheidungen über Betriebskostenabrechnungen, Mietverhältnisse und steuerliche oder rechtliche Fragen treffen Sie eigenverantwortlich. Lassen Sie Ergebnisse bei Bedarf von einer geeigneten Fachperson prüfen, bevor Sie sie gegenüber Mietern oder Behörden verwenden.",
    ],
  },
  {
    title: "Haftungsausschluss",
    paragraphs: [
      "Die Nutzung erfolgt vollständig auf eigene Gefahr. Daniel Glauert übernimmt keinerlei Haftung für direkte oder indirekte Schäden, entgangenen Gewinn, Datenverlust, falsche Abrechnungsergebnisse oder sonstige Nachteile, die aus der Nutzung oder Nichtnutzung der Anwendung entstehen — soweit gesetzlich zulässig.",
      "Es wird keine Gewähr für Richtigkeit, Vollständigkeit, Verfügbarkeit, Sicherheit oder Eignung für einen bestimmten Zweck übernommen.",
    ],
  },
  {
    title: "Nutzungsbedingungen",
    paragraphs: [
      "Sie dürfen die Anwendung für eigene, nicht kommerzielle Zwecke nutzen, soweit sie freigegeben wurde. Eine Weiterlizenzierung, Weiterveräußerung, kommerzielle Vermarktung oder Darstellung als offizielles, geprüftes oder empfohlenes Produkt ist nicht gestattet, sofern nicht ausdrücklich schriftlich etwas anderes vereinbart wurde.",
      "Beim Teilen oder Hosting dieser privaten Anwendung bleibt der Charakter als unverifizierte Privatsoftware zu wahren; die hier genannten Hinweise dürfen nicht entfernt oder verfälscht werden.",
    ],
  },
  {
    title: "Urheberrecht",
    paragraphs: [
      `© ${COPYRIGHT_YEAR} ${COPYRIGHT_HOLDER}. Alle Rechte vorbehalten, soweit nicht ausdrücklich anders angegeben.`,
    ],
  },
] as const
