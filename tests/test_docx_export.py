from bkoab.services.docx_export import PersonPeriodLine, person_period_lines_for_year


def test_person_period_lines_for_year_clips_to_billing_year():
    lines = [
        PersonPeriodLine("2025-01-01", "2025-06-30", 1),
        PersonPeriodLine("2025-07-01", None, 2),
        PersonPeriodLine("2026-01-01", "2026-12-31", 1),
    ]
    result = person_period_lines_for_year(lines, 2025)
    assert len(result) == 2
    assert result[0] == PersonPeriodLine("2025-01-01", "2025-06-30", 1)
    assert result[1] == PersonPeriodLine("2025-07-01", "2025-12-31", 2)


def test_person_period_lines_for_year_excludes_outside_year():
    lines = [PersonPeriodLine("2024-01-01", "2024-12-31", 1)]
    assert person_period_lines_for_year(lines, 2025) == []


def test_person_period_lines_for_year_partial_lease():
    lines = [PersonPeriodLine("2025-04-15", "2025-09-30", 1)]
    result = person_period_lines_for_year(lines, 2025)
    assert result == [PersonPeriodLine("2025-04-15", "2025-09-30", 1)]
