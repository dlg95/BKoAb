# Third-party notices

## LibreOffice

BKoAb uses **LibreOffice** (`soffice`) to convert settlement DOCX files to PDF
and may redistribute a LibreOffice macOS application bundle inside `BKoAb.app`
(and install LibreOffice packages in Docker / local setup scripts).

- Project: https://www.libreoffice.org/
- License: **Mozilla Public License 2.0 (MPL-2.0)**
- License text: https://www.libreoffice.org/about-us/licenses/
- Source code: https://www.libreoffice.org/download/download-libreoffice/

Redistribution of LibreOffice binaries is permitted under the MPL-2.0.
Trademark use of the name “LibreOffice” and logos remains subject to
The Document Foundation’s trademark policy:
https://www.libreoffice.org/about-us/trademarks/

## Python packages (DOCX / PDF)

| Package | Role | License |
|---------|------|---------|
| python-docx | Generate settlement DOCX | MIT |
| pypdf | Merge settlement PDF with invoice PDFs | BSD-3-Clause |
| lxml | XML support for python-docx | BSD |
