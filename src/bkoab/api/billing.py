from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from bkoab.config import EXPORTS_DIR, LETTERHEADS_DIR
from bkoab.database import get_db
from bkoab.models import AdvancePayment, Apartment, BillingYear, Invoice, LandlordProfile, Lease, Room
from bkoab.schemas import (
    INVOICE_TYPE_LABELS,
    AdvancePaymentBulkUpdate,
    AdvancePaymentMatrixRow,
    BillingYearRead,
    InvoiceCreate,
    InvoiceRead,
    SettlementPreview,
)
from bkoab.services.docx_export import generate_settlement_docx
from bkoab.services.proration import prorate_amount
from bkoab.services.settlement import build_settlement_preview

router = APIRouter(prefix="/api", tags=["billing"])


def _get_or_create_billing_year(db: Session, apartment_id: int, year: int) -> BillingYear:
    billing_year = (
        db.query(BillingYear)
        .filter(BillingYear.apartment_id == apartment_id, BillingYear.year == year)
        .first()
    )
    if not billing_year:
        billing_year = BillingYear(apartment_id=apartment_id, year=year)
        db.add(billing_year)
        db.commit()
        db.refresh(billing_year)
    return billing_year


@router.get("/apartments/{apartment_id}/billing-years/{year}", response_model=BillingYearRead)
def get_billing_year(apartment_id: int, year: int, db: Session = Depends(get_db)):
    billing_year = _get_or_create_billing_year(db, apartment_id, year)
    return BillingYearRead.model_validate(billing_year)


@router.get("/apartments/{apartment_id}/billing-years/{year}/invoices", response_model=list[InvoiceRead])
def list_invoices(apartment_id: int, year: int, db: Session = Depends(get_db)):
    billing_year = _get_or_create_billing_year(db, apartment_id, year)
    invoices = db.query(Invoice).filter(Invoice.billing_year_id == billing_year.id).all()
    result = []
    for inv in invoices:
        prorated, _ = prorate_amount(float(inv.amount), inv.period_start, inv.period_end, year)
        result.append(
            InvoiceRead(
                id=inv.id,
                billing_year_id=inv.billing_year_id,
                invoice_type=inv.invoice_type,
                invoice_type_label=INVOICE_TYPE_LABELS.get(inv.invoice_type, inv.invoice_type.value),
                label=inv.label,
                amount=inv.amount,
                period_start=inv.period_start,
                period_end=inv.period_end,
                note=inv.note,
                prorated_amount=Decimal(str(round(prorated, 2))),
            )
        )
    return result


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
        months = {m: payments.get((lease.id, m), Decimal("0")) for m in range(1, 13)}
        rows.append(
            AdvancePaymentMatrixRow(
                lease_id=lease.id,
                tenant_name=lease.tenant.name,
                room_name=lease.room.name,
                months=months,
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
    lease_ids = {
        lease.id
        for lease in db.query(Lease).join(Room).filter(Room.apartment_id == apartment_id).all()
    }
    for item in payload.payments:
        if item.lease_id not in lease_ids:
            raise HTTPException(400, f"Ungültiger Mietvertrag {item.lease_id}")
        if item.month < 1 or item.month > 12:
            raise HTTPException(400, "Monat muss zwischen 1 und 12 liegen")
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


@router.post("/apartments/{apartment_id}/billing-years/{year}/export")
def export_settlements(apartment_id: int, year: int, db: Session = Depends(get_db)):
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")

    landlord = db.query(LandlordProfile).first()
    preview = build_settlement_preview(db, apartment_id, year)

    export_dir = EXPORTS_DIR / str(apartment_id) / str(year)
    export_dir.mkdir(parents=True, exist_ok=True)

    generated = []
    for party in preview.parties:
        logo_path = None
        if landlord and landlord.logo_filename:
            candidate = LETTERHEADS_DIR / landlord.logo_filename
            if candidate.exists():
                logo_path = str(candidate)

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
        )
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in party.tenant_name)
        filename = f"Abrechnung_{year}_{safe_name}.docx"
        path = export_dir / filename
        doc.save(path)
        generated.append({"lease_id": party.lease_id, "tenant_name": party.tenant_name, "filename": filename})

    return {"files": generated, "export_dir": str(export_dir)}


@router.get("/apartments/{apartment_id}/billing-years/{year}/export/{filename}")
def download_export(apartment_id: int, year: int, filename: str):
    path = EXPORTS_DIR / str(apartment_id) / str(year) / filename
    if not path.exists():
        raise HTTPException(404, "Datei nicht gefunden")
    return FileResponse(path, filename=filename, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
