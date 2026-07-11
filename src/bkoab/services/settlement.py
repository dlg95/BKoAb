from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from bkoab.models import AdvancePayment, Apartment, BillingYear, Invoice, Lease, Room, Tenant
from bkoab.schemas import (
    INVOICE_TYPE_LABELS,
    CostLineItem,
    InvoiceType,
    PartySettlement,
    SettlementPreview,
)
from bkoab.services.allocation import LeasePeriod, compute_head_months
from bkoab.services.proration import prorate_amount


@dataclass
class InvoiceData:
    id: int
    label: str
    amount: float
    period_start: date
    period_end: date


def _money(value: Decimal | float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _invoice_label(invoice_type: InvoiceType, label: str) -> str:
    base = INVOICE_TYPE_LABELS.get(invoice_type, invoice_type.value)
    return f"{base} — {label}" if label else base


def build_settlement_preview(db: Session, apartment_id: int, year: int) -> SettlementPreview:
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise ValueError("Wohnung nicht gefunden")

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

    rooms = db.query(Room).filter(Room.apartment_id == apartment_id).all()
    room_ids = [room.id for room in rooms]

    leases_db = (
        db.query(Lease)
        .join(Tenant)
        .join(Room)
        .filter(Room.apartment_id == apartment_id)
        .all()
    )

    lease_periods: list[LeasePeriod] = []
    for lease in leases_db:
        lease_periods.append(
            LeasePeriod(
                lease_id=lease.id,
                tenant_name=lease.tenant.name,
                room_id=lease.room_id,
                room_name=lease.room.name,
                persons=lease.persons,
                move_in=lease.move_in,
                move_out=lease.move_out,
            )
        )

    party_head_months, landlord_vacancy, total_head_months = compute_head_months(
        lease_periods, room_ids, year
    )

    warnings: list[str] = []
    if total_head_months == 0:
        warnings.append("Keine Kopfmonate im Abrechnungszeitraum ermittelt")

    invoices = db.query(Invoice).filter(Invoice.billing_year_id == billing_year.id).all()
    invoice_data: list[tuple[InvoiceData, float, str | None]] = []
    for invoice in invoices:
        prorated, warning = prorate_amount(
            float(invoice.amount),
            invoice.period_start,
            invoice.period_end,
            year,
        )
        if warning:
            warnings.append(f"{_invoice_label(invoice.invoice_type, invoice.label)}: {warning}")
        invoice_data.append(
            (
                InvoiceData(
                    id=invoice.id,
                    label=_invoice_label(invoice.invoice_type, invoice.label),
                    amount=float(invoice.amount),
                    period_start=invoice.period_start,
                    period_end=invoice.period_end,
                ),
                prorated,
                warning,
            )
        )

    advance_by_lease: dict[int, Decimal] = {}
    for payment in db.query(AdvancePayment).join(Lease).join(Room).filter(
        Room.apartment_id == apartment_id
    ).all():
        advance_by_lease[payment.lease_id] = advance_by_lease.get(
            payment.lease_id, Decimal("0")
        ) + Decimal(str(payment.amount))

    parties: list[PartySettlement] = []
    active_leases = {lp.lease_id: lp for lp in lease_periods if party_head_months.get(lp.lease_id, 0) > 0}

    for lease_id, lease_info in active_leases.items():
        hm = party_head_months.get(lease_id, Decimal("0"))
        cost_lines: list[CostLineItem] = []
        total_costs = Decimal("0")

        for inv, prorated, _ in invoice_data:
            if total_head_months > 0:
                share = _money(Decimal(str(prorated)) * hm / total_head_months)
            else:
                share = Decimal("0")
            cost_lines.append(
                CostLineItem(
                    invoice_id=inv.id,
                    label=inv.label,
                    total_prorated=_money(prorated),
                    party_head_months=hm,
                    party_share=share,
                )
            )
            total_costs += share

        advance_total = _money(advance_by_lease.get(lease_id, Decimal("0")))
        balance = _money(total_costs - advance_total)
        parties.append(
            PartySettlement(
                lease_id=lease_id,
                tenant_name=lease_info.tenant_name,
                room_name=lease_info.room_name,
                head_months=hm,
                cost_lines=cost_lines,
                total_costs=_money(total_costs),
                total_advance_payments=advance_total,
                balance=balance,
                balance_type="nachzahlung" if balance > 0 else "guthaben" if balance < 0 else "ausgeglichen",
            )
        )

    parties.sort(key=lambda p: p.tenant_name)

    return SettlementPreview(
        apartment_id=apartment_id,
        year=year,
        total_head_months=total_head_months,
        landlord_vacancy_head_months=landlord_vacancy,
        parties=parties,
        warnings=warnings,
    )
