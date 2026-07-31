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
    """Writable app data (SQLite, exports, invoices)."""
    if _is_frozen():
        return Path.home() / "Library" / "Application Support" / "BKoAb"
    return Path(__file__).resolve().parents[2] / "data"


BASE_DIR = _resource_dir()
DATA_DIR = _user_data_dir()
DB_PATH = DATA_DIR / "bkoab.db"
EXPORTS_DIR = DATA_DIR / "exports"
LETTERHEADS_DIR = DATA_DIR / "letterheads"
INVOICES_DIR = DATA_DIR / "invoices"

MAX_INVOICE_PDF_BYTES = 10 * 1024 * 1024  # 10 MB

DATABASE_URL = f"sqlite:///{DB_PATH}"
