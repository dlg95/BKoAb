# BKoAb — Roadmap

Stand: Oktober 2026 · Was bereits umgesetzt ist, steht im [CHANGELOG](CHANGELOG.md).

**Produktfokus:** WG-Wohnungen mit Abrechnung pro Mietpartei (Standard-Verteilerquote:
Personenmonate). Die Gebäude-/MFH-Oberfläche ist archiviert (`frontend/archive/mfh/`) und kommt
erst zurück, wenn der WG-Kern rund ist.

---

## Leitplanken

Diese Regeln gelten für jede Phase und gehen neuen Features vor:

1. **Kompatibilität zuerst.** Jedes bisher erzeugte Datenbackup (`bkoab-data-export`) muss
   importierbar bleiben. Schemaänderungen nur additiv über `src/bkoab/migrations.py`, abgesichert
   durch den Alt-Backup-Test (`tests/fixtures/legacy_*`). Formatänderungen erhöhen
   `format_version` und behalten einen Lesepfad für ältere Versionen.
2. **Ergebnisse nachvollziehbar.** Jede Zahl in der Abrechnung muss sich aus Vorschau bzw. DOCX
   herleiten lassen (Basis, Nenner, Zeitraum).
3. **Lokal & privat.** Kein Tracking, keine Cloud-Pflicht; Hosting ist optional.
4. **Jede Änderung im CHANGELOG** unter `[Unreleased]`.

---

## Überblick

| Horizont | Thema | Ergebnis für Nutzer:innen |
|----------|-------|---------------------------|
| ✅ Erledigt | Lokales MVP, WG-Fokus, Mietparteien auf der WG-Seite | Abrechnung je Mietpartei als DOCX/PDF, Backup/Import |
| **Jetzt** | A · Abrechnung absichern | Fehler vor dem Versand erkennen, faire Verteilung bei Leerstand |
| **Als Nächstes** | B · Komfort im Jahresablauf | Weniger Tipparbeit von Jahr zu Jahr |
| | C · Verbrauch & Heizkosten | Zähler, Direktzuordnung nach Verbrauch, HeizkostenV inkl. CO₂ |
| **Später** | D · Belege & Assistenz | Foto/PDF-Belege, KI-Vorschläge (immer manuell bestätigt) |
| | E · Gebäude/MFH & WEG | Archivierte MFH-Oberfläche reaktivieren, MEA, WEG-Abrechnung |
| | F · Hosting (optional) | Konten, Mandantentrennung, DSGVO |
| | G · Finanzierung (optional) | Werbung nur nach Einwilligung |

```
Erledigt ─► A Abrechnung absichern ─► B Komfort ─┬─► D Belege & Assistenz
                                                 └─► C Verbrauch/HeizkostenV ─► E MFH/WEG ─► F Hosting ─► G Finanzierung
```

---

## Jetzt — A · Abrechnung absichern

**Ziel:** Bevor eine Abrechnung an Mieter:innen geht, zeigt das Tool alle Unstimmigkeiten an.

| # | Aufgabe | Akzeptanzkriterium |
|---|---------|--------------------|
| A1 | **Plausibilitäts-Check** vor dem Export (Rechnungszeitraum außerhalb des Jahres, Monate ohne Vorauszahlung, Zimmer ohne Fläche bei m²-Rechnung, Summe der Anteile ≠ Rechnungsbetrag) | Vorschau listet Warnungen mit Link zur betroffenen Stelle |
| A2 | **Wohneinheiten fair bei Leerstand/Teiljahr** — heute teilen sich nur die anwesenden Mietparteien den vollen Betrag | Entscheidung zur offenen Frage unten; Leerstandsanteil wie bei PM beim Vermieter; Tests |
| A3 | **Abrechnung abschließen** (Status `finalized` nutzen) — gesperrt gegen versehentliche Änderungen, Wiedereröffnen möglich | Abgeschlossene Jahre sind schreibgeschützt und im Dashboard markiert |
| A4 | **Abrechnungsfrist** (12 Monate nach Jahresende, § 556 Abs. 3 BGB) auf dem Dashboard anzeigen | Hinweis ab 3 Monate vor Fristende |
| A5 | **Alle Abrechnungen eines Jahres** auf einmal exportieren (ZIP mit DOCX/PDF je Mietpartei) | Ein Klick, Dateinamen wie Einzelexport |

---

## Als Nächstes

### B · Komfort im Jahresablauf

| # | Aufgabe | Akzeptanzkriterium |
|---|---------|--------------------|
| B1 | **Vorjahr übernehmen**: Rechnungsvorlagen (Kostenart, Quote, Bezeichnung, Zeitraum +1 Jahr, ohne Betrag) | Neues Jahr startet mit allen bekannten Kostenpositionen |
| B2 | **Vorauszahlungen als Soll je Mietpartei** (Betrag ab Datum), Matrix nur noch für Abweichungen | Monatsmatrix wird automatisch vorbefüllt |
| B3 | **Neue Vorauszahlung vorschlagen** (Ergebnis ÷ bewohnte Monate, gerundet) im DOCX | Optionaler Absatz im Export |
| B4 | **Zeitstrahl der Belegung** je Zimmer (Leerstand sichtbar) | Grafik auf der WG-Seite |

### C · Verbrauch & Heizkosten

| # | Aufgabe | Akzeptanzkriterium |
|---|---------|--------------------|
| C1 | **Zählerstände** je Zimmer bzw. Mietpartei (Ablesedatum, Stand) | Erfassung + Historie |
| C2 | **Direktzuordnung nach Verbrauch** (eigener Verbrauch ÷ Summe) zusätzlich zur heutigen Auswahl von Mietparteien | Rechnung kann Verbrauchswerte als Basis nutzen |
| C3 | **HeizkostenV-Aufteilung**: Grundkosten 30–50 % (m² oder Einheiten), Verbrauchskosten 50–70 % (Zähler) | Assistent erzeugt Teilposten aus einer Rechnung |
| C4 | **CO₂-Kostenaufteilung** (CO2KostAufG) nach Emissionsstufe | Vermieter-/Mieteranteil im Export ausgewiesen |

Weitere Verteilerquoten bei Bedarf: `manuell`/Festbetrag, `anschluesse` (TV/Daten), `nutzflaeche`.

---

## Später

### D · Belege & Assistenz

- Foto-Aufnahme von Belegen (Kamera/PWA), PDF-Belege sind bereits möglich.
- KI-Vorschläge aus Mietvertrag bzw. Rechnung (Mieter, Zeitraum, Betrag) — API-Schlüssel nur
  serverseitig, abschaltbar, jede Übernahme manuell bestätigt.

### E · Gebäude/MFH & WEG

- Archivierte MFH-Seiten (`frontend/archive/mfh/README.md`) wieder einbinden: Gebäude →
  Wohnungen (m²) → WG-Zimmer; Hausrechnungen nach Fläche.
- Miteigentumsanteile (MEA) als Pflicht bei WEG-Objekten; WEG-Jahresabrechnung als Quelle
  (Hausgeld, Rücklage, umlagefähig / nicht umlagefähig).

### F · Hosting (optional, Multi-Tenant)

Nur mit stabiler Fachlogik. Stichpunkte aus dem bisherigen Konzept:

- Login via Google / Apple (OpenID Connect), lokaler Modus ohne Konto bleibt.
- Jeder Datensatz mit `user_id`; strikte Mandantentrennung (ggf. PostgreSQL Row-Level Security).
- PostgreSQL + S3-kompatibler Speicher in der EU, Verschlüsselung at rest, Audit-Log.
- DSGVO: Datenschutzerklärung, Cookie-Consent, Export („Meine Daten“ = vorhandener ZIP-Export),
  Konto löschen (Art. 17), AV-Verträge.
- Migration: vorhandene ZIP-Backups über den bestehenden Import einspielen.
- Heute: Cloudflare-Container-Deployment existiert, Speicher ist aber **flüchtig** (siehe README).

### G · Finanzierung (optional)

- Werbeflächen nur außerhalb von Formularen/Abrechnung (Dashboard, Listen), nie in Exporten.
- Google Consent Mode v2; Analytics nur nach Opt-in (bevorzugt Plausible self-hosted).

---

## Ideen-Backlog (bewertet, noch nicht eingeplant)

| Idee | Nutzen | Aufwand |
|------|--------|---------|
| Automatische Sicherung beim Beenden / wöchentlich (lokaler Ordner) | hoch | klein |
| Mieterportal-Link (nur Lesen) statt Datei-Versand | mittel | groß |
| Dunkelmodus-Schalter in der Kopfzeile | klein | klein |
| Englische Oberfläche | klein | mittel |
| Import aus Tabellen (CSV) für Rechnungen | mittel | mittel |

---

## Offene Fragen

| Thema | Frage | Betrifft |
|-------|-------|----------|
| Wohneinheiten | Nenner = alle Zimmer (Leerstand beim Vermieter, zeitanteilig) oder nur bewohnte? | A2 |
| Direktzuordnung | Ablesung zum 31.12. oder periodengerecht zum Rechnungszeitraum? | C2 |
| HeizkostenV | Eine Rechnung mit Auto-Split oder drei Teilrechnungen? | C3 |
| CO₂ | Emissionsfaktor manuell oder aus Versorgerabrechnung? | C4 |
| Abschluss | Darf ein abgeschlossenes Jahr nachträglich korrigiert werden (Versionierung)? | A3 |
