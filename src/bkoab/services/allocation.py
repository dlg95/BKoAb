from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP


@dataclass
class PersonPeriod:
    valid_from: date
    valid_to: date | None
    persons: int


@dataclass
class LeasePeriod:
    lease_id: int
    tenant_name: str
    room_id: int
    room_name: str
    move_in: date
    move_out: date | None
    person_periods: list[PersonPeriod]


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


def _lease_end(lease: LeasePeriod) -> date:
    return lease.move_out or date.max


def occupied_months_in_year(move_in: date, move_out: date | None, year: int) -> list[int]:
    """Returns calendar months in `year` during which the lease overlaps at least one day."""
    months: list[int] = []
    for month in range(1, 13):
        month_start = date(year, month, 1)
        if month == 12:
            month_end = date(year, 12, 31)
        else:
            month_end = date(year, month + 1, 1) - timedelta(days=1)
        lease_end = move_out or date.max
        if move_in <= month_end and month_start <= lease_end:
            months.append(month)
    return months


def persons_on_day(lease: LeasePeriod, day: date) -> int:
    if not _lease_active_on(day, lease):
        return 0
    lease_end = _lease_end(lease)
    for period in lease.person_periods:
        period_end = period.valid_to or lease_end
        if period.valid_from <= day <= period_end:
            return period.persons
    return 0


def head_months_for_lease(lease: LeasePeriod, year: int) -> Decimal:
    year_start, year_end = _year_bounds(year)
    total = Decimal("0")
    day = max(year_start, lease.move_in)
    last_day = min(year_end, _lease_end(lease))
    if day > last_day:
        return Decimal("0")

    while day <= last_day:
        persons = persons_on_day(lease, day)
        if persons > 0:
            total += Decimal(persons) / Decimal(_days_in_month(day.year, day.month))
        day += timedelta(days=1)

    return total.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


@dataclass
class UnitArea:
    unit_id: int
    living_area_sqm: Decimal


@dataclass
class UnitShareData:
    unit_id: int
    mea_share: Decimal
    consumption_amount: Decimal


def compute_equal_unit_shares(unit_count: int, is_member: bool) -> tuple[Decimal, Decimal, Decimal]:
    """Returns (numerator, denominator, share_ratio) for equal split among units."""
    count = Decimal(unit_count)
    if count <= 0 or not is_member:
        return Decimal("0"), count, Decimal("0")
    ratio = (Decimal("1") / count).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return Decimal("1"), count, ratio


def compute_mea_shares(units: list[UnitShareData], target_unit_id: int) -> tuple[Decimal, Decimal, Decimal]:
    unit_mea = next((u.mea_share for u in units if u.unit_id == target_unit_id), Decimal("0"))
    total = sum((u.mea_share for u in units if u.mea_share > 0), Decimal("0"))
    if total <= 0 or unit_mea <= 0:
        return unit_mea, total, Decimal("0")
    ratio = (unit_mea / total).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return unit_mea, total, ratio


def compute_direct_assignment_shares(
    amounts: dict[int, Decimal],
    target_id: int,
) -> tuple[Decimal, Decimal, Decimal]:
    """Direct assignment by consumption or other per-unit amount. target_id = room_id or unit_id."""
    value = amounts.get(target_id, Decimal("0"))
    total = sum((amount for amount in amounts.values() if amount > 0), Decimal("0"))
    if total <= 0 or value <= 0:
        return value, total, Decimal("0")
    ratio = (value / total).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return value, total, ratio


def compute_area_shares(
    units: list[UnitArea],
    target_unit_id: int,
    property_total_area_sqm: Decimal | None = None,
) -> tuple[Decimal, Decimal, Decimal]:
    """Returns (unit_area, total_area, share_ratio). Total prefers property Gesamt-m²."""
    unit_area = next(
        (u.living_area_sqm for u in units if u.unit_id == target_unit_id),
        Decimal("0"),
    )
    if property_total_area_sqm and property_total_area_sqm > 0:
        total = property_total_area_sqm
    else:
        total = sum((u.living_area_sqm for u in units if u.living_area_sqm > 0), Decimal("0"))
    if total <= 0 or unit_area <= 0:
        return unit_area, total, Decimal("0")
    share = (unit_area / total).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return unit_area, total, share


def compute_room_area_shares(
    lease_room_areas: dict[int, Decimal],
    lease_id: int,
) -> tuple[Decimal, Decimal, Decimal]:
    total = sum((area for area in lease_room_areas.values() if area > 0), Decimal("0"))
    room_area = lease_room_areas.get(lease_id, Decimal("0"))
    if total <= 0 or room_area <= 0:
        return room_area, total, Decimal("0")
    share = (room_area / total).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return room_area, total, share


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
