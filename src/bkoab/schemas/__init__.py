from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class BillingStatus(str, Enum):
    DRAFT = "draft"
    FINALIZED = "finalized"


class InvoiceType(str, Enum):
    WEG = "weg"
    GAS = "gas"
    STROM = "strom"
    HANDWERKER = "handwerker"
    GRUNDSTEUER = "grundsteuer"
    SONSTIGES = "sonstiges"


INVOICE_TYPE_LABELS = {
    InvoiceType.WEG: "WEG-Betriebskosten",
    InvoiceType.GAS: "Gas",
    InvoiceType.STROM: "Strom",
    InvoiceType.HANDWERKER: "Handwerker",
    InvoiceType.GRUNDSTEUER: "Grundsteuer",
    InvoiceType.SONSTIGES: "Sonstiges",
}


class RoomCreate(BaseModel):
    name: str


class RoomRead(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class ApartmentCreate(BaseModel):
    name: str
    street: str = ""
    city: str = ""
    iban: str = ""
    account_holder: str = ""
    payment_reference_hint: str = ""
    rooms: list[RoomCreate] = Field(default_factory=list)

    @field_validator("rooms")
    @classmethod
    def validate_rooms(cls, v: list[RoomCreate]) -> list[RoomCreate]:
        if len(v) != 1:
            raise ValueError("Beim Anlegen genau ein erstes Zimmer angeben; weitere Zimmer später einzeln hinzufügen")
        if not v[0].name.strip():
            raise ValueError("Zimmername darf nicht leer sein")
        return v


class ApartmentUpdate(BaseModel):
    name: str | None = None
    street: str | None = None
    city: str | None = None
    iban: str | None = None
    account_holder: str | None = None
    payment_reference_hint: str | None = None


class ApartmentRead(BaseModel):
    id: int
    name: str
    street: str
    city: str
    iban: str
    account_holder: str
    payment_reference_hint: str
    rooms: list[RoomRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TenantCreate(BaseModel):
    name: str
    contact: str = ""


class TenantRead(BaseModel):
    id: int
    name: str
    contact: str

    model_config = {"from_attributes": True}


class LeaseCreate(BaseModel):
    tenant_id: int | None = None
    tenant_name: str | None = None
    tenant_contact: str = ""
    room_id: int
    persons: int = 1
    move_in: date
    move_out: date | None = None

    @field_validator("persons")
    @classmethod
    def validate_persons(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Personenanzahl muss mindestens 1 sein")
        return v


class LeaseUpdate(BaseModel):
    persons: int | None = None
    move_in: date | None = None
    move_out: date | None = None


class PersonPeriodCreate(BaseModel):
    valid_from: date
    valid_to: date | None = None
    persons: int

    @field_validator("persons")
    @classmethod
    def validate_persons(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Kopfzahl muss mindestens 1 sein")
        return v


class PersonPeriodRead(BaseModel):
    id: int
    valid_from: date
    valid_to: date | None
    persons: int

    model_config = {"from_attributes": True}


class PersonPeriodBulkUpdate(BaseModel):
    periods: list[PersonPeriodCreate]


class LeaseRead(BaseModel):
    id: int
    tenant_id: int
    tenant_name: str
    room_id: int
    room_name: str
    persons: int
    move_in: date
    move_out: date | None
    person_periods: list[PersonPeriodRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class BillingYearRead(BaseModel):
    id: int
    apartment_id: int
    year: int
    status: BillingStatus

    model_config = {"from_attributes": True}


class BillingYearCreate(BaseModel):
    year: int

    @field_validator("year")
    @classmethod
    def validate_year(cls, v: int) -> int:
        if v < 2000 or v > 2100:
            raise ValueError("Jahr muss zwischen 2000 und 2100 liegen")
        return v


class InvoiceCreate(BaseModel):
    invoice_type: InvoiceType
    label: str = ""
    amount: Decimal
    period_start: date
    period_end: date
    note: str = ""

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Betrag darf nicht negativ sein")
        return v


class InvoiceRead(BaseModel):
    id: int
    billing_year_id: int
    invoice_type: InvoiceType
    invoice_type_label: str
    label: str
    amount: Decimal
    period_start: date
    period_end: date
    note: str
    prorated_amount: Decimal | None = None

    model_config = {"from_attributes": True}


class AdvancePaymentItem(BaseModel):
    lease_id: int
    month: int
    amount: Decimal = Decimal("0")


class AdvancePaymentBulkUpdate(BaseModel):
    payments: list[AdvancePaymentItem]


class AdvancePaymentMatrixRow(BaseModel):
    lease_id: int
    tenant_name: str
    room_name: str
    months: dict[int, Decimal]
    occupied_months: list[int]


class CostLineItem(BaseModel):
    invoice_id: int
    label: str
    total_prorated: Decimal
    party_head_months: Decimal
    party_share: Decimal


class PartySettlement(BaseModel):
    lease_id: int
    tenant_name: str
    room_name: str
    head_months: Decimal
    cost_lines: list[CostLineItem]
    total_costs: Decimal
    total_advance_payments: Decimal
    balance: Decimal
    balance_type: str


class SettlementPreview(BaseModel):
    apartment_id: int
    year: int
    total_head_months: Decimal
    landlord_vacancy_head_months: Decimal
    parties: list[PartySettlement]
    warnings: list[str] = Field(default_factory=list)


class LandlordProfileRead(BaseModel):
    id: int
    name: str
    street: str
    city: str
    phone: str
    email: str
    logo_filename: str | None
    payment_text_template: str

    model_config = {"from_attributes": True}


class LandlordProfileUpdate(BaseModel):
    name: str
    street: str = ""
    city: str = ""
    phone: str = ""
    email: str = ""
    payment_text_template: str = ""


class DashboardApartmentSummary(BaseModel):
    id: int
    name: str
    room_count: int
    active_lease_count: int
    billing_years: list[int]


class DashboardRead(BaseModel):
    apartments: list[DashboardApartmentSummary]
    landlord: LandlordProfileRead | None
