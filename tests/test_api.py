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
        db.add(Lease(tenant_id=tenant.id, room_id=room.id, persons=1, move_in=date(2025, 1, 1), move_out=date(2025, 12, 31)))
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
    # second room vacant all year -> landlord vacancy head-months
    assert float(data["landlord_vacancy_head_months"]) > 0


def test_create_apartment_requires_single_initial_room(client):
    bad = client.post(
        "/api/apartments",
        json={"name": "WG", "rooms": [{"name": "Z1"}, {"name": "Z2"}]},
    )
    assert bad.status_code == 422

    ok = client.post(
        "/api/apartments",
        json={"name": "WG Neu", "rooms": [{"name": "Zimmer 1"}]},
    )
    assert ok.status_code == 201
    apt_id = ok.json()["id"]

    add = client.post(f"/api/apartments/{apt_id}/rooms", json={"name": "Zimmer 2"})
    assert add.status_code == 201
    apt = client.get(f"/api/apartments/{apt_id}")
    assert len(apt.json()["rooms"]) == 2


def test_billing_years_lifecycle(client):
    create = client.post("/api/apartments/1/billing-years", json={"year": 2024})
    assert create.status_code == 201

    duplicate = client.post("/api/apartments/1/billing-years", json={"year": 2024})
    assert duplicate.status_code == 409

    listing = client.get("/api/apartments/1/billing-years")
    assert listing.status_code == 200
    years = [item["year"] for item in listing.json()]
    assert 2024 in years
    assert 2025 in years


def test_person_periods_update(client):
    response = client.put(
        "/api/leases/1/person-periods",
        json={
            "periods": [
                {"valid_from": "2025-01-01", "valid_to": "2025-06-30", "persons": 1},
                {"valid_from": "2025-07-01", "valid_to": "2025-12-31", "persons": 2},
            ]
        },
    )
    assert response.status_code == 200
    preview = client.get("/api/apartments/1/billing-years/2025/preview")
    assert preview.status_code == 200
    party = preview.json()["parties"][0]
    assert float(party["head_months"]) > 12


def test_advance_payments_occupied_months(client):
    response = client.get("/api/apartments/1/billing-years/2025/advance-payments")
    assert response.status_code == 200
    row = response.json()[0]
    assert row["occupied_months"] == list(range(1, 13))

    create = client.post(
        "/api/apartments/1/leases",
        json={
            "tenant_name": "Bernd",
            "tenant_contact": "",
            "room_id": 2,
            "persons": 1,
            "move_in": "2025-04-01",
            "move_out": "2025-09-30",
        },
    )
    assert create.status_code == 201
    lease_id = create.json()["id"]

    rows = client.get("/api/apartments/1/billing-years/2025/advance-payments").json()
    partial = next(item for item in rows if item["lease_id"] == lease_id)
    assert partial["occupied_months"] == [4, 5, 6, 7, 8, 9]

    ok = client.put(
        "/api/apartments/1/billing-years/2025/advance-payments",
        json={"payments": [{"lease_id": lease_id, "month": 5, "amount": "25"}]},
    )
    assert ok.status_code == 200

    rejected = client.put(
        "/api/apartments/1/billing-years/2025/advance-payments",
        json={"payments": [{"lease_id": lease_id, "month": 1, "amount": "10"}]},
    )
    assert rejected.status_code == 400
