import io
import json
import sqlite3
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from bkoab.main import app
from bkoab.services import data_export as data_export_module


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

    monkeypatch.setattr(data_export_module, "DATA_DIR", data_dir)
    monkeypatch.setattr(data_export_module, "DB_PATH", db_path)
    monkeypatch.setattr(data_export_module, "INVOICES_DIR", invoices)
    monkeypatch.setattr(data_export_module, "LETTERHEADS_DIR", letterheads)
    monkeypatch.setattr(data_export_module, "EXPORTS_DIR", exports)

    with TestClient(app) as client:
        yield client


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

        # Restored DB must be readable SQLite
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
