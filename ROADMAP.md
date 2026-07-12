# BKoAb — Roadmap

Stand: Juli 2026 · Lokales MVP steht; nächste Schritte: **Fachlogik vertiefen** → **Cloud mit Nutzerkonten** → **Monetarisierung**.

---

## Übersicht — Reihenfolge

| Phase | Fokus | Warum diese Reihenfolge |
|-------|--------|-------------------------|
| **✓ Erledigt** | Lokales MVP (WG + MFH, PM + m², PDF, DOCX) | Fundament steht |
| **4** | Weitere Verteilerschlüssel | Kernprodukt für Vermieter vollständiger machen |
| **5** | HeizkostenV inkl. **CO₂-Aufteilung** | Gesetzlich relevant, hoher Nutzen, baut auf Direktzuordnung auf |
| **6** | WEG, Zähler, Belege/KI, Mobile UX | Spezialfälle und Komfort |
| **7** | **Hosted SaaS** — Accounts, Mandantentrennung, DSGVO | Erst mit stabiler Fachlogik online gehen |
| **8** | **Monetarisierung** — Google Ads, Tracking mit Consent | Nach Launch & Rechtsbasis |

---

## ✓ Erledigt — Lokales MVP

- **Übereinheit:** WG-Wohnung oder Gebäude — Stammdaten: Bezeichnung, Adresse, Gesamt-m²
- **Untereinheit:** Zimmer (WG) / Wohnungen (MFH)
- Verteilerquoten **pro Rechnung:** `personenmonate`, `flaeche_qm`
- PDF-Belege, Vorauszahlungen, Vorschau, DOCX-Export
- Property/Unit-Modell, erweiterte Kostenarten, MFH-Hausrechnungen

---

## Phase 4 — Weitere Verteilerschlüssel

**Ziel:** Übliche Betriebskosten-Schlüssel ergänzen — weiterhin **pro Rechnung** wählbar.

**Rechtsgrundlage (Orientierung):** BetrKV, HeizkostenV; bei WEG Teilungserklärung / Beschlüsse.

### Bereits umgesetzt

| Schlüssel | Anzeige | Typische Kosten |
|-----------|---------|-----------------|
| `personenmonate` | Personenmonate | WG: Gas, Strom, Reinigung; MFH wenn nach Köpfen |
| `flaeche_qm` | Fläche (m²) | Grundsteuer, Versicherung, Aufzug, Hausstrom |

### Als Nächstes (Reihenfolge innerhalb Phase 4)

| # | Schlüssel | Anzeige | Beschreibung | Typische Kosten |
|---|-----------|---------|--------------|-----------------|
| 1 | `wohneinheiten` | Wohneinheiten (gleich) | Kosten ÷ Anzahl Untereinheiten | Kabel, Schornsteinfeger, Türsprechanlage |
| 2 | `direktzuordnung` | **Direktzuordnung (z.B. Verbrauch)** | Kosten werden **einer Partei/Untereinheit direkt** zugeordnet — nicht über einen Haus-Nenner. Z.B. abgelesener Verbrauch nur dieser Wohnung, oder Anteil nur bei gemeinsamem Zähler: eigener Verbrauch ÷ Summe | Wasser (Kaltwasser), Strom Unterzähler, Fernwärme-Einzelabrechnung |
| 3 | `mea` | Miteigentumsanteile | Anteil × (eigene MEA ÷ MEA gesamt) | WEG-Hauskosten (Pflichtfeld je Unit bei WEG) |

### Später in Phase 4 / 6

| Schlüssel | Anzeige | Anmerkung |
|-----------|---------|-----------|
| `abwasser_direkt` | Direktzuordnung Abwasser | Gekoppelt an Kaltwasser-Direktzuordnung |
| `nutzflaeche` | Nutzfläche (m²) | Gewerbe / gemischt genutzt |
| `anschluesse` | Anschlüsse | TV/Daten je Unit |
| `mietanteil` | Mietanteil | Selten, ältere Verträge |
| `manuell` | Manuell / Festbetrag | Sondervereinbarungen |

### Stammdaten & Technik

- Zählerstände + Ablesedatum je Untereinheit (für Direktzuordnung mit Verbrauch)
- MEA (Tausendstel) je Untereinheit
- DOCX/UI: Schlüssel-Label je Kostenzeile

### Offene Fragen

- [ ] Direktzuordnung: Ablesung zum 31.12. vs. periodengerecht zum Rechnungszeitraum?
- [ ] `wohneinheiten`: immer Untereinheiten der Abrechnungsebene (Zimmer bzw. Wohnungen)?

---

## Phase 5 — HeizkostenV & CO₂-Aufteilung

**Ziel:** Eine Heiz-Rechnung gesetzeskonform in Teilposten zerlegen und verteilen — inkl. **CO₂-Kosten** seit HeizkostenV.

### Konzept: Rechnung splitten, dann verteilen

Eine erfasste **Heizkosten-Rechnung** wird intern (oder in der UI) aufgeteilt:

| Teilposten | Anteil an Gesamtrechnung | Verteilerquote (Vorschlag) |
|------------|--------------------------|----------------------------|
| **Grundkosten** | 30–50 % (einstellbar) | `flaeche_qm` oder `wohneinheiten` |
| **Verbrauchskosten** | 50–70 % | `direktzuordnung` (Heizwertverteiler / Wärmemengenzähler) |
| **CO₂-Kosten** | Ausweis laut Energieversorger / Berechnung | 50 % Direktzuordnung (Verbrauch) + 50 % nach **CO₂-Emissionsfaktor** des Gebäudes |

### Neue Stammdaten (Gebäude)

- CO₂-Emissionsfaktor / Emissionsklasse (kg CO₂/kWh oder Stufen 1–10)
- Optional: Heizwertverteiler-Stände je Untereinheit
- Parameter: Grundkosten-Prozentsatz (Default z. B. 30 %)

### UI / Abrechnung

- Kostenart **Heizkosten (Gebäude)** mit Assistent: „HeizkostenV-Aufteilung anwenden?“
- Vorschau zeigt drei Zeilen (Grund / Verbrauch / CO₂) je Mieterpartei
- DOCX: separate Zeilen oder Unterabschnitt „Heizkosten gem. HeizkostenV“

### Abhängigkeiten

- Phase 4: `direktzuordnung`, `flaeche_qm`, Zählerstände
- Optional Phase 6: WEG-Sonderfälle

### Offene Fragen

- [ ] Eine Rechnung mit Auto-Split vs. drei manuelle Teilrechnungen?
- [ ] CO₂: Emissionsfaktor manuell oder aus Verbrauchsabrechnung übernehmen?

---

## Phase 6 — WEG, Belege, KI, Mobile

### WEG-Modul

- Hausgeld, Rücklage, umlagefähig / nicht umlagefähig
- WEG-Jahresabrechnung als PDF-Quelle
- MEA als Pflicht bei WEG-Objekten

### Belege & KI

- Foto/PDF-Upload, Kamera (PWA)
- KI-Mietvertrag (API serverseitig, manuell bestätigen) — kein API-Key in der UI

### Mobile & UX

- Responsive / PWA, vereinfachte Vorauszahlungs-Matrix
- Desktop-first; kein Offline-Modus geplant

---

## Phase 7 — Hosted SaaS (Multi-Tenant, DSGVO)

**Ziel:** Tool online hosten; jede Person verwaltet **eigene** Abrechnungen in einem **isolierten** Account — kein Zugriff durch andere Nutzer.

### Architektur (Vorschlag)

```
                    ┌─────────────────────────────────────┐
                    │  EU-Region (z. B. DE Cloud)         │
                    │                                     │
  Browser/PWA ─────►│  CDN / Reverse Proxy (TLS)          │
                    │         │                           │
                    │         ▼                           │
                    │  Frontend (Static oder SSR)         │
                    │         │                           │
                    │         ▼                           │
                    │  API (FastAPI)                      │
                    │    · Auth Middleware (JWT/Session)  │
                    │    · tenant_id / user_id Scope    │
                    │         │                           │
                    │    ┌────┴────┐                      │
                    │    ▼         ▼                      │
                    │  PostgreSQL  Object Storage (S3)  │
                    │  (RLS oder   PDFs/DOCX pro User   │
                    │   tenant_id)  verschlüsselt         │
                    └─────────────────────────────────────┘
```

### Authentifizierung

| Provider | Umsetzung |
|----------|-----------|
| **Google** | OAuth 2.0 / OpenID Connect |
| **Apple** | Sign in with Apple |
| Lokal / Self-Host | Optional weiterhin ohne Account (bestehendes Modus) |

- Kein Passwort-Management im ersten Schritt (nur Social Login)
- Session: httpOnly-Cookie oder kurzlebiges JWT + Refresh
- Jeder Datensatz (`Property`, `Invoice`, `Lease`, …) erhält `user_id` (oder `tenant_id`)

### Datentrennung & Sicherheit

- **Strikte Mandantentrennung:** Alle Queries filtern auf `user_id`; keine gemeinsamen Tabellen ohne Scope
- Optional: Row-Level Security in PostgreSQL
- PDFs/Exports in user-prefix Pfaden (`users/{id}/invoices/…`)
- Verschlüsselung at rest (Storage + DB-Backups)
- Audit-Log: Login, Export, Löschung

### DSGVO

| Anforderung | Maßnahme |
|-------------|----------|
| Rechtsgrundlage Login | Einwilligung + Vertrag (Nutzungsverhältnis) |
| **Datenschutzerklärung** | Statische Seite, Versioniert, Link in App + bei Registrierung |
| **Cookie-Banner** | Consent vor nicht-notwendigen Cookies (Ads, Analytics) |
| Auskunft / Export | „Meine Daten exportieren“ (JSON/ZIP) |
| Löschung | Account löschen inkl. aller Abrechnungen & Dateien (Art. 17) |
| AV-Verträge | Mit Hoster, Storage, ggf. Google/Apple als Auftragsverarbeiter dokumentieren |
| Datenminimierung | Kein Tracking ohne Consent; Ads nur nach Opt-in wo nötig |
| EU-Hosting | Server & Backups in EU/EWR |

### Migration vom lokalen MVP

- SQLite → PostgreSQL
- Einmaliger Import-Wizard für bestehende lokale Datenbank (optional)
- `LandlordProfile` wird pro User

### Technische Schritte (grob)

1. `User`-Modell + OAuth-Flow (Google, Apple)
2. `user_id` an alle Entitäten + Migration
3. PostgreSQL + S3-kompatibles Storage
4. Deployment-Pipeline (Docker, Staging/Prod)
5. Datenschutz-Seiten + Cookie-Consent-Komponente
6. Account-Einstellungen (Export, Löschen)

---

## Phase 8 — Monetarisierung & Tracking

**Ziel:** Kostenloses Basisprodukt mit **Google Ads**; Messung nur **DSGVO-konform** nach Einwilligung.

### Google Ads — vorgesehene Plätze

| Platz | Format | Begründung |
|-------|--------|------------|
| Dashboard unter der Übersicht | Responsive Display | Hohe Sichtbarkeit, wenig störend beim Arbeiten |
| Zwischen Karten in Listen (Wohnungen / Gebäude) | In-Feed / Display | Natürliche Pause, nicht in Formularen |
| Seitenleiste (Desktop, breite Viewports) | Skyscraper / Half-page | Klassisch, Formularbereich bleibt frei |
| **Ausgeschlossen** | — | Abrechnungsformular, Rechnungstabelle, Mietparteien, DOCX-Export, Login |

### Tracking

- **Consent Mode v2** (Google) — Ads/Analytics erst nach Cookie-Einwilligung
- Analytics: privacy-freundlich (z. B. Plausible self-hosted **oder** GA4 nur mit Opt-in)
- Kein Tracking in DOCX oder exportierten Dateien
- Dokumentation in Datenschutzerklärung (Zweck, Anbieter, Widerruf)

### Reihenfolge innerhalb Phase 8

1. Cookie-Banner + Consent-Store (Phase 7 vorausgesetzt)
2. Ad-Slots im UI (Platzhalter / Test-Modus)
3. Google AdSense Freischaltung + Live-Schaltung nur nach Consent
4. Analytics optional mit gleichem Consent-Gate

---

## Prioritäten (Kurz)

| Phase | Inhalt |
|-------|--------|
| **✓ Erledigt** | Lokales MVP |
| **4** | `wohneinheiten`, **Direktzuordnung (z.B. Verbrauch)**, `mea` |
| **5** | HeizkostenV-Split + **CO₂-Aufteilung** |
| **6** | WEG, Zähler, Belege/KI, Mobile |
| **7** | Cloud-Hosting, Google/Apple-Login, Mandantentrennung, DSGVO |
| **8** | Google Ads + Consent-basiertes Tracking |

---

## Abhängigkeiten (Diagramm)

```
Erledigt (MVP)
    │
    ▼
Phase 4: Verteilerschlüssel
    │     (wohneinheiten → direktzuordnung → mea)
    ▼
Phase 5: HeizkostenV + CO₂
    │     (braucht direktzuordnung + m²)
    ▼
Phase 6: WEG / Belege / Mobile
    │
    ▼
Phase 7: Hosted SaaS + DSGVO
    │     (stabile Fachlogik vor Go-Live)
    ▼
Phase 8: Ads + Tracking (Consent)
```
