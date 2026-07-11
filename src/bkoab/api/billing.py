from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session, joinedload

from bkoab.config import EXPORTS_DIR, LETTERHEADS_DIR
from bkoab.database import get_db
from bkoab.models import AdvancePayment, Apartment, BillingYear, Invoice, LandlordProfile, Lease, Room
from bkoab.schemas import (
    INVOICE_TYPE_LABELS,
    AdvancePaymentBulkUpdate,
    AdvancePaymentMatrixRow,
    BillingYearCreate,
    BillingYearRead,
    InvoiceCreate,
    InvoiceRead,
    InvoiceUpdate,
    SettlementPreview,
)
from bkoab.services.allocation import occupied_months_in_year
from bkoab.services.docx_export import PersonPeriodLine, generate_settlement_docx, settlement_docx_bytes
from bkoab.services.person_periods import ensure_default_person_periods
from bkoab.services.proration import prorate_amount
from bkoab.services.settlement import build_settlement_preview

router = APIRouter(prefix="/api", tags=["billing"])


def _settlement_filename(year: int, tenant_name: str) -> str:
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in tenant_name)
    return f"Abrechnung_{year}_{safe_name}.docx"


def _build_party_settlement_docx(db: Session, apartment_id: int, year: int, lease_id: int):
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")

    lease = (
        db.query(Lease)
        .join(Room)
        .options(joinedload(Lease.person_periods), joinedload(Lease.tenant), joinedload(Lease.room))
        .filter(Lease.id == lease_id, Room.apartment_id == apartment_id)
        .first()
    )
    if not lease:
        raise HTTPException(404, "Mietvertrag nicht gefunden")

    ensure_default_person_periods(lease, db)
    landlord = db.query(LandlordProfile).first()
    preview = build_settlement_preview(db, apartment_id, year)
    party = next((item for item in preview.parties if item.lease_id == lease_id), None)
    if not party:
        raise HTTPException(404, "Keine Abrechnung für diese Mietpartei im Abrechnungsjahr")

    logo_path = None
    if landlord and landlord.logo_filename:
        candidate = LETTERHEADS_DIR / landlord.logo_filename
        if candidate.exists():
            logo_path = str(candidate)

    person_period_lines = [
        PersonPeriodLine(
            valid_from=period.valid_from.isoformat(),
            valid_to=period.valid_to.isoformat() if period.valid_to else None,
            persons=period.persons,
        )
        for period in lease.person_periods
    ]

    doc = generate_settlement_docx(
        preview=preview,
        party=party,
        landlord_name=landlord.name if landlord else apartment.account_holder or "Vermieter",
        landlord_street=landlord.street if landlord else apartment.street,
        landlord_city=landlord.city if landlord else apartment.city,
        landlord_phone=landlord.phone if landlord else "",
        landlord_email=landlord.email if landlord else "",
        apartment_street=apartment.street,
        apartment_city=apartment.city,
        apartment_iban=apartment.iban,
        apartment_account_holder=apartment.account_holder,
        payment_reference_hint=apartment.payment_reference_hint,
        payment_text_template=landlord.payment_text_template if landlord else "",
        logo_path=logo_path,
        person_period_lines=person_period_lines,
    )
    filename = _settlement_filename(year, party.tenant_name)
    return doc, filename


def _get_or_create_billing_year(db: Session, apartment_id: int, year: int) -> BillingYear:
    billing_year = _get_billing_year(db, apartment_id, year)
    if not billing_year:
        billing_year = BillingYear(apartment_id=apartment_id, year=year)
        db.add(billing_year)
        db.commit()
        db.refresh(billing_year)
    return billing_year


def _get_billing_year(db: Session, apartment_id: int, year: int) -> BillingYear | None:
    return (
        db.query(BillingYear)
        .filter(BillingYear.apartment_id == apartment_id, BillingYear.year == year)
        .first()
    )


@router.get("/apartments/{apartment_id}/billing-years", response_model=list[BillingYearRead])
def list_billing_years(apartment_id: int, db: Session = Depends(get_db)):
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")
    years = (
        db.query(BillingYear)
        .filter(BillingYear.apartment_id == apartment_id)
        .order_by(BillingYear.year.desc())
        .all()
    )
    return [BillingYearRead.model_validate(y) for y in years]


@router.post("/apartments/{apartment_id}/billing-years", response_model=BillingYearRead, status_code=201)
def create_billing_year(apartment_id: int, payload: BillingYearCreate, db: Session = Depends(get_db)):
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")
    existing = _get_billing_year(db, apartment_id, payload.year)
    if existing:
        raise HTTPException(409, f"Abrechnung für {payload.year} existiert bereits")
    billing_year = BillingYear(apartment_id=apartment_id, year=payload.year)
    db.add(billing_year)
    db.commit()
    db.refresh(billing_year)
    return BillingYearRead.model_validate(billing_year)


@router.get("/apartments/{apartment_id}/billing-years/{year}", response_model=BillingYearRead)
def get_billing_year(apartment_id: int, year: int, db: Session = Depends(get_db)):
    billing_year = _get_billing_year(db, apartment_id, year)
    if not billing_year:
        raise HTTPException(404, f"Abrechnung für {year} nicht angelegt")
    return BillingYearRead.model_validate(billing_year)


def _invoice_to_read(invoice: Invoice, year: int) -> InvoiceRead:
    prorated, _ = prorate_amount(float(invoice.amount), invoice.period_start, invoice.period_end, year)
    return InvoiceRead(
        id=invoice.id,
        billing_year_id=invoice.billing_year_id,
        invoice_type=invoice.invoice_type,
        invoice_type_label=INVOICE_TYPE_LABELS.get(invoice.invoice_type, invoice.invoice_type.value),
        label=invoice.label,
        amount=invoice.amount,
        period_start=invoice.period_start,
        period_end=invoice.period_end,
        note=invoice.note,
        prorated_amount=Decimal(str(round(prorated, 2))),
    )


@router.get("/apartments/{apartment_id}/billing-years/{year}/invoices", response_model=list[InvoiceRead])
def list_invoices(apartment_id: int, year: int, db: Session = Depends(get_db)):
    billing_year = _get_or_create_billing_year(db, apartment_id, year)
    invoices = db.query(Invoice).filter(Invoice.billing_year_id == billing_year.id).all()
    return [_invoice_to_read(inv, year) for inv in invoices]


@router.post("/apartments/{apartment_id}/billing-years/{year}/invoices", response_model=InvoiceRead, status_code=201)
def create_invoice(apartment_id: int, year: int, payload: InvoiceCreate, db: Session = Depends(get_db)):
    if payload.period_start > payload.period_end:
        raise HTTPException(400, "Rechnungszeitraum ungültig")
    billing_year = _get_or_create_billing_year(db, apartment_id, year)
    invoice = Invoice(
        billing_year_id=billing_year.id,
        invoice_type=payload.invoice_type,
        label=payload.label,
        amount=payload.amount,
        period_start=payload.period_start,
        period_end=payload.period_end,
        note=payload.note,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return _invoice_to_read(invoice, year)


@router.put("/invoices/{invoice_id}", response_model=InvoiceRead)
def update_invoice(invoice_id: int, payload: InvoiceUpdate, db: Session = Depends(get_db)):
    if payload.period_start > payload.period_end:
        raise HTTPException(400, "Rechnungszeitraum ungültig")
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Rechnung nicht gefunden")
    billing_year = db.get(BillingYear, invoice.billing_year_id)
    if not billing_year:
        raise HTTPException(404, "Abrechnungsjahr nicht gefunden")

    invoice.invoice_type = payload.invoice_type
    invoice.label = payload.label
    invoice.amount = payload.amount
    invoice.period_start = payload.period_start
    invoice.period_end = payload.period_end
    invoice.note = payload.note
    db.commit()
    db.refresh(invoice)
    return _invoice_to_read(invoice, billing_year.year)


@router.delete("/invoices/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Rechnung nicht gefunden")
    db.delete(invoice)
    db.commit()


@router.get(
    "/apartments/{apartment_id}/billing-years/{year}/advance-payments",
    response_model=list[AdvancePaymentMatrixRow],
)
def get_advance_payments(apartment_id: int, year: int, db: Session = Depends(get_db)):
    leases = (
        db.query(Lease)
        .join(Room)
        .options(joinedload(Lease.tenant), joinedload(Lease.room))
        .filter(Room.apartment_id == apartment_id)
        .all()
    )
    payments = {
        (p.lease_id, p.month): Decimal(str(p.amount))
        for p in db.query(AdvancePayment).join(Lease).join(Room).filter(Room.apartment_id == apartment_id).all()
    }
    rows = []
    for lease in leases:
        occupied = occupied_months_in_year(lease.move_in, lease.move_out, year)
        if not occupied:
            continue
        months = {m: payments.get((lease.id, m), Decimal("0")) for m in range(1, 13)}
        rows.append(
            AdvancePaymentMatrixRow(
                lease_id=lease.id,
                tenant_name=lease.tenant.name,
                room_name=lease.room.name,
                months=months,
                occupied_months=occupied,
            )
        )
    return rows


@router.put("/apartments/{apartment_id}/billing-years/{year}/advance-payments")
def update_advance_payments(
    apartment_id: int,
    year: int,
    payload: AdvancePaymentBulkUpdate,
    db: Session = Depends(get_db),
):
    leases = db.query(Lease).join(Room).filter(Room.apartment_id == apartment_id).all()
    leases_by_id = {lease.id: lease for lease in leases}
    for item in payload.payments:
        if item.lease_id not in leases_by_id:
            raise HTTPException(400, f"Ungültiger Mietvertrag {item.lease_id}")
        if item.month < 1 or item.month > 12:
            raise HTTPException(400, "Monat muss zwischen 1 und 12 liegen")
        lease = leases_by_id[item.lease_id]
        occupied = occupied_months_in_year(lease.move_in, lease.move_out, year)
        if item.month not in occupied:
            raise HTTPException(
                400,
                f"Vorauszahlung für Monat {item.month} nicht möglich — Mieter nicht im Mietzeitraum",
            )
        existing = (
            db.query(AdvancePayment)
            .filter(AdvancePayment.lease_id == item.lease_id, AdvancePayment.month == item.month)
            .first()
        )
        if existing:
            existing.amount = item.amount
        else:
            db.add(AdvancePayment(lease_id=item.lease_id, month=item.month, amount=item.amount))
    db.commit()
    return {"ok": True}


@router.get(
    "/apartments/{apartment_id}/billing-years/{year}/preview",
    response_model=SettlementPreview,
)
def preview_settlement(apartment_id: int, year: int, db: Session = Depends(get_db)):
    try:
        return build_settlement_preview(db, apartment_id, year)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/apartments/{apartment_id}/billing-years/{year}/export/{lease_id}")
def export_settlement_for_party(apartment_id: int, year: int, lease_id: int, db: Session = Depends(get_db)):
    doc, filename = _build_party_settlement_docx(db, apartment_id, year, lease_id)
    content = settlement_docx_bytes(doc)

    export_dir = EXPORTS_DIR / str(apartment_id) / str(year)
    export_dir.mkdir(parents=True, exist_ok=True)
    (export_dir / filename).write_bytes(content)

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/apartments/{apartment_id}/billing-years/{year}/export")
def export_settlements(apartment_id: int, year: int, db: Session = Depends(get_db)):
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")

    preview = build_settlement_preview(db, apartment_id, year)
    export_dir = EXPORTS_DIR / str(apartment_id) / str(year)
    export_dir.mkdir(parents=True, exist_ok=True)

    generated = []
    for party in preview.parties:
        doc, filename = _build_party_settlement_docx(db, apartment_id, year, party.lease_id)
        path = export_dir / filename
        path.write_bytes(settlement_docx_bytes(doc))
        generated.append({"lease_id": party.lease_id, "tenant_name": party.tenant_name, "filename": filename})

    return {"files": generated, "export_dir": str(export_dir)}


@router.get("/apartments/{apartment_id}/billing-years/{year}/export/{filename}")
def download_export(apartment_id: int, year: int, filename: str):
    path = EXPORTS_DIR / str(apartment_id) / str(year) / filename
    if not path.exists():
        raise HTTPException(404, "Datei nicht gefunden")
    return FileResponse(path, filename=filename, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
