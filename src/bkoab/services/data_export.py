"""Full user-data export (DB + uploaded files + generated exports)."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from bkoab.config import DATA_DIR, DB_PATH, EXPORTS_DIR, INVOICES_DIR, LETTERHEADS_DIR

EXPORT_FORMAT = "bkoab-data-export"
EXPORT_FORMAT_VERSION = 1


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _add_tree(zf: zipfile.ZipFile, root: Path, arc_prefix: str) -> list[str]:
    """Add all files under root into the zip; return relative paths added."""
    added: list[str] = []
    if not root.exists():
        return added
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.name.startswith(".") or path.suffix in {".tmp", ".lock"}:
            continue
        rel = path.relative_to(root).as_posix()
        arcname = f"{arc_prefix}/{rel}" if rel != "." else arc_prefix
        zf.write(path, arcname)
        added.append(arcname)
    return added


def _backup_sqlite_into(zf: zipfile.ZipFile, arcname: str = "data/bkoab.db") -> None:
    """Copy SQLite safely even while the app may have the DB open."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists():
        zf.writestr(arcname, b"")
        return

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        src = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        try:
            dst = sqlite3.connect(tmp_path)
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
        zf.write(tmp_path, arcname)
    finally:
        tmp_path.unlink(missing_ok=True)


def build_user_data_export_zip() -> tuple[bytes, str]:
    """
    Build a ZIP with all user-owned data (not program code).

    Returns (zip_bytes, suggested_filename).
    """
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    filename = f"BKoAb_Datenexport_{stamp}.zip"

    included: list[str] = []
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        _backup_sqlite_into(zf, "data/bkoab.db")
        included.append("data/bkoab.db")

        included.extend(_add_tree(zf, INVOICES_DIR, "data/invoices"))
        included.extend(_add_tree(zf, LETTERHEADS_DIR, "data/letterheads"))
        included.extend(_add_tree(zf, EXPORTS_DIR, "data/exports"))

        # Catch any other user files under DATA_DIR (future folders)
        known = {"bkoab.db", "invoices", "letterheads", "exports"}
        if DATA_DIR.exists():
            for child in sorted(DATA_DIR.iterdir()):
                if child.name in known or child.name.startswith("."):
                    continue
                if child.is_file():
                    arc = f"data/{child.name}"
                    zf.write(child, arc)
                    included.append(arc)
                elif child.is_dir():
                    included.extend(_add_tree(zf, child, f"data/{child.name}"))

        manifest = {
            "format": EXPORT_FORMAT,
            "format_version": EXPORT_FORMAT_VERSION,
            "exported_at": _utc_now_iso(),
            "app": "BKoAb",
            "app_version": "0.1.0",
            "contents": sorted(set(included)),
            "restore": {
                "mac_app_data_dir": "~/Library/Application Support/BKoAb",
                "dev_data_dir": "./data",
                "instructions_de": (
                    "1. BKoAb auf dem Zielgerät beenden. "
                    "2. Den Ordner data/ aus diesem ZIP in das BKoAb-Datenverzeichnis "
                    "kopieren (bestehende Dateien ersetzen). "
                    "3. BKoAb erneut starten. "
                    "Enthalten: Datenbank (Wohnungen, Gebäude, Mietparteien, Abrechnungen), "
                    "Rechnungs-PDFs, Briefkopf-Dateien und erzeugte Exporte."
                ),
            },
        }
        zf.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        )
        zf.writestr(
            "LIESMICH.txt",
            (
                "BKoAb Datenexport\n"
                "=================\n\n"
                f"Exportiert: {manifest['exported_at']}\n\n"
                f"{manifest['restore']['instructions_de']}\n\n"
                "macOS-App-Datenverzeichnis:\n"
                f"  {manifest['restore']['mac_app_data_dir']}\n"
            ),
        )

    return buf.getvalue(), filename
