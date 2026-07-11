from datetime import date


def days_inclusive(start: date, end: date) -> int:
    return (end - start).days + 1


def overlap_days(
    period_start: date,
    period_end: date,
    billing_year: int,
) -> int:
    year_start = date(billing_year, 1, 1)
    year_end = date(billing_year, 12, 31)
    overlap_start = max(period_start, year_start)
    overlap_end = min(period_end, year_end)
    if overlap_start > overlap_end:
        return 0
    return days_inclusive(overlap_start, overlap_end)


def prorate_amount(
    amount: float,
    period_start: date,
    period_end: date,
    billing_year: int,
) -> tuple[float, str | None]:
    total_days = days_inclusive(period_start, period_end)
    if total_days <= 0:
        return 0.0, "Ungültiger Rechnungszeitraum"
    overlap = overlap_days(period_start, period_end, billing_year)
    if overlap == 0:
        return 0.0, "Keine Überlappung mit Abrechnungsjahr"
    prorated = amount * overlap / total_days
    return prorated, None
