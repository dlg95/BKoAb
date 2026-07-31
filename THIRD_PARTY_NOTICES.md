# Drittanbieter- und Lizenzhinweise

Dieses Dokument gehört zu BKoAb. Es beschreibt Software von Dritten, die
mitgeliefert oder zur Laufzeit genutzt wird.

## dxpdf (PDF-Export)

**BKoAb verwendet dxpdf** für die Umwandlung von Abrechnungs-DOCX in PDF
(primärer PDF-Engine, im Python-Paket / App-Bundle).

- Projekt: https://github.com/nerdy-pro/dxpdf · https://pypi.org/project/dxpdf/
- Lizenz: **MIT**
- Typische Größe: ca. 13 MB (natives Wheel), deutlich kleiner als ein
  LibreOffice-Bundle

## LibreOffice (optionaler Fallback)

LibreOffice (`soffice` / Writer) kann optional für DOCX→PDF genutzt werden
(`BKOAB_PDF_ENGINE=libreoffice` oder Fallback, wenn dxpdf fehlschlägt und
LibreOffice installiert bzw. gebündelt ist). Die macOS-App bündelt LibreOffice
**nicht** standardmäßig; optional mit `BKOAB_BUNDLE_LIBREOFFICE=1 ./build_app.sh`.

LibreOffice ist Freie Software der [The Document Foundation](https://www.documentfoundation.org/).

### Lizenz

LibreOffice steht unter der **Mozilla Public License Version 2.0 (MPL-2.0)** und
basiert u. a. auf Code aus Apache OpenOffice (Apache License 2.0); einzelne
Bestandteile können weiteren Open-Source-Lizenzen unterliegen.

Offizielle Lizenzinformationen:

- **https://www.libreoffice.org/licenses/**

MPL-2.0-Text:

- https://mozilla.org/MPL/2.0/

Quellcode / Downloads:

- https://www.libreoffice.org/download/download-libreoffice/

### Marken

„LibreOffice“ und zugehörige Logos sind Marken von The Document Foundation:

- https://www.libreoffice.org/about-us/trademarks/

BKoAb steht in keiner offiziellen Verbindung zur Document Foundation.

## Python-Pakete (DOCX / PDF)

| Paket | Rolle | Lizenz |
|-------|-------|--------|
| python-docx | Erzeugung der Abrechnung als DOCX | MIT |
| dxpdf | DOCX→PDF (primär) | MIT |
| pypdf | Zusammenfügen von Abrechnungs-PDF und Beleg-PDFs | BSD-3-Clause |
| lxml | XML-Unterstützung für python-docx | BSD |
