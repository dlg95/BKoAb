"""Abrechnungsfrist (§ 556 Abs. 3 BGB): settlement must reach tenants within 12 months after the period."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from bkoab import config
from bkoab.models import Apartment, Lease
from bkoab.services.allocation import occupied_months_in_year

# Show a reminder when the deadline is closer than this.
DEADLINE_WARNING_DAYS = 90


def settlement_deadline(year: int) -> date:
    """Calendar-year settlement → deadline is 31.12. of the following year."""
    return date(year + 1, 12, 31)


def exported_at(apartment_id: int, year: int) -> datetime | None:
    """Last DOCX/PDF export of this billing year (proxy for „Abrechnung erstellt“)."""
    folder = Path(config.EXPORTS_DIR) / str(apartment_id) / str(year)
    if not folder.is_dir():
        return None
    times = [p.stat().st_mtime for p in folder.iterdir() if p.suffix.lower() in {".docx", ".pdf"}]
    return datetime.fromtimestamp(max(times)) if times else None


@dataclass
class DeadlineInfo:
    year: int
    deadline: date
    days_left: int
    state: str  # exported | open | due_soon | missing | overdue
    billing_year_exists: bool
    exported_at: datetime | None


def deadline_state(year: int, *, exists: bool, exported: datetime | None, today: date) -> DeadlineInfo:
    deadline = settlement_deadline(year)
    days_left = (deadline - today).days
    if exported:
        state = "exported"
    elif days_left < 0:
        state = "overdue"
    elif not exists:
        state = "missing"
    elif days_left <= DEADLINE_WARNING_DAYS:
        state = "due_soon"
    else:
        state = "open"
    if state == "missing" and days_left <= DEADLINE_WARNING_DAYS:
        state = "due_soon"
    return DeadlineInfo(year, deadline, days_left, state, exists, exported)


def apartment_deadlines(
    apartment: Apartment,
    leases: list[Lease],
    billing_years: list[int],
    today: date | None = None,
) -> list[DeadlineInfo]:
    """Deadlines for the last two finished calendar years in which the WG was let."""
    today = today or date.today()
    result: list[DeadlineInfo] = []
    for year in (today.year - 1, today.year - 2):
        exists = year in billing_years
        occupied = any(occupied_months_in_year(l.move_in, l.move_out, year) for l in leases)
        if not exists and not occupied:
            continue
        info = deadline_state(year, exists=exists, exported=exported_at(apartment.id, year), today=today)
        if not exists and info.state == "overdue":
            continue  # a year never started in BKoAb (e.g. before using the tool) is not flagged
        result.append(info)
    return result
