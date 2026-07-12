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
    Property,
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
    UnitShareData,
    compute_area_shares,
    compute_direct_assignment_shares,
    compute_equal_unit_shares,
    compute_head_months,
    compute_mea_shares,
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
    property_total_area_sqm: Decimal | None = None,
) -> tuple[Decimal, Decimal, Decimal]:
    room_area, room_total, ratio = compute_room_area_shares(lease_room_areas, lease_id)
    if room_area > 0 and property_total_area_sqm and property_total_area_sqm > 0:
        return room_area, property_total_area_sqm, _money(prorated * room_area / property_total_area_sqm)
    if room_total > 0 and room_area > 0:
        return room_area, room_total, _money(prorated * ratio)

    count = len(active_lease_ids)
    if count > 0 and lease_id in active_lease_ids:
        if property_total_area_sqm and property_total_area_sqm > 0:
            return Decimal("1"), property_total_area_sqm, _money(prorated / Decimal(count))
        return Decimal("1"), Decimal(count), _money(prorated / Decimal(count))
    return Decimal("0"), property_total_area_sqm or Decimal(count), Decimal("0")


def _unit_equal_share(
    prorated: Decimal,
    lease_id: int,
    active_lease_ids: list[int],
) -> tuple[Decimal, Decimal, Decimal]:
    count = len(active_lease_ids)
    if count <= 0 or lease_id not in active_lease_ids:
        return Decimal("0"), Decimal(count), Decimal("0")
    numerator, denominator, ratio = compute_equal_unit_shares(count, True)
    return numerator, denominator, _money(prorated * ratio)


def _unit_direct_assignment_share_by_room(
    prorated: Decimal,
    lease_id: int,
    leases_db: list[Lease],
    room_consumption: dict[int, Decimal],
) -> tuple[Decimal, Decimal, Decimal]:
    lease = next((lease for lease in leases_db if lease.id == lease_id), None)
    if not lease:
        return Decimal("0"), Decimal("0"), Decimal("0")
    numerator, denominator, ratio = compute_direct_assignment_shares(room_consumption, lease.room_id)
    return numerator, denominator, _money(prorated * ratio)


def _apartment_head_months(
    apartment_id: int,
    property_units: list[Apartment],
    property_lease_head_months: dict[int, Decimal],
) -> Decimal:
    apartment_lease_ids: set[int] = set()
    for unit in property_units:
        if unit.id != apartment_id:
            continue
        for room in unit.rooms:
            for lease in room.leases:
                apartment_lease_ids.add(lease.id)
    return sum(
        (property_lease_head_months.get(lease_id, Decimal("0")) for lease_id in apartment_lease_ids),
        Decimal("0"),
    )


def _property_unit_share(
    inv: ProcessedInvoice,
    apartment_id: int,
    property_units: list[Apartment],
    unit_area: Decimal,
    total_property_area: Decimal | None,
    apartment_head_months: Decimal,
    property_total_head_months: Decimal,
    warnings: list[str],
) -> tuple[Decimal, Decimal, Decimal, AllocationKeySchema]:
    """Compute this apartment's share of a property-level invoice."""
    unit_count = len(property_units)

    if inv.allocation_key == AllocationKey.FLAECHE_QM:
        unit_areas = [
            UnitArea(unit_id=u.id, living_area_sqm=_decimal_or_zero(u.living_area_sqm))
            for u in property_units
        ]
        area, total, ratio = compute_area_shares(unit_areas, apartment_id, total_property_area)
        return area, total, _money(inv.total_prorated * ratio), AllocationKeySchema.FLAECHE_QM

    if inv.allocation_key == AllocationKey.WOHNEINHEITEN:
        is_member = any(u.id == apartment_id for u in property_units)
        numerator, denominator, ratio = compute_equal_unit_shares(unit_count, is_member)
        if ratio <= 0:
            warnings.append(f"{inv.label}: Keine Wohneinheiten für gleichmäßige Verteilung")
            return numerator, denominator, Decimal("0"), AllocationKeySchema.WOHNEINHEITEN
        return numerator, denominator, _money(inv.total_prorated * ratio), AllocationKeySchema.WOHNEINHEITEN

    if inv.allocation_key == AllocationKey.DIREKTZUORDNUNG:
        amounts = {u.id: _decimal_or_zero(u.consumption_amount) for u in property_units}
        numerator, denominator, ratio = compute_direct_assignment_shares(amounts, apartment_id)
        if ratio <= 0:
            warnings.append(f"{inv.label}: Keine Verbrauchswerte für Direktzuordnung")
            return numerator, denominator, Decimal("0"), AllocationKeySchema.DIREKTZUORDNUNG
        return numerator, denominator, _money(inv.total_prorated * ratio), AllocationKeySchema.DIREKTZUORDNUNG

    if inv.allocation_key == AllocationKey.MEA:
        units_data = [
            UnitShareData(unit_id=u.id, mea_share=_decimal_or_zero(u.mea_share), consumption_amount=Decimal("0"))
            for u in property_units
        ]
        numerator, denominator, ratio = compute_mea_shares(units_data, apartment_id)
        if ratio <= 0:
            warnings.append(f"{inv.label}: Keine Miteigentumsanteile hinterlegt")
            return numerator, denominator, Decimal("0"), AllocationKeySchema.MEA
        return numerator, denominator, _money(inv.total_prorated * ratio), AllocationKeySchema.MEA

    if inv.allocation_key == AllocationKey.PERSONENMONATE:
        if property_total_head_months <= 0 or apartment_head_months <= 0:
            warnings.append(f"{inv.label}: Keine Personenmonate für Gebäudeverteilung")
            return apartment_head_months, property_total_head_months, Decimal("0"), AllocationKeySchema.PERSONENMONATE
        ratio = (apartment_head_months / property_total_head_months).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        return (
            apartment_head_months,
            property_total_head_months,
            _money(inv.total_prorated * ratio),
            AllocationKeySchema.PERSONENMONATE,
        )

    # Fallback to area
    unit_areas = [
        UnitArea(unit_id=u.id, living_area_sqm=_decimal_or_zero(u.living_area_sqm))
        for u in property_units
    ]
    area, total, ratio = compute_area_shares(unit_areas, apartment_id, total_property_area)
    return area, total, _money(inv.total_prorated * ratio), AllocationKeySchema.FLAECHE_QM


def _lease_split_key_for_property_invoice(allocation_key: AllocationKey) -> AllocationKey:
    if allocation_key == AllocationKey.FLAECHE_QM:
        return AllocationKey.FLAECHE_QM
    if allocation_key == AllocationKey.DIREKTZUORDNUNG:
        return AllocationKey.DIREKTZUORDNUNG
    if allocation_key == AllocationKey.WOHNEINHEITEN:
        return AllocationKey.WOHNEINHEITEN
    return AllocationKey.PERSONENMONATE


def _split_unit_share_among_leases(
    unit_share: Decimal,
    lease_id: int,
    allocation_key: AllocationKey,
    party_head_months: dict[int, Decimal],
    total_head_months: Decimal,
    active_lease_ids: list[int],
    lease_room_areas: dict[int, Decimal],
    leases_db: list[Lease],
    room_consumption: dict[int, Decimal],
    property_total_area: Decimal | None,
    *,
    within_apartment: bool = False,
) -> tuple[Decimal, Decimal, Decimal]:
    """Split an apartment's share of a cost among active leases."""
    apartment_head_months = sum(party_head_months.values(), Decimal("0"))
    pm_total = apartment_head_months if within_apartment else total_head_months

    if allocation_key == AllocationKey.PERSONENMONATE:
        return _unit_pm_share(unit_share, lease_id, party_head_months, pm_total)

    if allocation_key == AllocationKey.WOHNEINHEITEN:
        return _unit_equal_share(unit_share, lease_id, active_lease_ids)

    if allocation_key == AllocationKey.DIREKTZUORDNUNG:
        return _unit_direct_assignment_share_by_room(
            unit_share, lease_id, leases_db, room_consumption
        )

    if allocation_key == AllocationKey.MEA:
        return _unit_pm_share(unit_share, lease_id, party_head_months, pm_total)

    return _unit_area_share(
        unit_share,
        lease_id,
        active_lease_ids,
        lease_room_areas,
        None if within_apartment else property_total_area,
    )


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
    property_total_area: Decimal | None = None
    property_units: list[Apartment] = []
    property_lease_head_months: dict[int, Decimal] = {}
    property_total_head_months = Decimal("0")

    if apartment.property_id:
        prop = db.get(Property, apartment.property_id)
        property_total_area = _decimal_or_zero(prop.total_area_sqm) if prop else None
        if property_total_area <= 0:
            property_total_area = None

        property_units = (
            db.query(Apartment)
            .options(joinedload(Apartment.rooms).joinedload(Room.leases).joinedload(Lease.person_periods))
            .filter(Apartment.property_id == apartment.property_id)
            .all()
        )
        for unit in property_units:
            unit_lease_periods = []
            unit_room_ids = [room.id for room in unit.rooms]
            for room in unit.rooms:
                for lease in room.leases:
                    ensure_default_person_periods(lease, db)
                    unit_lease_periods.append(lease_to_allocation_period(lease))
            unit_party_hm, _, _ = compute_head_months(unit_lease_periods, unit_room_ids, year)
            property_lease_head_months.update(unit_party_hm)
        property_total_head_months = sum(property_lease_head_months.values(), Decimal("0"))

        unit_areas = [
            UnitArea(unit_id=u.id, living_area_sqm=_decimal_or_zero(u.living_area_sqm))
            for u in property_units
        ]
        unit_area, total_property_area, property_share_ratio = compute_area_shares(
            unit_areas,
            apartment_id,
            property_total_area,
        )

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
    room_consumption: dict[int, Decimal] = {}
    for lease in leases_db:
        if lease.id not in active_lease_ids:
            continue
        room = room_by_id.get(lease.room_id)
        lease_room_areas[lease.id] = _decimal_or_zero(room.area_sqm if room else None)
        if room:
            room_consumption[room.id] = _decimal_or_zero(room.consumption_amount)

    apartment_head_months = _apartment_head_months(
        apartment_id, property_units, property_lease_head_months
    )

    parties: list[PartySettlement] = []
    mea_warnings: set[str] = set()

    for lease_id, lease_info in active_leases.items():
        hm = party_head_months.get(lease_id, Decimal("0"))
        cost_lines: list[CostLineItem] = []
        total_costs = Decimal("0")

        for inv in processed_unit:
            if inv.allocation_key == AllocationKey.PERSONENMONATE:
                numerator, denominator, share = _unit_pm_share(
                    inv.total_prorated, lease_id, party_head_months, total_head_months
                )
                display_key = AllocationKeySchema.PERSONENMONATE
            elif inv.allocation_key == AllocationKey.FLAECHE_QM:
                numerator, denominator, share = _unit_area_share(
                    inv.total_prorated,
                    lease_id,
                    active_lease_ids,
                    lease_room_areas,
                    property_total_area,
                )
                display_key = AllocationKeySchema.FLAECHE_QM
            elif inv.allocation_key == AllocationKey.WOHNEINHEITEN:
                numerator, denominator, share = _unit_equal_share(
                    inv.total_prorated, lease_id, active_lease_ids
                )
                display_key = AllocationKeySchema.WOHNEINHEITEN
            elif inv.allocation_key == AllocationKey.DIREKTZUORDNUNG:
                numerator, denominator, share = _unit_direct_assignment_share_by_room(
                    inv.total_prorated, lease_id, leases_db, room_consumption
                )
                display_key = AllocationKeySchema.DIREKTZUORDNUNG
            elif inv.allocation_key == AllocationKey.MEA:
                if not apartment.property_id:
                    mea_warnings.add(f"{inv.label}: MEA-Schlüssel gilt nur auf Gebäudeebene")
                numerator, denominator, share = Decimal("0"), Decimal("0"), Decimal("0")
                display_key = AllocationKeySchema.MEA
            else:
                numerator, denominator, share = _unit_area_share(
                    inv.total_prorated,
                    lease_id,
                    active_lease_ids,
                    lease_room_areas,
                    property_total_area,
                )
                display_key = AllocationKeySchema.FLAECHE_QM

            cost_lines.append(
                CostLineItem(
                    invoice_id=inv.id,
                    label=inv.label,
                    allocation_key=display_key,
                    total_prorated=inv.total_prorated,
                    party_numerator=numerator,
                    party_denominator=denominator,
                    party_share=share,
                    has_document=inv.has_document,
                )
            )
            total_costs += share

        for inv in processed_property:
            prop_numerator, prop_denominator, unit_share, prop_key = _property_unit_share(
                inv,
                apartment_id,
                property_units,
                unit_area,
                total_property_area,
                apartment_head_months,
                property_total_head_months,
                warnings,
            )
            if unit_share <= 0:
                continue

            lease_split_key = _lease_split_key_for_property_invoice(inv.allocation_key)
            numerator, denominator, share = _split_unit_share_among_leases(
                unit_share,
                lease_id,
                lease_split_key,
                party_head_months,
                total_head_months,
                active_lease_ids,
                lease_room_areas,
                leases_db,
                room_consumption,
                property_total_area,
                within_apartment=True,
            )
            cost_lines.append(
                CostLineItem(
                    invoice_id=inv.id,
                    label=f"{inv.label} (Gebäude)",
                    allocation_key=prop_key,
                    total_prorated=inv.total_prorated,
                    party_numerator=prop_numerator,
                    party_denominator=prop_denominator,
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
    warnings.extend(sorted(mea_warnings))

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
