from datetime import date
from decimal import Decimal
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from bkoab.config import INVOICES_DIR
from bkoab.database import Base, get_db
from bkoab.main import app
from bkoab.models import (
    AdvancePayment,
    AllocationKey,
    Apartment,
    BillingYear,
    Invoice,
    InvoiceType,
    Lease,
    Property,
    PropertyBillingYear,
    PropertyType,
    Room,
    Tenant,
)


@pytest.fixture()
def client(tmp_path):
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
        db.add(
            Lease(
                tenant_id=tenant.id,
                room_id=room.id,
                persons=1,
                move_in=date(2025, 1, 1),
                move_out=date(2025, 12, 31),
            )
        )
        by = BillingYear(apartment_id=apt.id, year=2025)
        db.add(by)
        db.flush()
        db.add(
            Invoice(
                billing_year_id=by.id,
                invoice_type=InvoiceType.GAS,
                allocation_key=AllocationKey.PERSONENMONATE,
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

        original_invoices_dir = INVOICES_DIR
        import bkoab.api.billing as billing_module
        import bkoab.config as config_module

        test_invoices_dir = tmp_path / "invoices"
        test_invoices_dir.mkdir()
        billing_module.INVOICES_DIR = test_invoices_dir
        config_module.INVOICES_DIR = test_invoices_dir

        yield test_client

        billing_module.INVOICES_DIR = original_invoices_dir
        config_module.INVOICES_DIR = original_invoices_dir
    app.dependency_overrides.clear()


def _minimal_pdf() -> bytes:
    return b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def test_settlement_preview_and_balance(client):
    preview = client.get("/api/apartments/1/billing-years/2025/preview")
    assert preview.status_code == 200
    data = preview.json()
    assert len(data["parties"]) == 1
    party = data["parties"][0]
    assert float(party["total_advance_payments"]) == pytest.approx(600.0)
    assert float(party["total_costs"]) > 0
    assert float(data["landlord_vacancy_head_months"]) > 0
    assert party["cost_lines"][0]["allocation_key"] == "personenmonate"


def test_create_apartment_without_initial_room(client):
    ok = client.post("/api/apartments", json={"name": "WG Neu"})
    assert ok.status_code == 201
    apt_id = ok.json()["id"]
    assert ok.json()["rooms"] == []
    assert ok.json()["property_id"] is not None

    add = client.post(f"/api/apartments/{apt_id}/rooms", json={"name": "Zimmer 1"})
    assert add.status_code == 201
    apt = client.get(f"/api/apartments/{apt_id}")
    assert len(apt.json()["rooms"]) == 1


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


def test_invoice_update_and_delete(client):
    create = client.post(
        "/api/apartments/1/billing-years/2025/invoices",
        json={
            "invoice_type": "gas",
            "allocation_key": "personenmonate",
            "label": "Jahresabrechnung",
            "amount": "1200",
            "period_start": "2025-01-01",
            "period_end": "2025-12-31",
            "note": "Original",
        },
    )
    assert create.status_code == 201
    invoice_id = create.json()["id"]
    assert create.json()["allocation_key"] == "personenmonate"

    update = client.put(
        f"/api/invoices/{invoice_id}",
        json={
            "invoice_type": "grundsteuer",
            "allocation_key": "flaeche_qm",
            "label": "Grundsteuer 2025",
            "amount": "900",
            "period_start": "2025-03-01",
            "period_end": "2025-12-31",
            "note": "Geändert",
        },
    )
    assert update.status_code == 200
    data = update.json()
    assert data["invoice_type"] == "grundsteuer"
    assert data["allocation_key"] == "flaeche_qm"

    delete = client.delete(f"/api/invoices/{invoice_id}")
    assert delete.status_code == 204


def test_invoice_pdf_document_lifecycle(client):
    create = client.post(
        "/api/apartments/1/billing-years/2025/invoices",
        json={
            "invoice_type": "strom",
            "label": "Strom",
            "amount": "500",
            "period_start": "2025-01-01",
            "period_end": "2025-12-31",
            "note": "",
        },
    )
    invoice_id = create.json()["id"]

    upload = client.post(
        f"/api/invoices/{invoice_id}/document",
        files={"file": ("beleg.pdf", BytesIO(_minimal_pdf()), "application/pdf")},
    )
    assert upload.status_code == 201
    assert upload.json()["has_document"] is True

    download = client.get(f"/api/invoices/{invoice_id}/document")
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/pdf"

    bad = client.post(
        f"/api/invoices/{invoice_id}/document",
        files={"file": ("beleg.txt", BytesIO(b"not pdf"), "text/plain")},
    )
    assert bad.status_code == 400

    delete_doc = client.delete(f"/api/invoices/{invoice_id}/document")
    assert delete_doc.status_code == 204

    missing = client.get(f"/api/invoices/{invoice_id}/document")
    assert missing.status_code == 404


def test_export_single_party_docx(client):
    response = client.post("/api/apartments/1/billing-years/2025/export/1")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert len(response.content) > 1000


def test_mfh_property_invoice_distribution(client):
    prop = client.post(
        "/api/properties",
        json={
            "name": "Musterstraße 1",
            "street": "Musterstraße 1",
            "city": "12345 Berlin",
            "total_area_sqm": "480",
            "property_type": "mfh",
        },
    )
    assert prop.status_code == 201
    property_id = prop.json()["id"]

    unit1 = client.post(
        f"/api/properties/{property_id}/units",
        json={"name": "Whg 1", "living_area_sqm": "85"},
    )
    unit2 = client.post(
        f"/api/properties/{property_id}/units",
        json={"name": "Whg 2", "living_area_sqm": "95"},
    )
    assert unit1.status_code == 201
    assert unit2.status_code == 201
    apt1_id = unit1.json()["id"]
    apt2_id = unit2.json()["id"]

    client.post(f"/api/apartments/{apt1_id}/billing-years", json={"year": 2025})
    client.post(f"/api/apartments/{apt2_id}/billing-years", json={"year": 2025})
    client.post(f"/api/properties/{property_id}/billing-years", json={"year": 2025})

    client.post(
        f"/api/properties/{property_id}/billing-years/2025/invoices",
        json={
            "invoice_type": "grundsteuer",
            "amount": "4800",
            "period_start": "2025-01-01",
            "period_end": "2025-12-31",
            "label": "Haus",
        },
    )

    client.post(f"/api/apartments/{apt1_id}/rooms", json={"name": "Wohnzimmer"})
    client.post(f"/api/apartments/{apt2_id}/rooms", json={"name": "Wohnzimmer"})

    lease1 = client.post(
        f"/api/apartments/{apt1_id}/leases",
        json={
            "tenant_name": "Mieter A",
            "room_id": 3,
            "persons": 1,
            "move_in": "2025-01-01",
            "move_out": "2025-12-31",
        },
    )
    lease2 = client.post(
        f"/api/apartments/{apt2_id}/leases",
        json={
            "tenant_name": "Mieter B",
            "room_id": 4,
            "persons": 1,
            "move_in": "2025-01-01",
            "move_out": "2025-12-31",
        },
    )
    assert lease1.status_code == 201
    assert lease2.status_code == 201

    preview1 = client.get(f"/api/apartments/{apt1_id}/billing-years/2025/preview").json()
    preview2 = client.get(f"/api/apartments/{apt2_id}/billing-years/2025/preview").json()

    share1 = float(preview1["parties"][0]["total_costs"])
    share2 = float(preview2["parties"][0]["total_costs"])
    assert share1 > 0
    assert share2 > 0
    assert share1 < share2
    assert share1 / share2 == pytest.approx(85 / 95, rel=0.05)
