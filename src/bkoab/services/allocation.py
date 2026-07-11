from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP


@dataclass
class LeasePeriod:
    lease_id: int
    tenant_name: str
    room_id: int
    room_name: str
    persons: int
    move_in: date
    move_out: date | None


def _year_bounds(year: int) -> tuple[date, date]:
    return date(year, 1, 1), date(year, 12, 31)


def _lease_active_on(day: date, lease: LeasePeriod) -> bool:
    if day < lease.move_in:
        return False
    if lease.move_out and day > lease.move_out:
        return False
    return True


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        next_day = date(year + 1, 1, 1)
    else:
        next_day = date(year, month + 1, 1)
    return (next_day - date(year, month, 1)).days


def head_months_for_lease(lease: LeasePeriod, year: int) -> Decimal:
    year_start, year_end = _year_bounds(year)
    total = Decimal("0")
    for month in range(1, 13):
        month_start = date(year, month, 1)
        month_end = date(year, month, _days_in_month(year, month))
        active_start = max(month_start, lease.move_in, year_start)
        active_end = month_end
        if lease.move_out:
            active_end = min(active_end, lease.move_out)
        active_end = min(active_end, year_end)
        if active_start <= active_end:
            active_days = (active_end - active_start).days + 1
            fraction = Decimal(active_days) / Decimal(_days_in_month(year, month))
            total += Decimal(lease.persons) * fraction
    return total.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def compute_head_months(
    leases: list[LeasePeriod],
    room_ids: list[int],
    year: int,
) -> tuple[dict[int, Decimal], Decimal, Decimal]:
    year_start, year_end = _year_bounds(year)
    party_months: dict[int, Decimal] = {}

    for lease in leases:
        hm = head_months_for_lease(lease, year)
        if hm > 0:
            party_months[lease.lease_id] = party_months.get(lease.lease_id, Decimal("0")) + hm

    landlord_vacancy = Decimal("0")
    for room_id in room_ids:
        room_leases = [lease for lease in leases if lease.room_id == room_id]
        day = year_start
        while day <= year_end:
            if not any(_lease_active_on(day, lease) for lease in room_leases):
                landlord_vacancy += Decimal("1") / Decimal(_days_in_month(day.year, day.month))
            day += timedelta(days=1)

    landlord_vacancy = landlord_vacancy.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    total = sum(party_months.values(), Decimal("0")) + landlord_vacancy
    return party_months, landlord_vacancy, total
