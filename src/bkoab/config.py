from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "bkoab.db"
EXPORTS_DIR = DATA_DIR / "exports"
LETTERHEADS_DIR = DATA_DIR / "letterheads"
INVOICES_DIR = DATA_DIR / "invoices"

MAX_INVOICE_PDF_BYTES = 10 * 1024 * 1024  # 10 MB

DATABASE_URL = f"sqlite:///{DB_PATH}"
