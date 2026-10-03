"""Advance payments (NK-Vorauszahlungen): planned monthly rates + per-month deviations."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from bkoab.models import AdvancePayment, AdvancePaymentRate, Lease
from bkoab.services.allocation import occupied_months_in_year


def planned_amount(rates: list[AdvancePaymentRate], year: int, month: int) -> Decimal | None:
    """Planned rate for a month: the latest rate whose start month is not after it."""
    current: Decimal | None = None
    for rate in sorted(rates, key=lambda r: r.valid_from):
        if (rate.valid_from.year, rate.valid_from.month) <= (year, month):
            current = Decimal(str(rate.amount))
    return current


@dataclass
class MonthAdvance:
    amount: Decimal
    planned: Decimal | None
    overridden: bool


def lease_advances_for_year(
    lease: Lease,
    year: int,
    overrides: dict[int, Decimal],
) -> dict[int, MonthAdvance]:
    """Effective advance per occupied month: explicit entry, else planned rate, else 0."""
    result: dict[int, MonthAdvance] = {}
    for month in occupied_months_in_year(lease.move_in, lease.move_out, year):
        planned = planned_amount(lease.advance_rates, year, month)
        if month in overrides:
            result[month] = MonthAdvance(overrides[month], planned, True)
        else:
            result[month] = MonthAdvance(planned or Decimal("0"), planned, False)
    return result


def overrides_by_lease(db: Session, lease_ids: list[int], year: int) -> dict[int, dict[int, Decimal]]:
    if not lease_ids:
        return {}
    rows = (
        db.query(AdvancePayment)
        .filter(AdvancePayment.lease_id.in_(lease_ids), AdvancePayment.year == year)
        .all()
    )
    result: dict[int, dict[int, Decimal]] = {}
    for row in rows:
        result.setdefault(row.lease_id, {})[row.month] = Decimal(str(row.amount))
    return result


def is_current_tenant(lease: Lease, today: date | None = None) -> bool:
    """Still living in the WG (or about to move in) — i.e. future advances matter."""
    today = today or date.today()
    return lease.move_out is None or lease.move_out >= today


def current_planned_rate(lease: Lease, today: date | None = None) -> Decimal | None:
    today = today or date.today()
    ref = max(today, lease.move_in)
    return planned_amount(lease.advance_rates, ref.year, ref.month)


def occupied_month_fraction(move_in: date, move_out: date | None, year: int) -> Decimal:
    """Occupied time in the year measured in months (day-exact per month)."""
    start = max(move_in, date(year, 1, 1))
    end = min(move_out or date(year, 12, 31), date(year, 12, 31))
    if start > end:
        return Decimal("0")
    total = Decimal("0")
    day = start
    while day <= end:
        next_month = date(day.year + (day.month // 12), day.month % 12 + 1, 1)
        days_in_month = (next_month - date(day.year, day.month, 1)).days
        last = min(end, next_month - timedelta(days=1))
        total += Decimal((last - day).days + 1) / Decimal(days_in_month)
        day = next_month
    return total


def suggest_monthly_advance(total_costs: Decimal, months: Decimal) -> Decimal | None:
    """Costs per occupied month, rounded up to whole euros. None if not meaningful."""
    if months < 1 or total_costs <= 0:
        return None
    return Decimal(math.ceil(total_costs / months))
