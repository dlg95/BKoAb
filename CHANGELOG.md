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

- **Soll-Vorauszahlung je Mietpartei** („Vorauszahlung“ an der Mietpartei bzw. beim Anlegen):
  Monatsbetrag ab einem Monat, mit Änderungen über die Zeit. Er gilt automatisch für alle
  bewohnten Monate; in der Abrechnung trägt man nur noch Abweichungen ein (grau = Soll,
  hervorgehoben = eigene Eingabe, leeres Feld = wieder Soll, „Abweichungen zurücksetzen“).
- **Vorschlag zur künftigen Vorauszahlung** in Vorschau und DOCX/PDF — nur für Mietparteien,
  die noch in der WG wohnen: Kosten je bewohntem Monat, auf volle Euro aufgerundet, mit Vergleich
  zum bisherigen Soll. Beim Export abschaltbar.
- **Prüfung vor dem Versand** in „Vorschau & Export“: Fehler, Hinweise und Infos (z. B. fehlende
  Rechnungen oder Vorauszahlungen, mögliche Doppelerfassung, Rechnung außerhalb des Jahres,
  fehlende Zimmerflächen bei m²-Verteilung, Vermieteranteil durch Leerstand, unvollständiger
  Briefkopf, Abrechnungsfrist) mit Sprung zur betroffenen Stelle; Export bei Fehlern nur nach
  Rückfrage.
- **Abrechnungsfrist** (§ 556 Abs. 3 BGB, 31.12. des Folgejahres) auf dem Dashboard und in der
  Abrechnung: Hinweis ab 90 Tagen vor Fristende, „erstellt“ sobald ein DOCX/PDF exportiert wurde.
- **Alle Abrechnungen eines Jahres als ZIP** (DOCX, PDF oder beides).
- **Automatische Sicherung** beim Start, alle 7 Tage und beim Beenden (nur bei Änderungen), die
  letzten 10 bleiben erhalten; Liste unter Einstellungen mit „Jetzt sichern“, Herunterladen und
  Wiederherstellen. Steuerbar über `BKOAB_BACKUP_DIR`, `BKOAB_AUTO_BACKUP_DAYS` (0 = aus),
  `BKOAB_AUTO_BACKUP_KEEP`.

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

- **Vorauszahlungen wurden ohne Jahr gespeichert**: Ein Eintrag für z. B. Januar galt für den
  Januar *jedes* Abrechnungsjahres, Änderungen in 2025 überschrieben also 2024. Sie werden jetzt
  je Abrechnungsjahr gespeichert. Bestehende Einträge werden bei der Migration in jedes vorhandene
  Abrechnungsjahr übernommen, in dem die Mietpartei den Monat bewohnt hat — bisherige
  Abrechnungsergebnisse bleiben unverändert.

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

**Datenbankschema & Datenexport:** Vorauszahlungen haben jetzt eine Jahresspalte, neu ist die
Tabelle `advance_payment_rates`. Die Migration läuft automatisch beim Start und beim Import.
Das Exportformat steigt auf **Version 2**: Backups der Version 1 (alle bisherigen) werden
weiterhin importiert und migriert; ältere App-Versionen lehnen Version-2-Backups ab, statt sie
falsch zu lesen.

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
