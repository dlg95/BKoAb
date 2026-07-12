# BKoAb — Roadmap

Stand: Juli 2026 · Aktueller Fokus: WG-Vermietung mit **Personenmonaten** als einziger Verteilerquote.

---

## Ist-Zustand (MVP)

- Eine **Wohnung** (= Abrechnungsobjekt) mit Zimmern und Mietparteien
- Kosten je **Rechnung** mit Kostenart, Betrag, Zeitraum; anteilige Berechnung auf Kalenderjahr
- Verteilung ausschließlich über **Personenmonate** (Personen × Bewohnungsanteil, taggenau)
- Leerstand = fiktive Personenmonate beim Vermieter
- Vorauszahlungen, Vorschau, DOCX-Export pro Mieter

---

## Sprint 1 — Rechnungen als PDF hinterlegen

**Ziel:** Belege zur Abrechnung archivieren und bei Bedarf einsehen/exportieren.

| Aufgabe | Details |
|--------|---------|
| PDF-Upload pro Rechnung | Datei an `Invoice` anhängen (lokal: `data/invoices/{id}.pdf`) |
| UI | Upload beim Anlegen/Bearbeiten, Download/Anzeige in der Rechnungsliste |
| API | `POST/GET/DELETE /invoices/{id}/document` |
| Validierung | Nur PDF, Größenlimit, optional Virus-Scan später |
| Abrechnungsnachweis | Optional: Verweis im DOCX („Beleg liegt der Abrechnung bei“) |

**Nicht in diesem Sprint:** OCR, automatische Betragserkennung, Kamera.

---

## Sprint 2+ — Mehrere Verteilerquoten & MFH-Tauglichkeit

**Ziel:** Dieselbe Plattform für **WG-Zimmer** (Personenmonate) und **Wohnungen im MFH** (Flächenanteil) nutzbar machen.

### Grundprinzip

Jede **Rechnung** erhält eine Pflichtauswahl **Verteilerquote**:

| Schlüssel | Formel (vereinfacht) | Typische Kosten |
|-----------|----------------------|-----------------|
| `personenmonate` | Anteil = Kosten × (eigene PM ÷ PM gesamt) | Heizung/Warmwasser WG, Reinigung gemeinschaftlich, Müll nach Köpfen |
| `flaeche_qm` | Anteil = Kosten × (eigene m² ÷ m² gesamt der **übergeordneten Einheit**) | Grundsteuer, Gebäudeversicherung, Aufzug, Dach, Fassade, Allgemeinstrom Haus |

Mischabrechnungen sind normal: Heizkosten nach m², Müll nach Personenmonaten — deshalb **pro Rechnung**, nicht global pro Objekt.

### Hierarchie der Einheiten (neu)

Heute: `Apartment` → `Room` → `Lease`.

Zielmodell (schrittweise einführen):

```
Property (Gebäude / MFH / WEG-Objekt)
  ├── Gesamtfläche m² (Pflicht für Flächenverteilung)
  ├── optionale Gemeinschaftsflächen (Treppenhaus, Technik, …)
  └── Unit (Subeinheit: Wohnung, WG, Gewerbe)
        ├── Nutzfläche m² (Pflicht wenn Flächenquote genutzt wird)
        ├── Abrechnungsebene? (ja/nein — hier läuft die NK-Abrechnung)
        └── Room (nur bei WG) + Lease / Mietpartei
```

**Anlegemodi (UI):**

1. **WG** (wie heute): Property = eine Wohnung, Unit = dieselbe Ebene, Zimmer + Personenmonate
2. **MFH-Wohnung**: Property = gesamtes Haus, Unit = einzelne Wohnung, Abrechnung auf Unit-Ebene nach m²
3. **MFH + WG** (später): Property = Haus, Unit = WG-Wohnung, darunter Zimmer + Personenmonate für innere Umlage

### Zusätzliche Stammdaten

| Entität | Neues Feld / Konzept | Zweck |
|---------|----------------------|--------|
| `Property` (neu) | `name`, Adresse, `total_area_sqm`, `property_type` (mfh / weg / einfamilien) | Oberste Ebene für Flächensumme |
| `Unit` (ersetzt/erweitert `Apartment`) | `parent_property_id`, `living_area_sqm`, `is_billing_unit` | Anteil am Haus |
| `Room` | optional `area_sqm` | Innere WG-Umlage nach Fläche (selten) |
| `Invoice` | **`allocation_key`**: `personenmonate` \| `flaeche_qm` | Verteilerquote je Rechnung |
| `Invoice` | optional `allocation_scope` (property / unit) | Bei MFH: Haus-Rechnung vs. Wohnungs-Rechnung |
| `BillingYear` | Bezug auf `Unit` (wie heute `Apartment`) | Unverändert konzeptionell |

### Berechnungslogik (Fläche)

- **Nenner:** Summe `living_area_sqm` aller `is_billing_unit=true` Untereinheiten der Property (im Abrechnungsjahr bewohnt oder leer — Leerstand-Regel definieren: Fläche zählt, fiktiver „Mieter“ = Vermieter)
- **Zähler:** `living_area_sqm` der abgerechneten Unit (bei WG-in-MFH: Unit-Fläche für Hauskosten, Zimmer/PM für innere Kosten)
- **Zeitanteil:** wie heute — Rechnungsbetrag × (Überlappung Rechnungszeitraum / Kalenderjahr)
- **DOCX:** Spalten analog PM — „Ihre m²“, „m² gesamt“

### Weitere Kostenarten (Rechnungen)

Aktuell: WEG, Gas, Strom, Handwerker, Grundsteuer, Sonstiges.

Für MFH/WEG sinnvolle Ergänzungen:

| Kostenart | Typische Verteilerquote |
|-----------|-------------------------|
| Hausmeister / Reinigung | m² oder Personenmonate |
| Aufzug / Lift | m² |
| Gebäudeversicherung | m² |
| Schornsteinfeger | m² oder Wohneinheiten |
| Wasser / Abwasser (Grundgebühr) | m² |
| Wasser / Abwasser (Verbrauch) | Verbrauch / Zähler (später, eigener Schlüssel) |
| Müll / Straßenreinigung | m² oder Personenmonate |
| Kabel / Gemeinschaftsantenne | Wohneinheiten oder m² |
| Heizkosten (Gebäude) | m² oder Verbrauch |
| WEG-Hausgeld / Instandhaltungsrücklage | nur WEG-Sonderlogik (später) |

**Umsetzung Sprint 2:** Enum erweitern + bei Anlage Default-Verteilerquote je Kostenart (überschreibbar).

### MFH-Workflow (Beispiel)

1. Property „Musterstraße 1“ anlegen, **Gesamtfläche 480 m²**
2. Units: Whg 1 (85 m²), Whg 2 (72 m²), WG Whg 3 (95 m²), …
3. Haus-Rechnungen (Grundsteuer, Versicherung) auf Property-Ebene erfassen, Verteilerquote **Fläche**
4. Pro Unit Abrechnungsjahr → Anteil = Gesamtkosten × (85 ÷ 480) usw.
5. WG Whg 3: interne zweite Abrechnungsebene mit Personenmonaten (bestehende Logik)

### Offene Designfragen (vor Implementierung klären)

- [ ] Leerstand bei Flächenquote: Fläche des leeren Units dem Vermieter zuordnen?
- [ ] Gemeinschaftsflächen: in Gesamt-m² einrechnen oder separater Verteiler?
- [ ] WEG: Anteil am Gesamthaus vs. reine Wohnungs-NK — separates Modul?
- [ ] Migration: bestehende `Apartment` → `Unit` ohne Property (Einzel-WG) als Default-Property

### Technische Schritte (grob)

1. `allocation_key` an `Invoice` + UI-Dropdown
2. `allocation.py`: `compute_area_shares()` parallel zu Personenmonaten
3. `settlement.py`: pro Rechnungszeile passenden Schlüssel anwenden
4. Property/Unit-Modell + m²-Felder
5. DOCX/UI: Verteilerquote je Zeile anzeigen
6. Tests für MFH-Szenario (2 Units, 1 Haus-Rechnung)

---

## Später — Dokumente & KI

### Belegimport (Foto / PDF)

- WEG-Jahresabrechnungen, Hausmeisterrechnungen, Fotos von Papierbelegen
- Upload wie Sprint 1, plus **Fotoaufnahme** (Browser `getUserMedia` / mobile Kamera)
- Keine automatische Buchung im ersten Schritt — nur Archiv + manuelle Übernahme der Beträge

### KI-Analyse Mietverträge (API, fest verdrahtet)

- Upload PDF Mietvertrag → Backend ruft **fest konfigurierte** Drittanbieter-API auf (kein API-Key-Feld in der UI)
- Extraktion: Mieter, Einzug/Auszug, Zimmer, Personenzahl, Kaltmiete, NK-Vorauszahlung
- Vorschlag zum Übernehmen in `Lease` (manuell bestätigen)
- Hosting: API-Key nur serverseitig / Umgebungsvariable — für Self-Hosting des Nutzers optional deaktivierbar

### WEG-Abrechnungen

- Eigene Kostenblöcke (Hausgeld, Rücklage, umlagefähig / nicht umlagefähig)
- Bezug zu WEG-Jahresabrechnung als PDF-Quelle
- Verteilerquote oft m² oder MEA (Miteigentumsanteile) — **MEA** als weiterer Schlüssel auf Roadmap v3

---

## Später — Mobile & UX

- Responsive Layout / PWA für Handy
- Kamera-Integration für Belege
- Vereinfachte Vorauszahlungs-Matrix auf kleinen Screens
- Offline-fähig: nicht geplant (lokales Tool bleibt Desktop-first)

---

## Prioritäten (Kurz)

| Phase | Inhalt |
|-------|--------|
| **Jetzt** | WG, Personenmonate, DOCX |
| **Sprint 1** | PDF-Belege an Rechnungen |
| **Sprint 2** | Verteilerquote je Rechnung + m² + Property/Unit-Modell |
| **Sprint 3** | Erweiterte Kostenarten, MFH-Abrechnung End-to-End |
| **Später** | Foto/Kamera, KI-Mietvertrag (API fest), WEG/MEA, Mobile |
