from datetime import date

import pytest

from bkoab.services.allocation import (
    LeasePeriod,
    PersonPeriod,
    compute_head_months,
    head_months_for_lease,
)
from bkoab.services.proration import prorate_amount


def _lease(
    lease_id: int,
    persons: int,
    move_in: date,
    move_out: date | None,
    person_periods: list[PersonPeriod] | None = None,
) -> LeasePeriod:
    return LeasePeriod(
        lease_id=lease_id,
        tenant_name="Test",
        room_id=1,
        room_name="Z1",
        move_in=move_in,
        move_out=move_out,
        person_periods=person_periods
        or [PersonPeriod(valid_from=move_in, valid_to=move_out, persons=persons)],
    )


def test_proration_half_year_overlap():
    amount, warning = prorate_amount(
        1200.0,
        date(2024, 7, 1),
        date(2025, 6, 30),
        2025,
    )
    assert warning is None
    assert amount == pytest.approx(1200.0 * 181 / 365, rel=1e-6)


def test_head_months_partial_year():
    lease = _lease(1, 2, date(2025, 3, 15), date(2025, 8, 31))
    hm = head_months_for_lease(lease, 2025)
    assert float(hm) > 0
    assert float(hm) < 12 * 2


def test_head_months_variable_person_count():
    lease = _lease(
        1,
        1,
        date(2025, 1, 1),
        date(2025, 12, 31),
        [
            PersonPeriod(date(2025, 1, 1), date(2025, 6, 30), 1),
            PersonPeriod(date(2025, 7, 1), date(2025, 12, 31), 2),
        ],
    )
    hm_variable = float(head_months_for_lease(lease, 2025))
    hm_flat_one = float(head_months_for_lease(_lease(1, 1, date(2025, 1, 1), date(2025, 12, 31)), 2025))
    hm_flat_two = float(head_months_for_lease(_lease(1, 2, date(2025, 1, 1), date(2025, 12, 31)), 2025))
    assert hm_flat_one < hm_variable < hm_flat_two
    assert hm_variable == pytest.approx(18.0, rel=1e-2)


def test_vacancy_landlord_head_months():
    leases = [_lease(1, 1, date(2025, 1, 1), date(2025, 6, 30))]
    party, landlord, total = compute_head_months(leases, [1, 2], 2025)
    assert float(landlord) > 0
    assert float(total) == pytest.approx(float(party[1]) + float(landlord), rel=1e-3)


def test_tenant_change_no_double_count():
    leases = [
        _lease(1, 1, date(2025, 1, 1), date(2025, 6, 30)),
        _lease(2, 1, date(2025, 7, 1), date(2025, 12, 31)),
    ]
    party, landlord, total = compute_head_months(leases, [1], 2025)
    assert float(landlord) == pytest.approx(0, abs=0.1)
    assert float(party[1]) + float(party[2]) == pytest.approx(float(total), rel=1e-2)
