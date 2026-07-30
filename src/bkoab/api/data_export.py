from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from bkoab.services.data_export import (
    DataImportError,
    MAX_IMPORT_ZIP_BYTES,
    build_user_data_export_zip,
    import_user_data_zip,
)

router = APIRouter(prefix="/api", tags=["data-export"])


@router.get("/data-export")
def export_user_data():
    """ZIP mit allen Nutzerdaten (DB, PDFs, Briefköpfe, Exporte) — ohne Programmcode."""
    content, filename = build_user_data_export_zip()
    return Response(
        content=content,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/data-import")
async def import_user_data(file: UploadFile = File(...)):
    """Importiert einen zuvor erzeugten BKoAb-Datenexport (ersetzt lokale Nutzerdaten)."""
    raw = await file.read()
    if len(raw) > MAX_IMPORT_ZIP_BYTES:
        raise HTTPException(413, "ZIP ist zu groß (max. 200 MB).")
    try:
        result = import_user_data_zip(raw)
    except DataImportError as exc:
        raise HTTPException(400, str(exc)) from exc
    return result
