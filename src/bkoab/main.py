import asyncio
from contextlib import asynccontextmanager, suppress
import os
import signal
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from bkoab.api.backups import router as backups_router
from bkoab.api.billing import router as billing_router
from bkoab.api.dashboard import router as dashboard_router
from bkoab.api.data_export import router as data_export_router
from bkoab.api.leases import router as leases_router
from bkoab.api.properties import router as properties_router
from bkoab.config import BASE_DIR
from bkoab import database
from bkoab.models import LandlordProfile
from bkoab.services.auto_backup import maybe_auto_backup

AUTO_BACKUP_CHECK_SECONDS = 6 * 60 * 60


async def _auto_backup_loop() -> None:
    while True:
        await asyncio.sleep(AUTO_BACKUP_CHECK_SECONDS)
        await asyncio.to_thread(maybe_auto_backup, "auto")


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    # Look up via the module: a data import swaps engine/SessionLocal at runtime.
    db = database.SessionLocal()
    try:
        if not db.query(LandlordProfile).first():
            db.add(
                LandlordProfile(
                    name="Vermieter",
                    payment_text_template=(
                        "Bitte überweisen Sie den offenen Betrag auf folgendes Konto. "
                        "Ein Guthaben überweisen wir zeitnah auf Ihr uns bekanntes Konto."
                    ),
                )
            )
            db.commit()
    finally:
        db.close()

    await asyncio.to_thread(maybe_auto_backup, "start")
    backup_task = asyncio.create_task(_auto_backup_loop())
    try:
        yield
    finally:
        backup_task.cancel()
        with suppress(asyncio.CancelledError):
            await backup_task
        await asyncio.to_thread(maybe_auto_backup, "beenden", on_quit=True)


app = FastAPI(title="BKoAb", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ],
    allow_origin_regex=r"https?://(127\.0\.0\.1|localhost)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router)
app.include_router(leases_router)
app.include_router(billing_router)
app.include_router(properties_router)
app.include_router(data_export_router)
app.include_router(backups_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/shutdown")
def shutdown():
    """Stop the local server (used by the macOS .app)."""

    def _kill() -> None:
        os.kill(os.getpid(), signal.SIGTERM)

    maybe_auto_backup("beenden", on_quit=True)
    threading.Timer(0.4, _kill).start()
    return {"ok": True}


frontend_dist = BASE_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
