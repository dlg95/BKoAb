import os
import time
import zipfile

import pytest

from bkoab import config
from bkoab.services import auto_backup


@pytest.fixture()
def backup_env(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    db_path = data_dir / "bkoab.db"
    import sqlite3

    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE apartments (id INTEGER PRIMARY KEY)")
    conn.execute("INSERT INTO apartments VALUES (1)")
    conn.commit()
    conn.close()

    from bkoab.services import data_export

    for mod in (config, data_export):
        monkeypatch.setattr(mod, "DATA_DIR", data_dir)
        monkeypatch.setattr(mod, "DB_PATH", db_path)
        monkeypatch.setattr(mod, "INVOICES_DIR", data_dir / "invoices")
        monkeypatch.setattr(mod, "LETTERHEADS_DIR", data_dir / "letterheads")
        monkeypatch.setattr(mod, "EXPORTS_DIR", data_dir / "exports")
    monkeypatch.setattr(config, "BACKUP_DIR", tmp_path / "backups")
    monkeypatch.setattr(config, "AUTO_BACKUP_INTERVAL_DAYS", 7)
    monkeypatch.setattr(config, "AUTO_BACKUP_KEEP", 2)
    return db_path


def test_auto_backup_only_when_data_changed(backup_env):
    first = auto_backup.maybe_auto_backup("start")
    assert first is not None
    with zipfile.ZipFile(config.BACKUP_DIR / first.filename) as zf:
        assert "data/bkoab.db" in zf.namelist()
        assert "manifest.json" in zf.namelist()

    # Unchanged data → nothing new, also on quit
    assert auto_backup.maybe_auto_backup("auto") is None
    assert auto_backup.maybe_auto_backup("beenden", on_quit=True) is None

    # Changed data within the interval → only on quit
    future = time.time() + 5
    os.utime(backup_env, (future, future))
    assert auto_backup.maybe_auto_backup("auto") is None
    assert auto_backup.maybe_auto_backup("beenden", on_quit=True) is not None


def test_auto_backup_disabled_and_pruned(backup_env, monkeypatch):
    for _ in range(3):
        auto_backup.create_backup("manuell")
        time.sleep(1.01)  # file names have second resolution
    assert len(auto_backup.list_backups()) == 2

    monkeypatch.setattr(config, "AUTO_BACKUP_INTERVAL_DAYS", 0)
    assert auto_backup.maybe_auto_backup("start") is None


def test_backup_path_rejects_traversal(backup_env):
    auto_backup.create_backup("manuell")
    name = auto_backup.list_backups()[0].filename
    assert auto_backup.backup_path(name) is not None
    assert auto_backup.backup_path("../bkoab.db") is None
    assert auto_backup.backup_path("other.zip") is None
