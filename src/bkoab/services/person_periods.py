from datetime import date, timedelta

from bkoab.models import Lease, LeasePersonPeriod
from bkoab.schemas import PersonPeriodCreate
from bkoab.services.allocation import LeasePeriod, PersonPeriod


def ensure_default_person_periods(lease: Lease, db) -> list[LeasePersonPeriod]:
    if lease.person_periods:
        return lease.person_periods
    period = LeasePersonPeriod(
        lease_id=lease.id,
        valid_from=lease.move_in,
        valid_to=lease.move_out,
        persons=lease.persons,
    )
    db.add(period)
    db.commit()
    db.refresh(lease)
    return lease.person_periods


def sync_person_periods_to_lease(lease: Lease, db) -> None:
    """Keep person periods consistent after move-in/move-out changes.

    Periods entirely outside the lease are dropped, the first period starts at move-in
    and the last one ends at move-out (or stays open). Gaps between periods stay as they are.
    """
    periods = sorted(lease.person_periods, key=lambda p: p.valid_from)
    kept: list[LeasePersonPeriod] = []
    for period in periods:
        if lease.move_out and period.valid_from > lease.move_out:
            db.delete(period)
            continue
        if period.valid_to is not None and period.valid_to < lease.move_in:
            db.delete(period)
            continue
        kept.append(period)

    if not kept:
        persons = periods[-1].persons if periods else lease.persons
        period = LeasePersonPeriod(
            lease_id=lease.id,
            valid_from=lease.move_in,
            valid_to=lease.move_out,
            persons=persons,
        )
        db.add(period)
        return

    kept[0].valid_from = lease.move_in
    for index, period in enumerate(kept[:-1]):
        if period.valid_to is None:
            period.valid_to = kept[index + 1].valid_from - timedelta(days=1)
    kept[-1].valid_to = lease.move_out


def validate_person_periods(lease: Lease, periods: list[PersonPeriodCreate]) -> None:
    if not periods:
        raise ValueError("Mindestens ein Personenzahl-Zeitraum erforderlich")

    sorted_periods = sorted(periods, key=lambda p: p.valid_from)

    for period in sorted_periods:
        if period.persons < 1:
            raise ValueError("Personenzahl muss mindestens 1 sein")
        if period.valid_from < lease.move_in:
            raise ValueError("Personenzahl-Zeitraum beginnt vor Einzug")
        if lease.move_out and period.valid_to and period.valid_to > lease.move_out:
            raise ValueError("Personenzahl-Zeitraum endet nach Auszug")
        if period.valid_to and period.valid_from > period.valid_to:
            raise ValueError("Ungültiger Personenzahl-Zeitraum")

    if sorted_periods[0].valid_from != lease.move_in:
        raise ValueError("Erster Personenzahl-Zeitraum muss am Einzug beginnen")

    for index, period in enumerate(sorted_periods):
        is_last = index == len(sorted_periods) - 1

        if lease.move_out:
            if is_last and period.valid_to != lease.move_out:
                raise ValueError("Letzter Personenzahl-Zeitraum muss am Auszug enden")
            if not is_last and period.valid_to is None:
                raise ValueError("Nur der letzte Zeitraum darf offen enden")
        elif is_last and period.valid_to is not None:
            raise ValueError("Bei unbefristetem Mietvertrag endet der letzte Zeitraum offen")

        if not is_last:
            next_period = sorted_periods[index + 1]
            if period.valid_to is None:
                raise ValueError("Nur der letzte Zeitraum darf offen enden")
            if next_period.valid_from != period.valid_to + timedelta(days=1):
                raise ValueError("Personenzahl-Zeiträume müssen lückenlos aufeinander folgen")


def lease_to_allocation_period(lease: Lease) -> LeasePeriod:
    periods = [
        PersonPeriod(valid_from=p.valid_from, valid_to=p.valid_to, persons=p.persons)
        for p in lease.person_periods
    ]
    if not periods:
        periods = [
            PersonPeriod(
                valid_from=lease.move_in,
                valid_to=lease.move_out,
                persons=lease.persons,
            )
        ]
    return LeasePeriod(
        lease_id=lease.id,
        tenant_name=lease.tenant.name,
        room_id=lease.room_id,
        room_name=lease.room.name,
        move_in=lease.move_in,
        move_out=lease.move_out,
        person_periods=periods,
    )
