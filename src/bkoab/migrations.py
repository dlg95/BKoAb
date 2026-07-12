"""Lightweight SQLite schema migrations (no Alembic)."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _column_names(engine: Engine, table: str) -> set[str]:
    return {col["name"] for col in inspect(engine).get_columns(table)}


def _table_exists(engine: Engine, table: str) -> bool:
    return table in inspect(engine).get_table_names()


def run_migrations(engine: Engine) -> None:
    with engine.begin() as conn:
        if not _table_exists(engine, "properties"):
            conn.execute(
                text(
                    """
                    CREATE TABLE properties (
                        id INTEGER PRIMARY KEY,
                        name VARCHAR(200) NOT NULL,
                        street VARCHAR(200) DEFAULT '',
                        city VARCHAR(200) DEFAULT '',
                        total_area_sqm NUMERIC(10, 2),
                        common_area_sqm NUMERIC(10, 2),
                        property_type VARCHAR(20) DEFAULT 'einfamilien' NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )

        if _table_exists(engine, "apartments"):
            cols = _column_names(engine, "apartments")
            if "property_id" not in cols:
                conn.execute(text("ALTER TABLE apartments ADD COLUMN property_id INTEGER REFERENCES properties(id)"))
            if "living_area_sqm" not in cols:
                conn.execute(text("ALTER TABLE apartments ADD COLUMN living_area_sqm NUMERIC(10, 2)"))

        if not _table_exists(engine, "property_billing_years"):
            conn.execute(
                text(
                    """
                    CREATE TABLE property_billing_years (
                        id INTEGER PRIMARY KEY,
                        property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
                        year INTEGER NOT NULL,
                        status VARCHAR(20) DEFAULT 'draft' NOT NULL,
                        UNIQUE(property_id, year)
                    )
                    """
                )
            )

        if _table_exists(engine, "invoices"):
            cols = _column_names(engine, "invoices")
            if "allocation_key" not in cols:
                conn.execute(
                    text("ALTER TABLE invoices ADD COLUMN allocation_key VARCHAR(20) DEFAULT 'personenmonate' NOT NULL")
                )
            if "allocation_scope" not in cols:
                conn.execute(
                    text("ALTER TABLE invoices ADD COLUMN allocation_scope VARCHAR(20) DEFAULT 'unit' NOT NULL")
                )
            if "property_billing_year_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE invoices ADD COLUMN property_billing_year_id INTEGER "
                        "REFERENCES property_billing_years(id) ON DELETE CASCADE"
                    )
                )
            if "has_document" not in cols:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN has_document BOOLEAN DEFAULT 0 NOT NULL"))

        if _table_exists(engine, "rooms"):
            cols = _column_names(engine, "rooms")
            if "area_sqm" not in cols:
                conn.execute(text("ALTER TABLE rooms ADD COLUMN area_sqm NUMERIC(10, 2)"))

        _backfill_properties(conn, engine)


def _backfill_properties(conn, engine: Engine) -> None:
    if not _table_exists(engine, "apartments"):
        return

    apartments = conn.execute(
        text("SELECT id, name, street, city, property_id FROM apartments")
    ).fetchall()

    for apt in apartments:
        if apt.property_id is not None:
            continue
        result = conn.execute(
            text(
                """
                INSERT INTO properties (name, street, city, property_type)
                VALUES (:name, :street, :city, 'einfamilien')
                """
            ),
            {"name": apt.name, "street": apt.street or "", "city": apt.city or ""},
        )
        property_id = result.lastrowid
        conn.execute(
            text("UPDATE apartments SET property_id = :property_id WHERE id = :id"),
            {"property_id": property_id, "id": apt.id},
        )
