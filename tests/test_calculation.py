from datetime import date
from decimal import Decimal

import pytest

from bkoab.services.allocation import (
    LeasePeriod,
    PersonPeriod,
    UnitArea,
    compute_area_shares,
    compute_head_months,
    head_months_for_lease,
    occupied_months_in_year,
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


def test_occupied_months_in_year():
    assert occupied_months_in_year(date(2025, 1, 1), date(2025, 12, 31), 2025) == list(range(1, 13))
    assert occupied_months_in_year(date(2025, 3, 15), date(2025, 8, 31), 2025) == [3, 4, 5, 6, 7, 8]
    assert occupied_months_in_year(date(2025, 7, 1), None, 2025) == [7, 8, 9, 10, 11, 12]
    assert occupied_months_in_year(date(2026, 1, 1), None, 2025) == []


def test_tenant_change_no_double_count():
    leases = [
        _lease(1, 1, date(2025, 1, 1), date(2025, 6, 30)),
        _lease(2, 1, date(2025, 7, 1), date(2025, 12, 31)),
    ]
    party, landlord, total = compute_head_months(leases, [1], 2025)
    assert float(landlord) == pytest.approx(0, abs=0.1)
    assert float(party[1]) + float(party[2]) == pytest.approx(float(total), rel=1e-2)


def test_area_shares_two_units():
    units = [
        UnitArea(1, Decimal("85")),
        UnitArea(2, Decimal("95")),
    ]
    area1, total, ratio1 = compute_area_shares(units, 1)
    area2, _, ratio2 = compute_area_shares(units, 2)
    assert float(total) == pytest.approx(180.0)
    assert float(area1) == pytest.approx(85.0)
    assert float(area2) == pytest.approx(95.0)
    assert float(ratio1) == pytest.approx(85 / 180, rel=1e-3)
    assert float(ratio1) + float(ratio2) == pytest.approx(1.0, rel=1e-3)
