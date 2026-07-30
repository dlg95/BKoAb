from fastapi import APIRouter
from fastapi.responses import Response

from bkoab.services.data_export import build_user_data_export_zip

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
