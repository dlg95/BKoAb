from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from bkoab.api.billing import router as billing_router
from bkoab.api.dashboard import router as dashboard_router
from bkoab.api.leases import router as leases_router
from bkoab.api.properties import router as properties_router
from bkoab.config import BASE_DIR
from bkoab.database import SessionLocal, init_db
from bkoab.models import LandlordProfile


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
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
    yield


app = FastAPI(title="BKoAb", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router)
app.include_router(leases_router)
app.include_router(billing_router)
app.include_router(properties_router)

frontend_dist = BASE_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
