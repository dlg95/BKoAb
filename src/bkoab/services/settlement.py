from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session, joinedload

from bkoab.models import (
    AdvancePayment,
    AllocationKey,
    Apartment,
    BillingYear,
    Invoice,
    Lease,
    PropertyBillingYear,
    Room,
    Tenant,
)
from bkoab.schemas import (
    INVOICE_TYPE_LABELS,
    AllocationKey as AllocationKeySchema,
    CostLineItem,
    InvoiceType,
    PartySettlement,
    SettlementPreview,
)
from bkoab.services.allocation import (
    UnitArea,
    compute_area_shares,
    compute_head_months,
    compute_room_area_shares,
    occupied_months_in_year,
)
from bkoab.services.person_periods import ensure_default_person_periods, lease_to_allocation_period
from bkoab.services.proration import prorate_amount


@dataclass
class ProcessedInvoice:
    id: int
    label: str
    allocation_key: AllocationKey
    total_prorated: Decimal
    has_document: bool


def _money(value: Decimal | float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _invoice_label(invoice_type: InvoiceType, label: str) -> str:
    base = INVOICE_TYPE_LABELS.get(invoice_type, invoice_type.value)
    return f"{base} — {label}" if label else base


def _decimal_or_zero(value) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _process_invoices(invoices: list[Invoice], year: int, warnings: list[str]) -> list[ProcessedInvoice]:
    processed: list[ProcessedInvoice] = []
    for invoice in invoices:
        prorated, warning = prorate_amount(
            float(invoice.amount),
            invoice.period_start,
            invoice.period_end,
            year,
        )
        label = _invoice_label(invoice.invoice_type, invoice.label)
        if warning:
            warnings.append(f"{label}: {warning}")
        processed.append(
            ProcessedInvoice(
                id=invoice.id,
                label=label,
                allocation_key=invoice.allocation_key,
                total_prorated=_money(prorated),
                has_document=invoice.has_document,
            )
        )
    return processed


def _property_units(db: Session, property_id: int) -> list[Apartment]:
    return db.query(Apartment).filter(Apartment.property_id == property_id).all()


def _unit_pm_share(
    prorated: Decimal,
    lease_id: int,
    party_head_months: dict[int, Decimal],
    total_head_months: Decimal,
) -> tuple[Decimal, Decimal, Decimal]:
    hm = party_head_months.get(lease_id, Decimal("0"))
    if total_head_months > 0 and hm > 0:
        share = _money(prorated * hm / total_head_months)
    else:
        share = Decimal("0")
    return hm, total_head_months, share


def _unit_area_share(
    prorated: Decimal,
    lease_id: int,
    active_lease_ids: list[int],
    lease_room_areas: dict[int, Decimal],
) -> tuple[Decimal, Decimal, Decimal]:
    room_area, total_area, ratio = compute_room_area_shares(lease_room_areas, lease_id)
    if total_area > 0 and room_area > 0:
        return room_area, total_area, _money(prorated * ratio)

    count = len(active_lease_ids)
    if count > 0 and lease_id in active_lease_ids:
        return Decimal("1"), Decimal(count), _money(prorated / Decimal(count))
    return Decimal("0"), Decimal(count), Decimal("0")


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
        raise ValueError(f"Abrechnung für {year} ist nicht angelegt")

    rooms = db.query(Room).filter(Room.apartment_id == apartment_id).all()
    room_ids = [room.id for room in rooms]
    room_by_id = {room.id: room for room in rooms}

    leases_db = (
        db.query(Lease)
        .join(Tenant)
        .join(Room)
        .options(joinedload(Lease.tenant), joinedload(Lease.room), joinedload(Lease.person_periods))
        .filter(Room.apartment_id == apartment_id)
        .all()
    )

    lease_periods = []
    for lease in leases_db:
        ensure_default_person_periods(lease, db)
        lease_periods.append(lease_to_allocation_period(lease))

    party_head_months, landlord_vacancy, total_head_months = compute_head_months(
        lease_periods, room_ids, year
    )

    warnings: list[str] = []
    if total_head_months == 0:
        warnings.append("Keine Personenmonate im Abrechnungszeitraum ermittelt")

    unit_invoices = db.query(Invoice).filter(Invoice.billing_year_id == billing_year.id).all()
    processed_unit = _process_invoices(unit_invoices, year, warnings)

    unit_area = _decimal_or_zero(apartment.living_area_sqm)
    total_property_area: Decimal | None = None
    property_share_ratio = Decimal("0")
    processed_property: list[ProcessedInvoice] = []

    if apartment.property_id:
        property_units = _property_units(db, apartment.property_id)
        unit_areas = [
            UnitArea(unit_id=u.id, living_area_sqm=_decimal_or_zero(u.living_area_sqm))
            for u in property_units
        ]
        unit_area, total_property_area, property_share_ratio = compute_area_shares(unit_areas, apartment_id)

        if total_property_area <= 0:
            warnings.append("Keine Wohnflächen am Gebäude hinterlegt — Hauskosten können nicht verteilt werden")

        prop_billing_year = (
            db.query(PropertyBillingYear)
            .filter(
                PropertyBillingYear.property_id == apartment.property_id,
                PropertyBillingYear.year == year,
            )
            .first()
        )
        if prop_billing_year:
            property_invoices = (
                db.query(Invoice)
                .filter(Invoice.property_billing_year_id == prop_billing_year.id)
                .all()
            )
            processed_property = _process_invoices(property_invoices, year, warnings)

    lease_occupied_months = {
        lease.id: set(occupied_months_in_year(lease.move_in, lease.move_out, year))
        for lease in leases_db
    }

    advance_by_lease: dict[int, Decimal] = {}
    for payment in db.query(AdvancePayment).join(Lease).join(Room).filter(
        Room.apartment_id == apartment_id
    ).all():
        if payment.month not in lease_occupied_months.get(payment.lease_id, set()):
            continue
        advance_by_lease[payment.lease_id] = advance_by_lease.get(
            payment.lease_id, Decimal("0")
        ) + Decimal(str(payment.amount))

    active_leases = {
        lp.lease_id: lp for lp in lease_periods if party_head_months.get(lp.lease_id, 0) > 0
    }
    active_lease_ids = list(active_leases.keys())

    lease_room_areas: dict[int, Decimal] = {}
    for lease in leases_db:
        if lease.id not in active_lease_ids:
            continue
        room = room_by_id.get(lease.room_id)
        lease_room_areas[lease.id] = _decimal_or_zero(room.area_sqm if room else None)

    parties: list[PartySettlement] = []

    for lease_id, lease_info in active_leases.items():
        hm = party_head_months.get(lease_id, Decimal("0"))
        cost_lines: list[CostLineItem] = []
        total_costs = Decimal("0")

        for inv in processed_unit:
            if inv.allocation_key == AllocationKey.PERSONENMONATE:
                numerator, denominator, share = _unit_pm_share(
                    inv.total_prorated, lease_id, party_head_months, total_head_months
                )
            else:
                numerator, denominator, share = _unit_area_share(
                    inv.total_prorated, lease_id, active_lease_ids, lease_room_areas
                )
            cost_lines.append(
                CostLineItem(
                    invoice_id=inv.id,
                    label=inv.label,
                    allocation_key=AllocationKeySchema(inv.allocation_key.value),
                    total_prorated=inv.total_prorated,
                    party_numerator=numerator,
                    party_denominator=denominator,
                    party_share=share,
                    has_document=inv.has_document,
                )
            )
            total_costs += share

        for inv in processed_property:
            if property_share_ratio <= 0:
                continue
            unit_share = _money(inv.total_prorated * property_share_ratio)
            numerator, denominator, share = _unit_pm_share(
                unit_share, lease_id, party_head_months, total_head_months
            )
            cost_lines.append(
                CostLineItem(
                    invoice_id=inv.id,
                    label=f"{inv.label} (Gebäude)",
                    allocation_key=AllocationKeySchema.FLAECHE_QM,
                    total_prorated=inv.total_prorated,
                    party_numerator=unit_area,
                    party_denominator=total_property_area or Decimal("0"),
                    party_share=share,
                    has_document=inv.has_document,
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
                living_area_sqm=unit_area if unit_area > 0 else None,
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
        total_property_area_sqm=total_property_area,
        unit_area_sqm=unit_area if unit_area > 0 else None,
        parties=parties,
        warnings=warnings,
    )
