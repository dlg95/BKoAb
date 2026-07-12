from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session, joinedload

from bkoab.config import EXPORTS_DIR, INVOICES_DIR, LETTERHEADS_DIR, MAX_INVOICE_PDF_BYTES
from bkoab.database import get_db
from bkoab.models import (
    AdvancePayment,
    AllocationScope,
    Apartment,
    BillingYear,
    Invoice,
    LandlordProfile,
    Lease,
    Property,
    PropertyBillingYear,
    Room,
)
from bkoab.schemas import (
    ALLOCATION_KEY_LABELS,
    INVOICE_TYPE_LABELS,
    AdvancePaymentBulkUpdate,
    AdvancePaymentMatrixRow,
    BillingYearCreate,
    BillingYearRead,
    InvoiceCreate,
    InvoiceRead,
    InvoiceUpdate,
    PropertyBillingYearRead,
    SettlementPreview,
    default_allocation_key,
)
from bkoab.services.allocation import occupied_months_in_year
from bkoab.services.docx_export import PersonPeriodLine, generate_settlement_docx, settlement_docx_bytes
from bkoab.services.person_periods import ensure_default_person_periods
from bkoab.services.proration import prorate_amount
from bkoab.services.settlement import build_settlement_preview

router = APIRouter(prefix="/api", tags=["billing"])


def _invoice_pdf_path(invoice_id: int):
    return INVOICES_DIR / f"{invoice_id}.pdf"


def _delete_invoice_pdf(invoice_id: int) -> None:
    path = _invoice_pdf_path(invoice_id)
    if path.exists():
        path.unlink()


def _safe_filename_part(value: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in value).strip("_") or "Unbenannt"


def _settlement_filename(year: int, tenant_name: str, room_name: str) -> str:
    safe_tenant = _safe_filename_part(tenant_name)
    safe_room = _safe_filename_part(room_name)
    return f"Abrechnung_{year}_{safe_tenant}_{safe_room}.docx"


def _invoice_year(invoice: Invoice, db: Session) -> int:
    if invoice.billing_year_id:
        billing_year = db.get(BillingYear, invoice.billing_year_id)
        if billing_year:
            return billing_year.year
    if invoice.property_billing_year_id:
        prop_year = db.get(PropertyBillingYear, invoice.property_billing_year_id)
        if prop_year:
            return prop_year.year
    raise HTTPException(400, "Abrechnungsjahr nicht ermittelbar")


def _invoice_to_read(invoice: Invoice, year: int) -> InvoiceRead:
    prorated, _ = prorate_amount(float(invoice.amount), invoice.period_start, invoice.period_end, year)
    return InvoiceRead(
        id=invoice.id,
        billing_year_id=invoice.billing_year_id,
        property_billing_year_id=invoice.property_billing_year_id,
        invoice_type=invoice.invoice_type,
        invoice_type_label=INVOICE_TYPE_LABELS.get(invoice.invoice_type, invoice.invoice_type.value),
        allocation_key=invoice.allocation_key,
        allocation_key_label=ALLOCATION_KEY_LABELS.get(invoice.allocation_key, invoice.allocation_key.value),
        allocation_scope=invoice.allocation_scope,
        label=invoice.label,
        amount=invoice.amount,
        period_start=invoice.period_start,
        period_end=invoice.period_end,
        note=invoice.note,
        prorated_amount=Decimal(str(round(prorated, 2))),
        has_document=invoice.has_document,
    )


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
        landlord_name=landlord.name if landlord else "Vermieter",
        landlord_street=landlord.street if landlord else apartment.street,
        landlord_city=landlord.city if landlord else apartment.city,
        landlord_phone=landlord.phone if landlord else "",
        landlord_email=landlord.email if landlord else "",
        apartment_street=apartment.street,
        apartment_city=apartment.city,
        apartment_iban="",
        apartment_account_holder=landlord.name if landlord else "Vermieter",
        payment_reference_hint="",
        payment_text_template=landlord.payment_text_template if landlord else "",
        logo_path=logo_path,
        person_period_lines=person_period_lines,
    )
    filename = _settlement_filename(year, party.tenant_name, party.room_name)
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


def _get_or_create_property_billing_year(db: Session, property_id: int, year: int) -> PropertyBillingYear:
    billing_year = (
        db.query(PropertyBillingYear)
        .filter(PropertyBillingYear.property_id == property_id, PropertyBillingYear.year == year)
        .first()
    )
    if not billing_year:
        billing_year = PropertyBillingYear(property_id=property_id, year=year)
        db.add(billing_year)
        db.commit()
        db.refresh(billing_year)
    return billing_year


def _create_invoice_model(payload: InvoiceCreate, *, billing_year_id: int | None, property_billing_year_id: int | None):
    allocation_key = payload.allocation_key or default_allocation_key(payload.invoice_type)
    return Invoice(
        billing_year_id=billing_year_id,
        property_billing_year_id=property_billing_year_id,
        invoice_type=payload.invoice_type,
        allocation_key=allocation_key,
        allocation_scope=payload.allocation_scope,
        label=payload.label,
        amount=payload.amount,
        period_start=payload.period_start,
        period_end=payload.period_end,
        note=payload.note,
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


@router.get("/properties/{property_id}/billing-years", response_model=list[PropertyBillingYearRead])
def list_property_billing_years(property_id: int, db: Session = Depends(get_db)):
    prop = db.get(Property, property_id)
    if not prop:
        raise HTTPException(404, "Gebäude nicht gefunden")
    years = (
        db.query(PropertyBillingYear)
        .filter(PropertyBillingYear.property_id == property_id)
        .order_by(PropertyBillingYear.year.desc())
        .all()
    )
    return [PropertyBillingYearRead.model_validate(y) for y in years]


@router.post("/properties/{property_id}/billing-years", response_model=PropertyBillingYearRead, status_code=201)
def create_property_billing_year(property_id: int, payload: BillingYearCreate, db: Session = Depends(get_db)):
    prop = db.get(Property, property_id)
    if not prop:
        raise HTTPException(404, "Gebäude nicht gefunden")
    existing = (
        db.query(PropertyBillingYear)
        .filter(PropertyBillingYear.property_id == property_id, PropertyBillingYear.year == payload.year)
        .first()
    )
    if existing:
        raise HTTPException(409, f"Gebäude-Abrechnung für {payload.year} existiert bereits")
    billing_year = PropertyBillingYear(property_id=property_id, year=payload.year)
    db.add(billing_year)
    db.commit()
    db.refresh(billing_year)
    return PropertyBillingYearRead.model_validate(billing_year)


@router.get("/properties/{property_id}/billing-years/{year}", response_model=PropertyBillingYearRead)
def get_property_billing_year(property_id: int, year: int, db: Session = Depends(get_db)):
    prop = db.get(Property, property_id)
    if not prop:
        raise HTTPException(404, "Gebäude nicht gefunden")
    billing_year = _get_or_create_property_billing_year(db, property_id, year)
    return PropertyBillingYearRead.model_validate(billing_year)


@router.get("/apartments/{apartment_id}/billing-years/{year}/invoices", response_model=list[InvoiceRead])
def list_invoices(apartment_id: int, year: int, db: Session = Depends(get_db)):
    billing_year = _get_or_create_billing_year(db, apartment_id, year)
    invoices = db.query(Invoice).filter(Invoice.billing_year_id == billing_year.id).all()
    return [_invoice_to_read(inv, year) for inv in invoices]


@router.get("/properties/{property_id}/billing-years/{year}/invoices", response_model=list[InvoiceRead])
def list_property_invoices(property_id: int, year: int, db: Session = Depends(get_db)):
    billing_year = _get_or_create_property_billing_year(db, property_id, year)
    invoices = db.query(Invoice).filter(Invoice.property_billing_year_id == billing_year.id).all()
    return [_invoice_to_read(inv, year) for inv in invoices]


@router.post("/apartments/{apartment_id}/billing-years/{year}/invoices", response_model=InvoiceRead, status_code=201)
def create_invoice(apartment_id: int, year: int, payload: InvoiceCreate, db: Session = Depends(get_db)):
    if payload.period_start > payload.period_end:
        raise HTTPException(400, "Rechnungszeitraum ungültig")
    billing_year = _get_or_create_billing_year(db, apartment_id, year)
    invoice = _create_invoice_model(
        payload,
        billing_year_id=billing_year.id,
        property_billing_year_id=None,
    )
    invoice.allocation_scope = AllocationScope.UNIT
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return _invoice_to_read(invoice, year)


@router.post("/properties/{property_id}/billing-years/{year}/invoices", response_model=InvoiceRead, status_code=201)
def create_property_invoice(property_id: int, year: int, payload: InvoiceCreate, db: Session = Depends(get_db)):
    if payload.period_start > payload.period_end:
        raise HTTPException(400, "Rechnungszeitraum ungültig")
    billing_year = _get_or_create_property_billing_year(db, property_id, year)
    invoice = _create_invoice_model(
        payload,
        billing_year_id=None,
        property_billing_year_id=billing_year.id,
    )
    invoice.allocation_scope = AllocationScope.PROPERTY
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

    invoice.invoice_type = payload.invoice_type
    invoice.label = payload.label
    invoice.amount = payload.amount
    invoice.period_start = payload.period_start
    invoice.period_end = payload.period_end
    invoice.note = payload.note
    invoice.allocation_key = payload.allocation_key or default_allocation_key(payload.invoice_type)
    if invoice.billing_year_id:
        invoice.allocation_scope = AllocationScope.UNIT
    elif invoice.property_billing_year_id:
        invoice.allocation_scope = AllocationScope.PROPERTY
    db.commit()
    db.refresh(invoice)
    return _invoice_to_read(invoice, _invoice_year(invoice, db))


@router.delete("/invoices/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Rechnung nicht gefunden")
    _delete_invoice_pdf(invoice_id)
    db.delete(invoice)
    db.commit()


@router.post("/invoices/{invoice_id}/document", status_code=201)
async def upload_invoice_document(invoice_id: int, file: UploadFile, db: Session = Depends(get_db)):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Rechnung nicht gefunden")

    content_type = file.content_type or ""
    if content_type != "application/pdf" and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "Nur PDF-Dateien sind erlaubt")

    data = await file.read()
    if len(data) > MAX_INVOICE_PDF_BYTES:
        raise HTTPException(400, f"Datei zu groß (max. {MAX_INVOICE_PDF_BYTES // (1024 * 1024)} MB)")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Ungültige PDF-Datei")

    INVOICES_DIR.mkdir(parents=True, exist_ok=True)
    _invoice_pdf_path(invoice_id).write_bytes(data)
    invoice.has_document = True
    db.commit()
    return {"ok": True, "has_document": True}


@router.get("/invoices/{invoice_id}/document")
def download_invoice_document(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Rechnung nicht gefunden")
    path = _invoice_pdf_path(invoice_id)
    if not path.exists():
        raise HTTPException(404, "Kein Beleg vorhanden")
    return FileResponse(path, media_type="application/pdf", filename=f"Beleg_{invoice_id}.pdf")


@router.delete("/invoices/{invoice_id}/document", status_code=204)
def delete_invoice_document(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Rechnung nicht gefunden")
    _delete_invoice_pdf(invoice_id)
    invoice.has_document = False
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
