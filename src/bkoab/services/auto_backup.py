"""Automatic local backups in the regular export format (importable via „Daten importieren“)."""

from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from bkoab import config
from bkoab.services.data_export import build_user_data_export_zip

BACKUP_PREFIX = "BKoAb_Sicherung_"
_lock = threading.Lock()


@dataclass
class BackupInfo:
    filename: str
    created_at: datetime
    size_bytes: int
    reason: str


def _backup_dir() -> Path:
    return Path(config.BACKUP_DIR)


def list_backups() -> list[BackupInfo]:
    folder = _backup_dir()
    if not folder.is_dir():
        return []
    items: list[BackupInfo] = []
    for path in folder.glob(f"{BACKUP_PREFIX}*.zip"):
        stat = path.stat()
        reason = path.stem.rsplit("_", 1)[-1] if path.stem.count("_") >= 4 else ""
        items.append(BackupInfo(path.name, datetime.fromtimestamp(stat.st_mtime), stat.st_size, reason))
    return sorted(items, key=lambda b: b.created_at, reverse=True)


def backup_path(filename: str) -> Path | None:
    """Resolve a backup by name; refuses anything that is not a direct child backup ZIP."""
    if "/" in filename or "\\" in filename or not filename.startswith(BACKUP_PREFIX) or not filename.endswith(".zip"):
        return None
    path = _backup_dir() / filename
    return path if path.is_file() else None


def _latest_data_change() -> float:
    """Newest modification time of the database and uploaded files."""
    latest = 0.0
    db_path = Path(config.DB_PATH)
    for candidate in (db_path, db_path.with_name(db_path.name + "-wal")):
        if candidate.exists():
            latest = max(latest, candidate.stat().st_mtime)
    for folder in (Path(config.INVOICES_DIR), Path(config.LETTERHEADS_DIR)):
        if folder.is_dir():
            for path in folder.rglob("*"):
                if path.is_file():
                    latest = max(latest, path.stat().st_mtime)
    return latest


def _has_user_data() -> bool:
    db_path = Path(config.DB_PATH)
    if not db_path.exists():
        return False
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            return conn.execute("SELECT COUNT(*) FROM apartments").fetchone()[0] > 0
        finally:
            conn.close()
    except sqlite3.Error:
        return False


def _prune() -> None:
    for old in list_backups()[config.AUTO_BACKUP_KEEP :]:
        (_backup_dir() / old.filename).unlink(missing_ok=True)


def create_backup(reason: str = "manuell") -> BackupInfo:
    with _lock:
        folder = _backup_dir()
        folder.mkdir(parents=True, exist_ok=True)
        content, _ = build_user_data_export_zip()
        stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        safe_reason = "".join(c for c in reason if c.isalnum()) or "auto"
        path = folder / f"{BACKUP_PREFIX}{stamp}_{safe_reason}.zip"
        tmp = path.with_suffix(".zip.tmp")
        tmp.write_bytes(content)
        tmp.replace(path)
        _prune()
        stat = path.stat()
        return BackupInfo(path.name, datetime.fromtimestamp(stat.st_mtime), stat.st_size, safe_reason)


def maybe_auto_backup(reason: str = "auto", *, on_quit: bool = False) -> BackupInfo | None:
    """Create a backup when data changed since the last one and the interval has passed.

    On quit, any change since the last backup is enough (interval ignored).
    Never raises — a failed backup must not stop the app.
    """
    interval = config.AUTO_BACKUP_INTERVAL_DAYS
    if interval <= 0 or not _has_user_data():
        return None
    try:
        backups = list_backups()
        newest = backups[0].created_at.timestamp() if backups else 0.0
        if backups and _latest_data_change() <= newest:
            return None
        age_days = (datetime.now().timestamp() - newest) / 86400
        if backups and not on_quit and age_days < interval:
            return None
        return create_backup(reason)
    except Exception:  # noqa: BLE001 — backups are best effort
        return None
