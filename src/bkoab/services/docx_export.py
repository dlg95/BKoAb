from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor

from bkoab.schemas import PartySettlement, SettlementPreview
from bkoab.services.docx_styles import (
    add_cell_paragraph,
    add_money_paragraph,
    add_styled_paragraph,
    format_eur,
    set_cell_text,
    set_table_borders,
)


@dataclass
class PersonPeriodLine:
    valid_from: str
    valid_to: str | None
    persons: int


def _default_payment_text(apartment_iban: str, account_holder: str, reference: str) -> str:
    return (
        f"Bitte überweisen Sie den offenen Betrag auf folgendes Konto: "
        f"IBAN {apartment_iban}, Kontoinhaber {account_holder}"
        + (f", Verwendungszweck {reference}" if reference else "")
        + ". Ein Guthaben überweisen wir zeitnah auf Ihr uns bekanntes Konto."
        )


def _format_period_end(valid_to: str | None) -> str:
    return valid_to or "laufend"


def _add_head_months_explanation(
    doc: Document,
    *,
    preview: SettlementPreview,
    party: PartySettlement,
    person_period_lines: list[PersonPeriodLine],
) -> None:
    add_styled_paragraph(doc, "Erläuterung der Kopfmonate", bold=True, size=11)
    add_styled_paragraph(
        doc,
        "Die Nebenkosten werden nach dem Kopfmonatsverfahren verteilt. Ein Kopfmonat entspricht "
        "einer Person, die einen Kalendermonat in der Wohnung bewohnt hat. Bei Ein- oder Auszug "
        "innerhalb eines Monats sowie bei wechselnder Personenzahl werden die Kopfmonate taggenau "
        "berechnet: Personen × Bewohnungsanteil je Tag.",
        size=10,
    )
    add_styled_paragraph(
        doc,
        "Die Gesamtkosten des Objekts (je Kostenart anteilig für das Abrechnungsjahr) werden auf "
        "alle Kopfmonate umgelegt. Ihr Anteil ergibt sich aus: "
        "Gesamtkosten × (Ihre Kopfmonate ÷ Kopfmonate gesamt).",
        size=10,
    )

    if person_period_lines:
        doc.add_paragraph()
        add_styled_paragraph(doc, "Ihre Kopfzahl-Zeiträume:", bold=True, size=10)
        period_table = doc.add_table(rows=1, cols=3)
        period_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(period_table)
        for idx, title in enumerate(["Von", "Bis", "Personen"]):
            set_cell_text(period_table.rows[0].cells[idx], title, bold=True, size=9, shade=True)
        for period in person_period_lines:
            row = period_table.add_row().cells
            set_cell_text(row[0], period.valid_from, size=9)
            set_cell_text(row[1], _format_period_end(period.valid_to), size=9)
            set_cell_text(row[2], str(period.persons), size=9, align_right=True)

    doc.add_paragraph()
    add_styled_paragraph(
        doc,
        f"Ihre Kopfmonate im Abrechnungsjahr {preview.year}: {party.head_months:.4f}",
        size=10,
    )
    add_styled_paragraph(
        doc,
        f"Kopfmonate gesamt (alle Mietparteien und Leerstand): {preview.total_head_months:.4f}",
        size=10,
    )
    add_styled_paragraph(
        doc,
        f"Davon Leerstand (Vermieteranteil): {preview.landlord_vacancy_head_months:.4f}",
        size=10,
    )
    doc.add_paragraph()


def generate_settlement_docx(
    *,
    preview: SettlementPreview,
    party: PartySettlement,
    landlord_name: str,
    landlord_street: str,
    landlord_city: str,
    landlord_phone: str,
    landlord_email: str,
    apartment_street: str,
    apartment_city: str,
    apartment_iban: str,
    apartment_account_holder: str,
    payment_reference_hint: str,
    payment_text_template: str,
    logo_path: str | None = None,
    person_period_lines: list[PersonPeriodLine] | None = None,
) -> Document:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)

    header = doc.add_table(rows=1, cols=2)
    header.autofit = False
    left = header.rows[0].cells[0]
    right = header.rows[0].cells[1]
    if logo_path:
        left.paragraphs[0].add_run().add_picture(logo_path, width=Cm(3))
    else:
        set_cell_text(left, "")

    set_cell_text(right, landlord_name, bold=True, size=14, align_right=True, compact=True)
    add_cell_paragraph(right, landlord_street, size=10, align_right=True)
    add_cell_paragraph(right, landlord_city, size=10, align_right=True)
    if landlord_phone:
        add_cell_paragraph(right, f"Tel.: {landlord_phone}", size=10, align_right=True)
    if landlord_email:
        add_cell_paragraph(right, landlord_email, size=10, align_right=True)

    doc.add_paragraph()
    add_styled_paragraph(doc, party.tenant_name, size=10, compact=True)
    add_styled_paragraph(doc, f"Zimmer: {party.room_name}", size=10, compact=True)
    add_styled_paragraph(doc, apartment_street, size=10, compact=True)
    add_styled_paragraph(doc, apartment_city, size=10, compact=True)

    doc.add_paragraph()
    add_styled_paragraph(
        doc,
        f"Betriebskostenabrechnung {preview.year}",
        bold=True,
        size=16,
        align=WD_ALIGN_PARAGRAPH.CENTER,
    )
    doc.add_paragraph()
    add_styled_paragraph(
        doc,
        f"Sehr geehrte/r {party.tenant_name}, hiermit erhalten Sie die Betriebskostenabrechnung "
        f"für den Zeitraum 01.01.{preview.year}–31.12.{preview.year}.",
        size=10,
    )
    doc.add_paragraph()
    _add_head_months_explanation(
        doc,
        preview=preview,
        party=party,
        person_period_lines=person_period_lines or [],
    )

    table = doc.add_table(rows=1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(table)
    headers = ["Kostenart", "Gesamtkosten (Objekt)", "Ihre Kopfmonate", "Ihr Anteil"]
    for idx, title in enumerate(headers):
        set_cell_text(table.rows[0].cells[idx], title, bold=True, size=9, shade=True)

    for line in party.cost_lines:
        row = table.add_row().cells
        set_cell_text(row[0], line.label, size=9)
        set_cell_text(row[1], format_eur(line.total_prorated), size=9, align_right=True)
        set_cell_text(row[2], f"{line.party_head_months:.2f}", size=9, align_right=True)
        set_cell_text(row[3], format_eur(line.party_share), size=9, align_right=True)

    doc.add_paragraph()
    add_money_paragraph(doc, "Summe Nebenkosten", party.total_costs, bold=True)
    add_money_paragraph(doc, "Abzüglich Vorauszahlungen", party.total_advance_payments)
    balance_label = (
        "Nachzahlung" if party.balance_type == "nachzahlung"
        else "Guthaben" if party.balance_type == "guthaben"
        else "Ausgleich"
    )
    add_money_paragraph(doc, balance_label, abs(party.balance), bold=True, size=11)

    doc.add_paragraph()
    payment_text = payment_text_template.strip() or _default_payment_text(
        apartment_iban, apartment_account_holder, payment_reference_hint
    )
    add_styled_paragraph(doc, payment_text, size=10)

    return doc


def settlement_docx_bytes(doc: Document) -> bytes:
    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
