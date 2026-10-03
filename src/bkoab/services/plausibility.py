"""Plausibilitäts-Check vor dem Export einer Abrechnung.

Each check points to the place where it can be fixed (`area`), so the UI can link there.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from bkoab.models import (
    AllocationKey,
    BillingYear,
    Invoice,
    LandlordProfile,
    Lease,
    Room,
)
from bkoab.schemas import INVOICE_TYPE_LABELS, PlausibilityCheck, SettlementPreview
from bkoab.services.advance import lease_advances_for_year, overrides_by_lease
from bkoab.services.allocation import occupied_months_in_year
from bkoab.services.deadlines import deadline_state, exported_at
from bkoab.services.proration import prorate_amount

MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]


def _eur(value: Decimal) -> str:
    text = f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{text} €"


def _invoice_name(invoice: Invoice) -> str:
    type_label = INVOICE_TYPE_LABELS.get(invoice.invoice_type, invoice.invoice_type.value)
    return f"{type_label} — {invoice.label}" if invoice.label else type_label


def run_plausibility_checks(
    db: Session,
    apartment_id: int,
    year: int,
    preview: SettlementPreview,
    today: date | None = None,
) -> list[PlausibilityCheck]:
    today = today or date.today()
    checks: list[PlausibilityCheck] = []

    def add(severity: str, area: str, message: str) -> None:
        checks.append(PlausibilityCheck(severity=severity, area=area, message=message))

    billing_year = (
        db.query(BillingYear)
        .filter(BillingYear.apartment_id == apartment_id, BillingYear.year == year)
        .first()
    )
    invoices = (
        db.query(Invoice).filter(Invoice.billing_year_id == billing_year.id).all() if billing_year else []
    )
    rooms = db.query(Room).filter(Room.apartment_id == apartment_id).all()
    leases = (
        db.query(Lease)
        .join(Room)
        .options(joinedload(Lease.tenant), joinedload(Lease.room), joinedload(Lease.advance_rates))
        .filter(Room.apartment_id == apartment_id)
        .all()
    )
    year_leases = [l for l in leases if occupied_months_in_year(l.move_in, l.move_out, year)]

    # --- Grundlagen -------------------------------------------------------------
    if not year_leases:
        add("error", "mietparteien", f"Keine Mietpartei wohnt im Jahr {year} in dieser WG.")
    if not invoices:
        add("error", "rechnungen", f"Für {year} sind noch keine Rechnungen erfasst.")

    # --- Rechnungen -------------------------------------------------------------
    seen: dict[tuple, list[Invoice]] = defaultdict(list)
    for invoice in invoices:
        name = _invoice_name(invoice)
        if invoice.amount <= 0:
            add("warning", "rechnungen", f"„{name}“ hat keinen positiven Betrag.")
        prorated, warning = prorate_amount(float(invoice.amount), invoice.period_start, invoice.period_end, year)
        if warning:
            add("warning", "rechnungen", f"„{name}“: {warning} — die Rechnung fließt mit 0 € ein.")
        elif invoice.period_start.year != year or invoice.period_end.year != year:
            add(
                "info",
                "rechnungen",
                f"„{name}“ reicht über {year} hinaus und wird anteilig mit {_eur(Decimal(str(round(prorated, 2))))} berücksichtigt.",
            )
        if (
            invoice.allocation_key == AllocationKey.FLAECHE_QM
            and any(lease.room.area_sqm in (None, 0) for lease in year_leases)
        ):
            missing = sorted({lease.room.name for lease in year_leases if not lease.room.area_sqm})
            add(
                "warning",
                "stammdaten",
                f"„{name}“ wird nach Fläche verteilt, aber für {', '.join(missing)} ist keine Fläche hinterlegt.",
            )
        seen[(invoice.invoice_type, invoice.amount, invoice.period_start, invoice.period_end)].append(invoice)

    for duplicates in seen.values():
        if len(duplicates) > 1:
            add(
                "warning",
                "rechnungen",
                f"„{_invoice_name(duplicates[0])}“ ist {len(duplicates)}× mit gleichem Betrag und Zeitraum erfasst — doppelt?",
            )

    without_receipt = [inv for inv in invoices if not inv.has_document]
    if invoices and without_receipt:
        add(
            "info",
            "rechnungen",
            f"{len(without_receipt)} von {len(invoices)} Rechnungen ohne PDF-Beleg (Mieter:innen dürfen Belege einsehen).",
        )

    # --- Vorauszahlungen --------------------------------------------------------
    overrides = overrides_by_lease(db, [l.id for l in year_leases], year)
    for lease in year_leases:
        months = lease_advances_for_year(lease, year, overrides.get(lease.id, {}))
        missing = [m for m, info in months.items() if info.amount <= 0]
        if missing and len(missing) == len(months):
            add("warning", "vorauszahlungen", f"Für {lease.tenant.name} ist im Jahr {year} keine Vorauszahlung hinterlegt.")
        elif missing:
            add(
                "warning",
                "vorauszahlungen",
                f"Für {lease.tenant.name} fehlen Vorauszahlungen in: {', '.join(MONTHS[m - 1] for m in missing)}.",
            )

    # --- Verteilung -------------------------------------------------------------
    total_costs = sum((Decimal(str(p.total_costs)) for p in preview.parties), Decimal("0"))
    total_invoices = Decimal("0")
    for invoice in invoices:
        prorated, _ = prorate_amount(float(invoice.amount), invoice.period_start, invoice.period_end, year)
        total_invoices += Decimal(str(round(prorated, 2)))
    landlord_share = total_invoices - total_costs
    unit_invoice_ids = {inv.id for inv in invoices}
    has_building_costs = any(
        line.invoice_id not in unit_invoice_ids for party in preview.parties for line in party.cost_lines
    )
    if has_building_costs:
        pass  # Gebäudekosten (MFH-Archiv) are not part of the WG invoice sum.
    elif landlord_share > Decimal("0.05"):
        add(
            "info",
            "verteilung",
            f"Nicht auf Mietparteien verteilt (Leerstand / Vermieteranteil): {_eur(landlord_share)} von {_eur(total_invoices)}.",
        )
    elif landlord_share < Decimal("-0.05"):
        add(
            "warning",
            "verteilung",
            f"Die Anteile der Mietparteien übersteigen die Rechnungssumme um {_eur(-landlord_share)} — bitte Verteilerquoten prüfen.",
        )

    occupied_rooms = {lease.room_id for lease in year_leases}
    empty_rooms = [room.name for room in rooms if room.id not in occupied_rooms]
    if empty_rooms:
        add("info", "mietparteien", f"Im Jahr {year} durchgehend leer: {', '.join(empty_rooms)} (Kosten beim Vermieter).")

    # Calculation warnings not covered above (e.g. Direktzuordnung without targets)
    for warning in preview.warnings:
        if "Überlappung" in warning or "Rechnungszeitraum" in warning:
            continue  # already reported per invoice
        add("warning", "verteilung", warning)

    # --- Briefkopf & Frist ------------------------------------------------------
    landlord = db.query(LandlordProfile).first()
    if not landlord or landlord.name.strip() in ("", "Vermieter") or not landlord.street.strip():
        add("warning", "einstellungen", "Briefkopf unvollständig: Name und Adresse des Vermieters fehlen.")

    info = deadline_state(
        year,
        exists=billing_year is not None,
        exported=exported_at(apartment_id, year),
        today=today,
    )
    if info.state == "overdue":
        add(
            "error",
            "frist",
            f"Abrechnungsfrist am {info.deadline:%d.%m.%Y} abgelaufen — Nachforderungen sind in der Regel ausgeschlossen (§ 556 Abs. 3 BGB).",
        )
    elif info.state != "exported" and info.days_left <= 90:
        add("warning", "frist", f"Abrechnungsfrist endet am {info.deadline:%d.%m.%Y} (noch {info.days_left} Tage).")

    order = {"error": 0, "warning": 1, "info": 2}
    checks.sort(key=lambda c: order[c.severity])
    return checks
