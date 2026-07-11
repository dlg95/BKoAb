from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from bkoab.database import Base, get_db
from bkoab.main import app
from bkoab.models import AdvancePayment, Apartment, BillingYear, Invoice, InvoiceType, Lease, Room, Tenant


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        db = TestingSession()
        apt = Apartment(name="WG Test", street="Muster 1", city="12345 Berlin")
        db.add(apt)
        db.flush()
        db.add(Room(apartment_id=apt.id, name="Zimmer 1"))
        db.add(Room(apartment_id=apt.id, name="Zimmer 2"))
        db.flush()
        tenant = Tenant(name="Anna")
        db.add(tenant)
        db.flush()
        room = db.query(Room).filter(Room.apartment_id == apt.id).first()
        db.add(Lease(tenant_id=tenant.id, room_id=room.id, persons=1, move_in=date(2025, 1, 1)))
        by = BillingYear(apartment_id=apt.id, year=2025)
        db.add(by)
        db.flush()
        db.add(
            Invoice(
                billing_year_id=by.id,
                invoice_type=InvoiceType.GAS,
                amount=Decimal("1200"),
                period_start=date(2025, 1, 1),
                period_end=date(2025, 12, 31),
            )
        )
        lease = db.query(Lease).first()
        for month in range(1, 13):
            db.add(AdvancePayment(lease_id=lease.id, month=month, amount=Decimal("50")))
        db.commit()
        db.close()
        yield test_client
    app.dependency_overrides.clear()


def test_settlement_preview_and_balance(client):
    preview = client.get("/api/apartments/1/billing-years/2025/preview")
    assert preview.status_code == 200
    data = preview.json()
    assert len(data["parties"]) == 1
    party = data["parties"][0]
    assert float(party["total_advance_payments"]) == pytest.approx(600.0)
    assert float(party["total_costs"]) > 0
