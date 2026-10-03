from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from bkoab import config
from bkoab.services.auto_backup import backup_path, create_backup, list_backups
from bkoab.services.data_export import DataImportError, import_user_data_zip

router = APIRouter(prefix="/api", tags=["backups"])


def _info_dict(info) -> dict:
    return {
        "filename": info.filename,
        "created_at": info.created_at.isoformat(timespec="seconds"),
        "size_bytes": info.size_bytes,
        "reason": info.reason,
    }


@router.get("/backups")
def get_backups():
    """Automatische Sicherungen: Einstellungen und vorhandene Dateien (neueste zuerst)."""
    return {
        "directory": str(config.BACKUP_DIR),
        "interval_days": config.AUTO_BACKUP_INTERVAL_DAYS,
        "keep": config.AUTO_BACKUP_KEEP,
        "items": [_info_dict(b) for b in list_backups()],
    }


@router.post("/backups", status_code=201)
def create_backup_now():
    return _info_dict(create_backup("manuell"))


@router.get("/backups/{filename}")
def download_backup(filename: str):
    path = backup_path(filename)
    if not path:
        raise HTTPException(404, "Sicherung nicht gefunden")
    return FileResponse(path, media_type="application/zip", filename=filename)


@router.post("/backups/{filename}/restore")
def restore_backup(filename: str):
    """Stellt eine Sicherung wieder her (wie „Daten importieren“, inkl. Sicherung des aktuellen Stands)."""
    path = backup_path(filename)
    if not path:
        raise HTTPException(404, "Sicherung nicht gefunden")
    try:
        return import_user_data_zip(path.read_bytes())
    except DataImportError as exc:
        raise HTTPException(400, str(exc)) from exc
