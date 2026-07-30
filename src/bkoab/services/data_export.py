"""Full user-data export/import (DB + uploaded files + generated exports)."""

from __future__ import annotations

import json
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from bkoab import config
from bkoab.config import DATA_DIR, DB_PATH, EXPORTS_DIR, INVOICES_DIR, LETTERHEADS_DIR

EXPORT_FORMAT = "bkoab-data-export"
EXPORT_FORMAT_VERSION = 1
MAX_IMPORT_ZIP_BYTES = 200 * 1024 * 1024  # 200 MB


class DataImportError(ValueError):
    """Invalid or unsafe import archive."""


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
                    "1. In BKoAb unter Einstellungen „Daten importieren“ wählen, oder: "
                    "App beenden, data/ aus diesem ZIP ins Datenverzeichnis kopieren, App starten. "
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


def _safe_member_path(name: str) -> Path | None:
    """Return relative path under data/ or None if member should be skipped/rejected."""
    normalized = name.replace("\\", "/").lstrip("/")
    if normalized in {"manifest.json", "LIESMICH.txt"} or normalized.endswith("/"):
        return None
    if ".." in Path(normalized).parts:
        raise DataImportError("Ungültiges Archiv (Pfadtraversal).")
    if not normalized.startswith("data/"):
        return None
    rel = normalized[len("data/") :]
    if not rel or rel.endswith("/"):
        return None
    return Path(rel)


def _validate_manifest(zf: zipfile.ZipFile) -> dict | None:
    if "manifest.json" not in zf.namelist():
        return None
    try:
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DataImportError("manifest.json ist ungültig.") from exc
    if manifest.get("format") not in (None, EXPORT_FORMAT):
        raise DataImportError("Dieses ZIP ist kein BKoAb-Datenexport.")
    version = manifest.get("format_version")
    if version is not None and int(version) > EXPORT_FORMAT_VERSION:
        raise DataImportError(
            f"Export-Formatversion {version} wird von dieser App-Version nicht unterstützt."
        )
    return manifest


def _dispose_db_connections() -> None:
    from bkoab import database as database_module

    database_module.engine.dispose()


def _reinit_db_after_import() -> None:
    """Re-open SQLite at the configured path and apply migrations."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from bkoab import database as database_module

    database_module.engine.dispose()
    database_module.engine = create_engine(
        f"sqlite:///{config.DB_PATH}",
        connect_args={"check_same_thread": False},
    )
    database_module.SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=database_module.engine,
    )
    database_module.init_db()


def _backup_current_data() -> Path | None:
    """Copy current data aside; return backup path if anything existed."""
    data_dir = config.DATA_DIR
    if not data_dir.exists():
        return None
    has_content = any(data_dir.iterdir())
    if not has_content:
        return None
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = data_dir.parent / f"BKoAb-backup-before-import-{stamp}"
    if backup.exists():
        shutil.rmtree(backup)
    shutil.copytree(data_dir, backup)
    return backup


def import_user_data_zip(zip_bytes: bytes) -> dict:
    """
    Replace local user data with the contents of a BKoAb export ZIP.

    Creates a timestamped backup of the previous data directory first.
    """
    if not zip_bytes:
        raise DataImportError("Leere Datei.")
    if len(zip_bytes) > MAX_IMPORT_ZIP_BYTES:
        raise DataImportError("ZIP ist zu groß (max. 200 MB).")

    try:
        zf_check = zipfile.ZipFile(BytesIO(zip_bytes))
    except zipfile.BadZipFile as exc:
        raise DataImportError("Datei ist kein gültiges ZIP-Archiv.") from exc

    data_dir = config.DATA_DIR

    with zf_check as zf:
        names = zf.namelist()
        if "data/bkoab.db" not in names and not any(
            n.replace("\\", "/").startswith("data/") for n in names
        ):
            raise DataImportError("ZIP enthält keine BKoAb-Daten (Ordner data/ fehlt).")
        manifest = _validate_manifest(zf)

        members: list[tuple[str, Path]] = []
        for name in names:
            rel = _safe_member_path(name)
            if rel is None:
                continue
            members.append((name, rel))

        if not members:
            raise DataImportError("ZIP enthält keine importierbaren Dateien unter data/.")

        _dispose_db_connections()
        backup_path = _backup_current_data()

        data_dir.mkdir(parents=True, exist_ok=True)
        for child in list(data_dir.iterdir()):
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink(missing_ok=True)

        imported: list[str] = []
        for name, rel in members:
            target = data_dir / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            imported.append(f"data/{rel.as_posix()}")

    _reinit_db_after_import()

    return {
        "ok": True,
        "imported_files": len(imported),
        "imported": sorted(imported),
        "backup_path": str(backup_path) if backup_path else None,
        "exported_at": (manifest or {}).get("exported_at"),
    }
