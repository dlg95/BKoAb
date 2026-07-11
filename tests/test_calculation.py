from datetime import date

import pytest

from bkoab.services.allocation import LeasePeriod, compute_head_months, head_months_for_lease
from bkoab.services.proration import prorate_amount


def test_proration_half_year_overlap():
    amount, warning = prorate_amount(
        1200.0,
        date(2024, 7, 1),
        date(2025, 6, 30),
        2025,
    )
    assert warning is None
    # Jan–Jun 2025 = 181 Tage von 365 Tagen Rechnungszeitraum
    assert amount == pytest.approx(1200.0 * 181 / 365, rel=1e-6)


def test_proration_no_overlap():
    amount, warning = prorate_amount(
        500.0,
        date(2023, 1, 1),
        date(2023, 12, 31),
        2025,
    )
    assert amount == 0.0
    assert warning is not None


def test_head_months_partial_year():
    lease = LeasePeriod(
        lease_id=1,
        tenant_name="Max",
        room_id=1,
        room_name="Zimmer 1",
        persons=2,
        move_in=date(2025, 3, 15),
        move_out=date(2025, 8, 31),
    )
    hm = head_months_for_lease(lease, 2025)
    assert float(hm) > 0
    assert float(hm) < 12 * 2


def test_vacancy_landlord_head_months():
    leases = [
        LeasePeriod(1, "A", 1, "Z1", 1, date(2025, 1, 1), date(2025, 6, 30)),
    ]
    party, landlord, total = compute_head_months(leases, [1, 2], 2025)
    assert float(landlord) > 0
    assert float(total) == pytest.approx(float(party[1]) + float(landlord), rel=1e-3)


def test_tenant_change_no_double_count():
    leases = [
        LeasePeriod(1, "A", 1, "Z1", 1, date(2025, 1, 1), date(2025, 6, 30)),
        LeasePeriod(2, "B", 1, "Z1", 1, date(2025, 7, 1), date(2025, 12, 31)),
    ]
    party, landlord, total = compute_head_months(leases, [1], 2025)
    assert float(landlord) == pytest.approx(0, abs=0.1)
    assert float(party[1]) + float(party[2]) == pytest.approx(float(total), rel=1e-2)
