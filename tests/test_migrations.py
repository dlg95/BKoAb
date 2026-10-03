import sqlite3
import zipfile
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, inspect

import bkoab.models  # noqa: F401  (registers tables on Base.metadata)
from bkoab.database import Base
from bkoab.migrations import run_migrations

LEGACY_BACKUP = Path(__file__).parent / "fixtures" / "legacy_v0_1_master_backup.zip"


def _legacy_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "legacy.db"
    with zipfile.ZipFile(LEGACY_BACKUP) as zf:
        db_path.write_bytes(zf.read("data/bkoab.db"))
    return db_path


def test_legacy_advance_payments_are_kept_for_every_billing_year(tmp_path):
    db_path = _legacy_db(tmp_path)
    conn = sqlite3.connect(db_path)
    # Legacy schema: one row per (lease, month), valid for every year.
    assert "year" not in {row[1] for row in conn.execute("PRAGMA table_info(advance_payments)")}
    lease_id, apartment_id = conn.execute(
        "SELECT l.id, r.apartment_id FROM leases l JOIN rooms r ON r.id = l.room_id"
    ).fetchone()
    conn.execute("INSERT INTO billing_years (apartment_id, year, status) VALUES (?, 2023, 'DRAFT')", (apartment_id,))
    conn.executemany(
        "INSERT INTO advance_payments (lease_id, month, amount) VALUES (?, ?, ?)",
        [(lease_id, month, "40.00") for month in (1, 2, 3)],
    )
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    run_migrations(engine)  # idempotent

    assert "year" in {c["name"] for c in inspect(engine).get_columns("advance_payments")}
    assert "advance_payment_rates" in inspect(engine).get_table_names()
    with engine.connect() as c:
        rows = c.exec_driver_sql(
            "SELECT year, month, amount FROM advance_payments ORDER BY year, month"
        ).fetchall()
    # Billing years 2023 and 2024 exist; lease started 2023-01-01 → copied into both.
    assert [(y, m) for y, m, _ in rows] == [(2023, 1), (2023, 2), (2023, 3), (2024, 1), (2024, 2), (2024, 3)]
    assert all(Decimal(str(a)) == Decimal("40") for _, _, a in rows)
