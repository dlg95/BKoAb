import io
import json
import sqlite3
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bkoab.main import app
from bkoab.services import data_export as data_export_module
import bkoab.config as config_module
import bkoab.database as database_module


@pytest.fixture()
def export_client(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    invoices = data_dir / "invoices"
    letterheads = data_dir / "letterheads"
    exports = data_dir / "exports"
    invoices.mkdir()
    letterheads.mkdir()
    exports.mkdir()

    db_path = data_dir / "bkoab.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE meta (k TEXT, v TEXT)")
    conn.execute("INSERT INTO meta VALUES ('hello', 'world')")
    conn.commit()
    conn.close()

    (invoices / "42.pdf").write_bytes(b"%PDF-1.4 fake")
    (letterheads / "logo.png").write_bytes(b"\x89PNG\r\n")
    (exports / "demo.docx").write_bytes(b"PK\x03\x04")

    for mod in (data_export_module, config_module):
        monkeypatch.setattr(mod, "DATA_DIR", data_dir)
        monkeypatch.setattr(mod, "DB_PATH", db_path)
        monkeypatch.setattr(mod, "INVOICES_DIR", invoices)
        monkeypatch.setattr(mod, "LETTERHEADS_DIR", letterheads)
        monkeypatch.setattr(mod, "EXPORTS_DIR", exports)
    monkeypatch.setattr(config_module, "DATABASE_URL", f"sqlite:///{db_path}")

    original_engine = database_module.engine
    original_session = database_module.SessionLocal
    database_module.engine.dispose()
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    database_module.engine = test_engine
    database_module.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    with TestClient(app) as client:
        yield client

    database_module.engine.dispose()
    database_module.engine = original_engine
    database_module.SessionLocal = original_session


def test_data_export_zip_contains_user_files(export_client):
    response = export_client.get("/api/data-export")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")
    assert "BKoAb_Datenexport_" in response.headers.get("content-disposition", "")

    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        names = set(zf.namelist())
        assert "manifest.json" in names
        assert "LIESMICH.txt" in names
        assert "data/bkoab.db" in names
        assert "data/invoices/42.pdf" in names
        assert "data/letterheads/logo.png" in names
        assert "data/exports/demo.docx" in names

        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["format"] == "bkoab-data-export"
        assert "data/bkoab.db" in manifest["contents"]

        db_bytes = zf.read("data/bkoab.db")
        from tempfile import NamedTemporaryFile

        with NamedTemporaryFile(suffix=".db", delete=False) as tmpf:
            tmpf.write(db_bytes)
            tmp_path = Path(tmpf.name)
        try:
            conn = sqlite3.connect(tmp_path)
            row = conn.execute("SELECT v FROM meta WHERE k='hello'").fetchone()
            conn.close()
            assert row == ("world",)
        finally:
            tmp_path.unlink(missing_ok=True)


def test_data_import_replaces_user_files(export_client):
    export_response = export_client.get("/api/data-export")
    assert export_response.status_code == 200
    zip_bytes = export_response.content

    data_dir = data_export_module.DATA_DIR
    (data_dir / "invoices" / "999.pdf").write_bytes(b"stale")
    # Keep a valid sqlite file for init_db after import; overwrite with garbage then restore via import
    (data_dir / "marker.txt").write_text("before-import")

    files = {"file": ("backup.zip", zip_bytes, "application/zip")}
    import_response = export_client.post("/api/data-import", files=files)
    assert import_response.status_code == 200, import_response.text
    body = import_response.json()
    assert body["ok"] is True
    assert body["imported_files"] >= 4
    assert body["backup_path"]

    assert (data_dir / "invoices" / "42.pdf").read_bytes().startswith(b"%PDF")
    assert not (data_dir / "invoices" / "999.pdf").exists()
    assert not (data_dir / "marker.txt").exists()
    conn = sqlite3.connect(data_dir / "bkoab.db")
    row = conn.execute("SELECT v FROM meta WHERE k='hello'").fetchone()
    conn.close()
    assert row == ("world",)

    backup = Path(body["backup_path"])
    assert backup.exists()
    assert (backup / "invoices" / "999.pdf").exists()
    assert (backup / "marker.txt").read_text() == "before-import"


def test_data_import_rejects_non_zip(export_client):
    files = {"file": ("nope.txt", b"hello", "text/plain")}
    response = export_client.post("/api/data-import", files=files)
    assert response.status_code == 400
