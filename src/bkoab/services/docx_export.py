from decimal import Decimal

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor

from bkoab.schemas import PartySettlement, SettlementPreview
from bkoab.services.docx_styles import (
    add_money_paragraph,
    add_styled_paragraph,
    format_eur,
    set_cell_text,
    set_table_borders,
)


def _default_payment_text(apartment_iban: str, account_holder: str, reference: str) -> str:
    return (
        f"Bitte überweisen Sie den offenen Betrag auf folgendes Konto: "
        f"IBAN {apartment_iban}, Kontoinhaber {account_holder}"
        + (f", Verwendungszweck {reference}" if reference else "")
        + ". Ein Guthaben überweisen wir zeitnah auf Ihr uns bekanntes Konto."
    )


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
    set_cell_text(right, landlord_name, bold=True, size=14)
    add_styled_paragraph(doc, landlord_street, size=10)
    add_styled_paragraph(doc, landlord_city, size=10)
    if landlord_phone:
        add_styled_paragraph(doc, f"Tel.: {landlord_phone}", size=10)
    if landlord_email:
        add_styled_paragraph(doc, landlord_email, size=10)

    doc.add_paragraph()
    add_styled_paragraph(doc, party.tenant_name, size=10)
    add_styled_paragraph(doc, f"Zimmer: {party.room_name}", size=10)
    add_styled_paragraph(doc, apartment_street, size=10)
    add_styled_paragraph(doc, apartment_city, size=10)

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

    doc.add_paragraph()
    add_styled_paragraph(doc, "Berechnungsdetails (Anhang)", bold=True, size=8)
    add_styled_paragraph(
        doc,
        f"Ihre Kopfmonate gesamt: {party.head_months:.4f} | "
        f"Kopfmonate gesamt Objekt: {preview.total_head_months:.4f} | "
        f"Leerstand Vermieter: {preview.landlord_vacancy_head_months:.4f}",
        size=8,
    )

    return doc
