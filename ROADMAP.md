# BKoAb — Roadmap

Stand: Oktober 2026 · Was umgesetzt ist, steht im [CHANGELOG](CHANGELOG.md).

**Produktfokus:** WG-Wohnungen mit Abrechnung pro Mietpartei (Standard-Verteilerquote:
Personenmonate). Die Gebäude-/MFH-Oberfläche ist archiviert (`frontend/archive/mfh/`).

Es gibt bewusst **keinen festen Plan**: Unten stehen lose Ideen ohne Reihenfolge und ohne Zusage.
Was davon umgesetzt wird, entscheidet sich nach Bedarf.

---

## Leitplanken

Diese Regeln gelten für jede Änderung:

1. **Kompatibilität zuerst.** Jedes bisher erzeugte Datenbackup (`bkoab-data-export`) muss
   importierbar bleiben. Schemaänderungen nur über `src/bkoab/migrations.py`, abgesichert durch
   die Alt-Backup-Tests (`tests/fixtures/legacy_*`, `tests/test_migrations.py`). Ändert sich das
   Schema, steigt `EXPORT_FORMAT_VERSION`; ältere Formate werden weiter gelesen.
2. **Ergebnisse nachvollziehbar.** Jede Zahl in der Abrechnung lässt sich aus Vorschau bzw. DOCX
   herleiten (Basis, Nenner, Zeitraum).
3. **Lokal & privat.** Kein Tracking, keine Cloud-Pflicht; Verteilung über signierte macOS-DMG.
4. **Jede Änderung im CHANGELOG** unter `[Unreleased]`.

---

## Zuletzt umgesetzt

- Mietparteien auf der WG-Seite (Zimmer → Mietparteien), Mietparteien bearbeiten
- Soll-Vorauszahlung je Mietpartei, Vorauszahlungen je Abrechnungsjahr
- Vorschlag zur künftigen Vorauszahlung (nur aktuelle Mieter:innen)
- Prüfung vor dem Versand, Abrechnungsfrist auf dem Dashboard
- Alle Abrechnungen eines Jahres als ZIP
- Automatische Sicherung mit Wiederherstellen

---

## Ideensammlung (lose, ohne Reihenfolge)

### Abrechnung

- **Wohneinheiten fair bei Leerstand / Teiljahr.** Heute teilen sich nur die im Jahr anwesenden
  Mietparteien den vollen Betrag. Denkbar: Nenner = alle Zimmer, zeitanteilig, Leerstandsanteil
  beim Vermieter (wie bei Personenmonaten). *Offen:* Ist das fachlich gewünscht?
- **Abrechnung abschließen.** Status „abgeschlossen“ (gibt es schon in der Datenbank) nutzen, um
  ein Jahr gegen versehentliche Änderungen zu sperren; Wiedereröffnen möglich. *Offen:* Korrektur
  nach Versand mit Versionierung?
- **Vorjahr übernehmen.** Neues Abrechnungsjahr mit allen Kostenpositionen des Vorjahres als
  Vorlage (ohne Beträge, Zeiträume +1 Jahr).
- Belegungs-Zeitstrahl je Zimmer (Leerstand auf einen Blick).

### Verbrauch & Heizkosten

- **Zählerstände** je Zimmer bzw. Mietpartei (Ablesedatum, Stand) als Grundlage für
  Direktzuordnung nach Verbrauch (eigener Verbrauch ÷ Summe).
- **HeizkostenV-Aufteilung** darauf aufbauend: Grundkosten 30–50 % (m² oder Einheiten),
  Verbrauchskosten 50–70 % (Zähler); **CO₂-Kostenaufteilung** (CO2KostAufG) nach Emissionsstufe.
  *Offen:* Ablesung zum 31.12. oder periodengerecht? Eine Rechnung mit Auto-Split oder Teilrechnungen?
- Weitere Verteilerquoten bei Bedarf: Festbetrag/manuell, Anschlüsse (TV/Daten), Nutzfläche.

### Belege & Assistenz

- Foto-Aufnahme von Belegen (Kamera/PWA); PDF-Belege gibt es bereits.
- KI-Vorschläge aus Mietvertrag bzw. Rechnung (Mieter, Zeitraum, Betrag) — Schlüssel nur
  serverseitig, abschaltbar, jede Übernahme manuell bestätigt.
- Import von Rechnungen aus Tabellen (CSV).

### Gebäude/MFH & WEG

- Archivierte MFH-Seiten (`frontend/archive/mfh/README.md`) wieder einbinden: Gebäude →
  Wohnungen (m²) → WG-Zimmer, Hausrechnungen nach Fläche.
- Miteigentumsanteile (MEA) und WEG-Jahresabrechnung (Hausgeld, Rücklage, umlagefähig / nicht
  umlagefähig).

### Distribution

- **Heute & absehbar:** lokal (`./run.sh`) bzw. **signierte/notarisierte macOS-DMG**
  (`./build_app.sh` → `dist/BKoAb.dmg`) zum Teilen.
- Cloud-/SaaS-Hosting (Accounts, Mandanten, Cloudflare usw.) ist **zurückgestellt** — kein
  aktives Deployment mehr.
- Später denkbar, falls Bedarf: Konten (Google/Apple), Mandantentrennung, EU-Hosting, DSGVO;
  Finanzierung ggf. Werbung nur außerhalb von Formularen/Exporten und nur nach Einwilligung.

### Kleinigkeiten

- Mieterportal-Link (nur Lesen) statt Datei-Versand
- Dunkelmodus-Schalter, englische Oberfläche
- Sicherungsordner in den Einstellungen wählbar (heute per Umgebungsvariable)
