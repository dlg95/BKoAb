"""PDF export: settlement DOCX rendered to PDF plus appended invoice documents."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter

SOFFICE_CANDIDATES = (
    "soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/opt/homebrew/bin/soffice",
    "/usr/local/bin/soffice",
    "/usr/bin/soffice",
)


def find_soffice() -> str | None:
    for candidate in SOFFICE_CANDIDATES:
        path = Path(candidate)
        if path.is_file():
            return str(path)
        found = shutil.which(candidate)
        if found:
            return found
    return None


def docx_bytes_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX bytes to PDF using LibreOffice headless."""
    soffice = find_soffice()
    if not soffice:
        raise RuntimeError(
            "PDF-Export benötigt LibreOffice (soffice). "
            "Installation unter macOS: brew install --cask libreoffice"
        )

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        docx_path = tmp_path / "settlement.docx"
        docx_path.write_bytes(docx_bytes)
        result = subprocess.run(
            [
                soffice,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(tmp_path),
                str(docx_path),
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(f"PDF-Konvertierung fehlgeschlagen: {detail or 'Unbekannter Fehler'}")

        pdf_path = tmp_path / "settlement.pdf"
        if not pdf_path.exists():
            raise RuntimeError("PDF-Konvertierung lieferte keine Datei")
        return pdf_path.read_bytes()


def merge_pdf_documents(parts: list[bytes]) -> bytes:
    writer = PdfWriter()
    for part in parts:
        if not part:
            continue
        reader = PdfReader(BytesIO(part))
        for page in reader.pages:
            writer.add_page(page)
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def build_settlement_pdf(docx_bytes: bytes, attachment_pdfs: list[bytes]) -> bytes:
    settlement_pdf = docx_bytes_to_pdf(docx_bytes)
    if not attachment_pdfs:
        return settlement_pdf
    return merge_pdf_documents([settlement_pdf, *attachment_pdfs])
