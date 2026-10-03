# Changelog

Alle nennenswerten Änderungen an BKoAb werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog 1.1.0](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [Semantic Versioning 2.0.0](https://semver.org/lang/de/).

**Regeln für Einträge**

- Neue Einträge immer zuerst unter **[Unreleased]**, bei einem Release in eine Versionssektion
  `## [X.Y.Z] - JJJJ-MM-TT` verschieben und die Version in `pyproject.toml`,
  `src/bkoab/main.py` und `src/bkoab/services/data_export.py` (`app_version`) anheben.
- Kategorien in dieser Reihenfolge: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Aus Nutzersicht schreiben (was ändert sich für Vermieter:innen), nicht Commit-Messages kopieren.
- Änderungen am **Datenexport-Format** oder am **Datenbankschema** immer ausdrücklich nennen
  (Kompatibilität alter Backups!).

## [Unreleased]

### Added

- Mietparteien **bearbeiten**: Name, Kontakt, Zimmer, Einzug und Auszug (inkl. Auszug
  nachtragen oder wieder entfernen). Personenzahl-Zeiträume werden dabei automatisch an Ein-
  und Auszug angepasst.
- Neue Seitenelemente: Brotkrumen-Navigation, Kennzahlen je WG (Zimmer, belegt, Personen,
  Fläche), Hinweis-/Warnboxen, leere Zustände mit Erklärung, Einstiegs-Anleitung in 5 Schritten
  auf dem Dashboard.
- WG-Wohnung löschen (unter „Stammdaten“, mit Namensbestätigung).
- Abrechnung: Summenzeile der Rechnungen, Spalte „Anteil (Basis)“ (z. B. `6 / 42` PM) und
  Saldo-Zeile in der Vorschau; Vorschau berechnet sich beim Öffnen des Tabs automatisch.
- Umgebungsvariable `BKOAB_DATA_DIR` zum Festlegen des Datenverzeichnisses.
- Dieses Changelog.

### Changed

- **Mietparteien sind jetzt Teil der WG-Seite** (Tab „Zimmer & Mietparteien“): Jede Zimmer-Karte
  zeigt ihre Mietparteien (aktuell / zieht ein / ausgezogen). „Mietpartei hinzufügen“ gibt es
  WG-weit (mit Zimmerauswahl) und je Zimmer (Zimmer vorausgewählt) — beides im selben Dialog.
  Die bisherige Adresse `/wohnungen/{id}/mietparteien` leitet weiter (`?room=` öffnet den
  Dialog für dieses Zimmer).
- WG-Seite in Tabs gegliedert: „Zimmer & Mietparteien“, „Abrechnungen“, „Stammdaten“.
- Zimmer und Personenzahl werden in Dialogen statt in Inline-Formularen bearbeitet.
- Überarbeitetes Erscheinungsbild: Kopfzeile mit aktivem Menüpunkt (fixiert beim Scrollen),
  ruhigere Hintergrundfarbe, Kartenlayouts für Dashboard und Wohnungsliste, bessere
  Darstellung auf dem Handy.
- Fehlermeldungen des Servers erscheinen als verständlicher Text statt als JSON.
- Überschneidungsfehler bei Mietparteien nennen jetzt Name und Zeitraum der bestehenden
  Mietpartei.
- Roadmap neu strukturiert (Jetzt / Als Nächstes / Später, mit Akzeptanzkriterien).

### Fixed

- **Import alter Datensicherungen**: Nach dem Import eines Backups aus einer frühen Version
  schlug die Abrechnungsvorschau bis zum Neustart der App fehl (Spalte für Direktzuordnung ging
  bei der Migration verloren). Alte Backups sind jetzt sofort nutzbar; ein Test mit einem
  echten Alt-Backup sichert das ab.
- Nach einem Datenimport nutzte der Server-Start teilweise noch die alte Datenbankverbindung.
- Wechsel des Abrechnungsjahres übernahm ungespeicherte Vorauszahlungs- und Rechnungsentwürfe
  ins andere Jahr (und hätte sie dort gespeichert).
- Auszug nachtragen ließ den letzten Personenzahl-Zeitraum offen; der Personenzahl-Editor
  lehnte danach jedes Speichern ab.
- „Zeitraum hinzufügen“ im Personenzahl-Editor erzeugte überlappende Zeiträume, die nie
  gespeichert werden konnten.
- Vorschau: Verteilerquote wurde für „Wohneinheiten“ und „Direktzuordnung“ fälschlich als
  „m²“ angezeigt; Summen standen in der falschen Spalte.
- Meldung „Diese Abrechnung existiert bereits“ wurde nie angezeigt.
- Auszug vor Einzug wurde beim Anlegen einer Mietpartei akzeptiert.
- Fehler beim Speichern von Rechnungen wurden nicht angezeigt.
- Tests schrieben in das echte `data/`-Verzeichnis und konnten lokale Rechnungs-PDFs
  überschreiben; sie laufen jetzt in einem temporären Verzeichnis.
- Lint-Fehler im Frontend behoben (`pnpm lint` läuft wieder fehlerfrei).

Datenbankschema und Datenexport-Format (`bkoab-data-export`, Version 1) sind **unverändert**;
bestehende Backups lassen sich weiterhin importieren.

## [0.1.0] - 2026-07-31

Erster Stand des lokalen MVP (rückwirkend aus der Git-Historie zusammengefasst).

### Added

- WG-Wohnungen mit Zimmern, Mietparteien und Personenzahl-Zeiträumen (Personenmonate,
  taggenau; Leerstand beim Vermieter).
- Abrechnungsjahre mit Rechnungen (anteilige Jahresberechnung), PDF-Belegen und
  Vorauszahlungen je bewohntem Monat.
- Verteilerquoten pro Rechnung: Personenmonate, Fläche (m²), Wohneinheiten, Direktzuordnung
  auf ausgewählte Mietparteien.
- Vorschau und Export je Mietpartei als DOCX und PDF (dxpdf, Rechnungs-PDFs angehängt).
- Briefkopf mit Zahlungstext.
- Vollständiger Datenexport als ZIP und Import mit automatischer Sicherung der vorherigen Daten.
- Rechtliche Hinweise in App und README, macOS-App-Build, Cloudflare-Container-Deployment.

### Changed

- Gebäude-/MFH-Oberfläche archiviert (`frontend/archive/mfh/`), Fokus auf WG-Wohnungen;
  MEA nur noch im MFH-Archiv.

[Unreleased]: https://github.com/dlg95/BKoAb/compare/05faa84...HEAD
[0.1.0]: https://github.com/dlg95/BKoAb/commits/05faa84
