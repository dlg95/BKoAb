"""PDF export: settlement DOCX rendered to PDF plus appended invoice documents."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def _app_resources_dir() -> Path | None:
    """Contents/Resources of the macOS .app when frozen via PyInstaller."""
    if not (getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS")):
        return None
    # .../BKoAb.app/Contents/MacOS/BKoAb → .../Contents/Resources
    return Path(sys.executable).resolve().parent.parent / "Resources"


def _bundled_soffice_candidates() -> list[Path]:
    candidates: list[Path] = []
    resources = _app_resources_dir()
    if resources is not None:
        candidates.append(resources / "LibreOffice.app" / "Contents" / "MacOS" / "soffice")
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        base = Path(meipass)
        candidates.append(base / "LibreOffice.app" / "Contents" / "MacOS" / "soffice")
        candidates.append(base / "LibreOffice" / "program" / "soffice")
    # Dev / vendor layout next to repo root
    repo_vendor = Path(__file__).resolve().parents[2] / "vendor" / "LibreOffice.app" / "Contents" / "MacOS" / "soffice"
    candidates.append(repo_vendor)
    return candidates


SYSTEM_SOFFICE_CANDIDATES = (
    "soffice",
    "libreoffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/opt/homebrew/bin/soffice",
    "/usr/local/bin/soffice",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/usr/lib/libreoffice/program/soffice",
)


def find_soffice() -> str | None:
    env = os.environ.get("BKOAB_SOFFICE")
    if env:
        path = Path(env)
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)

    for path in _bundled_soffice_candidates():
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)

    for candidate in SYSTEM_SOFFICE_CANDIDATES:
        path = Path(candidate)
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
        found = shutil.which(candidate)
        if found:
            return found
    return None


def _soffice_missing_message() -> str:
    return (
        "PDF-Export benötigt LibreOffice (soffice). "
        "Lokal: ./scripts/ensure_export_deps.sh "
        "(macOS: brew install --cask libreoffice · Linux: apt install libreoffice-writer-nogui). "
        "Die macOS-App bündelt LibreOffice unter Contents/Resources (MPL-2.0). "
        "Details: README.md und THIRD_PARTY_NOTICES.md."
    )


def docx_bytes_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX bytes to PDF using LibreOffice headless."""
    soffice = find_soffice()
    if not soffice:
        raise RuntimeError(_soffice_missing_message())

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        profile_dir = tmp_path / "lo-profile"
        profile_dir.mkdir()
        # file:// URL for LibreOffice UserInstallation (required for concurrent/headless runs)
        profile_uri = profile_dir.resolve().as_uri()
        docx_path = tmp_path / "settlement.docx"
        docx_path.write_bytes(docx_bytes)
        result = subprocess.run(
            [
                soffice,
                f"-env:UserInstallation={profile_uri}",
                "--headless",
                "--nologo",
                "--nodefault",
                "--nolockcheck",
                "--norestore",
                "--convert-to",
                "pdf",
                "--outdir",
                str(tmp_path),
                str(docx_path),
            ],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
            cwd=str(Path(soffice).resolve().parent),
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
