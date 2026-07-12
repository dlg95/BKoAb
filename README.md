# BKoAb — Betriebskostenabrechnung

## Kurzbeschreibung

BKoAb hilft Vermietern und WG-Betreibern dabei, **Betriebskostenabrechnungen** zu erstellen — von der Erfassung der Mietparteien bis zum fertigen **Word-Dokument (DOCX)** für jeden Mieter.

Das Tool eignet sich besonders für:

- **WG-Zimmervermietung:** Kosten werden nach **Personenmonaten** auf die Zimmer verteilt.
- **Mehrfamilienhäuser (MFH):** Hauskosten können nach **Wohnfläche (m²)** auf die Wohnungen verteilt werden; WG-Wohnungen im Haus nutzen intern weiterhin Personenmonaten.

Die Abrechnung erfolgt immer **pro Kalenderjahr** (1. Januar bis 31. Dezember). Rechnungen mit kürzerem Zeitraum werden anteilig auf das Jahr hochgerechnet.

> **Hinweis:** BKoAb unterstützt bei der Erstellung von Abrechnungen, ersetzt aber keine Rechts- oder Steuerberatung. Prüfen Sie die Ergebnisse vor dem Versand an Ihre Mieter.

---

## Voraussetzungen und Start

### Erstmalige Installation (einmalig)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cd frontend && pnpm install && cd ..
```

### Anwendung starten

```bash
./run.sh
```

Danach im Browser öffnen:

- **Oberfläche:** http://127.0.0.1:5173
- **API (technisch):** http://127.0.0.1:8000

Die Navigation oben führt Sie zu **Dashboard**, **Wohnungen**, **Gebäude** und **Briefkopf**.

---

## Wichtige Begriffe

| Begriff | Bedeutung |
|--------|-----------|
| **Personenmonate** | Personen × Bewohnungsmonate (taggenau). Beispiel: 2 Personen für 6 Monate = 12 Personenmonate. |
| **Leerstand** | Ein Zimmer ohne Mieter zählt als fiktive Personenmonate beim Vermieter — die Kosten bleiben bei Ihnen. |
| **Verteilerquote** | Regel, nach der eine Rechnung aufgeteilt wird: **Personenmonate** (nach Köpfen) oder **Fläche (m²)** (nach Wohnfläche). |
| **Anteilige Jahresberechnung** | Eine Rechnung vom 1.4.–30.9. wird nur für diesen Zeitraum auf das Abrechnungsjahr umgerechnet. |
| **Übereinheit / Untereinheit** | WG: Wohnung → Zimmer. MFH: Gebäude → Wohnung. |
| **Vorauszahlungen** | Monatliche NK-Vorauszahlungen je Mieter — werden von den tatsächlichen Kosten abgezogen. |

---

## Schritt-für-Schritt-Anleitung (WG-Zimmervermietung)

Dies ist der **Haupt-Workflow** und für die meisten Nutzer der richtige Einstieg.

### 1. Briefkopf anlegen

**Navigation:** Menü **Briefkopf** → `/einstellungen`

Tragen Sie Ihre **Vermieterdaten** ein:

- Name, Straße, PLZ/Ort
- Telefon und E-Mail
- **Zahlungstext-Vorlage** (z. B. Bankverbindung und Hinweis zum Verwendungszweck)

Diese Angaben erscheinen später im DOCX-Briefkopf jeder Abrechnung. Klicken Sie auf **Speichern**.

---

### 2. Wohnung und Zimmer anlegen

**Navigation:** Menü **Wohnungen** → `/wohnungen`

1. Legen Sie eine **neue Wohnung** an (Name, Straße, PLZ/Ort).
2. Öffnen Sie die Wohnung über **Bearbeiten** → `/wohnungen/{id}`.
3. Unter **Zimmer** legen Sie alle vermieteten Räume an (z. B. „Zimmer 1“, „Zimmer 2“).
4. Optional: Tragen Sie unter **Stammdaten & Bankverbindung** IBAN, Kontoinhaber und Verwendungszweck-Hinweis ein — falls die Zahlungsdaten von den globalen Vermieterdaten abweichen sollen.

**Hierarchie WG:**

```
Wohnung (= Abrechnungsobjekt)
  └── Zimmer (= Untereinheiten)
```

Die Verteilung innerhalb der WG erfolgt über **Personenmonate** je Zimmer.

---

### 3. Mietparteien mit Bewohnerzahl und Mietzeiträumen angeben

**Navigation:** `/wohnungen/{id}/mietparteien`

Für jeden Mieter:

1. **Mietername** und optional **Kontakt** eintragen.
2. **Zimmer** zuweisen.
3. **Personen (initial)** — wie viele Personen zu Mietbeginn im Zimmer wohnen.
4. **Einzug** und optional **Auszug** als Datum.

**Personenzahl ändern:** Hat sich die Bewohnerzahl im Laufe des Mietverhältnisses geändert (z. B. Nachzug), klicken Sie bei der Mietpartei auf **Personenzahl**. Dort legen Sie **lückenlose Zeiträume** von Einzug bis Auszug fest — jeder Zeitraum mit eigener Personenzahl.

Ohne korrekte Mietzeiträume und Personenzahlen stimmt die Verteilung nicht.

---

### 4. Abrechnungsjahr anlegen und Rechnungen erfassen

**Navigation:** `/wohnungen/{id}` → Bereich **Abrechnungsjahre** → **Abrechnung anlegen**  
oder direkt `/wohnungen/{id}/abrechnung/{jahr}`

1. Legen Sie ein **Abrechnungsjahr** an (z. B. 2025).
2. Wechseln Sie zum Tab **Rechnungen**.
3. Erfassen Sie jede Kostenposition:
   - **Kostenart** (Gas, Strom, Handwerker, …)
   - **Verteilerquote** — bei WG meist **Personenmonate** (wird je Kostenart vorgeschlagen)
   - **Bezeichnung** und **Betrag (€)**
   - **Rechnungszeitraum von / bis** — nicht zwingend das ganze Jahr; der Betrag wird anteilig berechnet
   - Optional: **Notiz** und **PDF-Beleg** anhängen

In der Rechnungsliste sehen Sie den **Anteil fürs Abrechnungsjahr** — das ist der auf das Kalenderjahr umgerechnete Betrag.

---

### 5. Vorauszahlungen für das Abrechnungsjahr angeben

**Navigation:** `/wohnungen/{id}/abrechnung/{jahr}` → Tab **Vorauszahlungen**

Tragen Sie die **monatlichen NK-Vorauszahlungen** je Mietpartei ein. Es werden nur Monate bearbeitbar angezeigt, in denen der Mieter tatsächlich bewohnt hat.

**Tipp:** Mit **Gleicher Betrag für alle Monate** können Sie einen einheitlichen Monatsbetrag schnell übernehmen. Danach **Speichern** nicht vergessen.

---

### 6. Abrechnung prüfen und als DOCX erhalten

**Navigation:** `/wohnungen/{id}/abrechnung/{jahr}` → Tab **Vorschau & Export**

1. Klicken Sie auf **Vorschau berechnen**.
2. Prüfen Sie die Kostenzeilen, Personenmonate und das Ergebnis (Nachzahlung / Guthaben / ausgeglichen) je Mieter.
3. Optional: **Zielordner wählen** — sonst öffnet sich beim Speichern der übliche Dateidialog.
4. Pro Mietpartei auf **DOCX erstellen** klicken.

Jeder Mieter erhält ein eigenes Word-Dokument mit Briefkopf, Kostenaufstellung, Vorauszahlungen und Saldo.

---

## Alternativer Workflow: Mehrfamilienhaus (MFH)

> **Stand:** Die MFH-Funktionen sind **bereits nutzbar**, werden aber schrittweise ausgebaut. Details zu kommenden Erweiterungen: [ROADMAP.md](ROADMAP.md).

### Wann MFH statt reiner WG?

Nutzen Sie **Gebäude**, wenn ein Haus mehrere **eigenständige Wohnungen** hat und Hauskosten (Grundsteuer, Versicherung, Aufzug, …) nach **Fläche** verteilt werden sollen. Eine WG-Wohnung im Haus wird wie oben mit Zimmern und Personenmonaten abgerechnet.

### MFH-Hierarchie

```
Gebäude (= Übereinheit, z. B. MFH)
  └── Wohnung (= Untereinheit, mit m²)
        └── Zimmer (nur bei WG) + Mietparteien
```

### MFH-Schritte im Überblick

| Schritt | Navigation | Was tun? |
|--------|------------|----------|
| Gebäude anlegen | `/gebaeude` | Name, Typ (MFH/WEG/Einfamilien), Adresse, **Gesamtfläche (m²)** |
| Wohnungen im Haus | `/gebaeude/{id}` → Tab **Wohnungen** | Jede Wohnung mit **Nutzfläche (m²)** anlegen |
| Haus-Rechnungen | `/gebaeude/{id}` → Tab **Haus-Rechnungen** | Abrechnungsjahr anlegen, Hauskosten mit Verteilerquote **Fläche (m²)** erfassen |
| WG in einer Wohnung | `/wohnungen/{id}` | Zimmer, Mietparteien, Wohnungs-Rechnungen (z. B. Gas, Strom) mit **Personenmonate** |
| Abrechnung je Wohnung | `/wohnungen/{id}/abrechnung/{jahr}` | Vorschau und DOCX — Hauskosten (m²) und Wohnungskosten (PM) werden zusammengeführt |

**Wichtig für MFH:**

- Tragen Sie die **Wohnfläche (m²)** sowohl am Gebäude als auch an jeder Wohnung ein — sonst fehlen Flächenanteile in der Vorschau.
- Haus-Rechnungen werden auf dem Gebäude erfasst; die **DOCX-Abrechnung** erfolgt weiterhin **pro Wohnung und Mietpartei**.
- Noch **nicht** oder nur eingeschränkt: WEG-Sonderlogik (Hausgeld, Miteigentumsanteile), automatische KI-Belegerkennung, reine Gebäude-Gesamtabrechnung ohne Wohnungsbezug.

---

## Navigation im Überblick

| Seite | Pfad | Zweck |
|-------|------|-------|
| Dashboard | `/` | Übersicht aller Gebäude und Wohnungen |
| Wohnungen | `/wohnungen` | Wohnungen anlegen und verwalten |
| Wohnungsdetails | `/wohnungen/{id}` | Stammdaten, Zimmer, Abrechnungsjahre |
| Mietparteien | `/wohnungen/{id}/mietparteien` | Mieter, Einzug/Auszug, Personenzahl |
| Abrechnung | `/wohnungen/{id}/abrechnung/{jahr}` | Rechnungen, Vorauszahlungen, Export |
| Gebäude | `/gebaeude` | MFH/WEG-Gebäude anlegen |
| Gebäudedetails | `/gebaeude/{id}` | Stammdaten, Wohnungen, Haus-Rechnungen |
| Briefkopf | `/einstellungen` | Vermieterdaten und Zahlungstext |

---

## Typischer Ablauf auf einen Blick (WG)

```
Briefkopf (/einstellungen)
    ↓
Wohnung + Zimmer (/wohnungen)
    ↓
Mietparteien (/wohnungen/{id}/mietparteien)
    ↓
Abrechnungsjahr + Rechnungen (/wohnungen/{id}/abrechnung/{jahr})
    ↓
Vorauszahlungen (gleiche Seite, Tab „Vorauszahlungen“)
    ↓
Vorschau & DOCX-Export (Tab „Vorschau & Export“)
```

---

## Für Entwickler

### Tests ausführen

```bash
source .venv/bin/activate
pytest
```

### Projektstruktur (kurz)

- `src/bkoab/` — Python-Backend (API, Berechnung, DOCX-Export)
- `frontend/` — React-Oberfläche
- `data/` — lokale Daten (Rechnungs-PDFs, Exporte)

### Geplante Erweiterungen

Siehe [ROADMAP.md](ROADMAP.md) — u. a. erweiterte Kostenarten, WEG-Logik, Belegimport per Foto/KI.
