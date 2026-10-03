import os
import sys
from pathlib import Path


def _is_frozen() -> bool:
    return getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS")


def _resource_dir() -> Path:
    """Read-only bundled resources (frontend, package data)."""
    if _is_frozen():
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parents[2]


def _user_data_dir() -> Path:
    """Writable app data (SQLite, exports, invoices). Override with BKOAB_DATA_DIR."""
    override = os.environ.get("BKOAB_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    if _is_frozen():
        return Path.home() / "Library" / "Application Support" / "BKoAb"
    return Path(__file__).resolve().parents[2] / "data"


BASE_DIR = _resource_dir()
DATA_DIR = _user_data_dir()
DB_PATH = DATA_DIR / "bkoab.db"
EXPORTS_DIR = DATA_DIR / "exports"
LETTERHEADS_DIR = DATA_DIR / "letterheads"
INVOICES_DIR = DATA_DIR / "invoices"


def _backup_dir() -> Path:
    """Automatic backups live next to (never inside) the data directory."""
    override = os.environ.get("BKOAB_BACKUP_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return DATA_DIR.parent / "BKoAb-Sicherungen"


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


BACKUP_DIR = _backup_dir()
# Create an automatic backup at most every N days (0 disables), keep the newest M files.
AUTO_BACKUP_INTERVAL_DAYS = _int_env("BKOAB_AUTO_BACKUP_DAYS", 7)
AUTO_BACKUP_KEEP = max(1, _int_env("BKOAB_AUTO_BACKUP_KEEP", 10))

MAX_INVOICE_PDF_BYTES = 10 * 1024 * 1024  # 10 MB

DATABASE_URL = f"sqlite:///{DB_PATH}"
