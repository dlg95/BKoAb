from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class BillingStatus(str, Enum):
    DRAFT = "draft"
    FINALIZED = "finalized"


class PropertyType(str, Enum):
    EINFAMILIEN = "einfamilien"
    MFH = "mfh"
    WEG = "weg"


class AllocationKey(str, Enum):
    PERSONENMONATE = "personenmonate"
    FLAECHE_QM = "flaeche_qm"
    WOHNEINHEITEN = "wohneinheiten"
    DIREKTZUORDNUNG = "direktzuordnung"
    MEA = "mea"


class AllocationScope(str, Enum):
    UNIT = "unit"
    PROPERTY = "property"


class InvoiceType(str, Enum):
    WEG = "weg"
    GAS = "gas"
    STROM = "strom"
    HANDWERKER = "handwerker"
    GRUNDSTEUER = "grundsteuer"
    SONSTIGES = "sonstiges"
    HAUSMEISTER = "hausmeister"
    AUFZUG = "aufzug"
    VERSICHERUNG = "versicherung"
    SCHORNSTEINFEGER = "schornsteinfeger"
    WASSER_ABWASSER = "wasser_abwasser"
    MUELL = "muell"
    KABEL = "kabel"
    HEIZUNG_GEBAEUDE = "heizung_gebaeude"


INVOICE_TYPE_LABELS = {
    InvoiceType.WEG: "WEG-Betriebskosten",
    InvoiceType.GAS: "Gas",
    InvoiceType.STROM: "Strom",
    InvoiceType.HANDWERKER: "Handwerker",
    InvoiceType.GRUNDSTEUER: "Grundsteuer",
    InvoiceType.SONSTIGES: "Sonstiges",
    InvoiceType.HAUSMEISTER: "Hausmeister / Reinigung",
    InvoiceType.AUFZUG: "Aufzug / Lift",
    InvoiceType.VERSICHERUNG: "Gebäudeversicherung",
    InvoiceType.SCHORNSTEINFEGER: "Schornsteinfeger",
    InvoiceType.WASSER_ABWASSER: "Wasser / Abwasser",
    InvoiceType.MUELL: "Müll / Straßenreinigung",
    InvoiceType.KABEL: "Kabel / Gemeinschaftsantenne",
    InvoiceType.HEIZUNG_GEBAEUDE: "Heizkosten (Gebäude)",
}

ALLOCATION_KEY_LABELS = {
    AllocationKey.PERSONENMONATE: "Personenmonate",
    AllocationKey.FLAECHE_QM: "Fläche (m²)",
    AllocationKey.WOHNEINHEITEN: "Wohneinheiten (gleich)",
    AllocationKey.DIREKTZUORDNUNG: "Direktzuordnung (ausgewählte Mietparteien)",
    AllocationKey.MEA: "Miteigentumsanteile",
}

PROPERTY_TYPE_LABELS = {
    PropertyType.EINFAMILIEN: "Einfamilienhaus / WG",
    PropertyType.MFH: "Mehrfamilienhaus",
    PropertyType.WEG: "WEG",
}

DEFAULT_ALLOCATION_BY_INVOICE_TYPE: dict[InvoiceType, AllocationKey] = {
    # WG focus: default is always head-months; other keys remain selectable in the UI.
    InvoiceType.WEG: AllocationKey.PERSONENMONATE,
    InvoiceType.GAS: AllocationKey.PERSONENMONATE,
    InvoiceType.STROM: AllocationKey.PERSONENMONATE,
    InvoiceType.HANDWERKER: AllocationKey.PERSONENMONATE,
    InvoiceType.GRUNDSTEUER: AllocationKey.PERSONENMONATE,
    InvoiceType.SONSTIGES: AllocationKey.PERSONENMONATE,
    InvoiceType.HAUSMEISTER: AllocationKey.PERSONENMONATE,
    InvoiceType.AUFZUG: AllocationKey.PERSONENMONATE,
    InvoiceType.VERSICHERUNG: AllocationKey.PERSONENMONATE,
    InvoiceType.SCHORNSTEINFEGER: AllocationKey.PERSONENMONATE,
    InvoiceType.WASSER_ABWASSER: AllocationKey.PERSONENMONATE,
    InvoiceType.MUELL: AllocationKey.PERSONENMONATE,
    InvoiceType.KABEL: AllocationKey.PERSONENMONATE,
    InvoiceType.HEIZUNG_GEBAEUDE: AllocationKey.PERSONENMONATE,
}


def default_allocation_key(invoice_type: InvoiceType) -> AllocationKey:
    return DEFAULT_ALLOCATION_BY_INVOICE_TYPE.get(invoice_type, AllocationKey.PERSONENMONATE)


class RoomCreate(BaseModel):
    name: str
    area_sqm: Decimal | None = None
    consumption_amount: Decimal | None = None


class RoomUpdate(BaseModel):
    name: str | None = None
    area_sqm: Decimal | None = None
    consumption_amount: Decimal | None = None


class RoomRead(BaseModel):
    id: int
    name: str
    area_sqm: Decimal | None = None
    consumption_amount: Decimal | None = None

    model_config = {"from_attributes": True}


class PropertyCreate(BaseModel):
    name: str
    street: str = ""
    city: str = ""
    total_area_sqm: Decimal | None = None
    common_area_sqm: Decimal | None = None
    property_type: PropertyType = PropertyType.MFH


class PropertyUpdate(BaseModel):
    name: str | None = None
    street: str | None = None
    city: str | None = None
    total_area_sqm: Decimal | None = None
    common_area_sqm: Decimal | None = None
    property_type: PropertyType | None = None


class PropertyUnitSummary(BaseModel):
    id: int
    name: str
    living_area_sqm: Decimal | None
    mea_share: Decimal | None = None
    consumption_amount: Decimal | None = None
    room_count: int


class PropertyRead(BaseModel):
    id: int
    name: str
    street: str
    city: str
    total_area_sqm: Decimal | None
    common_area_sqm: Decimal | None
    property_type: PropertyType
    property_type_label: str
    units: list[PropertyUnitSummary] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PropertyBillingYearRead(BaseModel):
    id: int
    property_id: int
    year: int
    status: BillingStatus

    model_config = {"from_attributes": True}


class ApartmentCreate(BaseModel):
    name: str
    street: str = ""
    city: str = ""
    total_area_sqm: Decimal | None = None
    living_area_sqm: Decimal | None = None
    rooms: list[RoomCreate] = Field(default_factory=list)
    property_id: int | None = None


class ApartmentUpdate(BaseModel):
    name: str | None = None
    street: str | None = None
    city: str | None = None
    total_area_sqm: Decimal | None = None
    living_area_sqm: Decimal | None = None
    mea_share: Decimal | None = None
    consumption_amount: Decimal | None = None


class ApartmentRead(BaseModel):
    id: int
    property_id: int | None
    billing_kind: str = "wg"
    name: str
    street: str
    city: str
    total_area_sqm: Decimal | None
    living_area_sqm: Decimal | None = None
    mea_share: Decimal | None = None
    consumption_amount: Decimal | None = None
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
    # Optional planned monthly advance payment (Soll) from move-in.
    advance_payment_monthly: Decimal | None = None

    @field_validator("persons")
    @classmethod
    def validate_persons(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Personenanzahl muss mindestens 1 sein")
        return v

    @field_validator("advance_payment_monthly")
    @classmethod
    def validate_advance(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Vorauszahlung darf nicht negativ sein")
        return v


class LeaseUpdate(BaseModel):
    """Partial update. Sending `move_out: null` explicitly clears the move-out date."""

    tenant_name: str | None = None
    tenant_contact: str | None = None
    room_id: int | None = None
    persons: int | None = None
    move_in: date | None = None
    move_out: date | None = None

    @field_validator("persons")
    @classmethod
    def validate_persons(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("Personenanzahl muss mindestens 1 sein")
        return v


class PersonPeriodCreate(BaseModel):
    valid_from: date
    valid_to: date | None = None
    persons: int

    @field_validator("persons")
    @classmethod
    def validate_persons(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Personenzahl muss mindestens 1 sein")
        return v


class PersonPeriodRead(BaseModel):
    id: int
    valid_from: date
    valid_to: date | None
    persons: int

    model_config = {"from_attributes": True}


class PersonPeriodBulkUpdate(BaseModel):
    periods: list[PersonPeriodCreate]


class AdvanceRateRead(BaseModel):
    valid_from: date
    amount: Decimal

    model_config = {"from_attributes": True}


class LeaseRead(BaseModel):
    id: int
    tenant_id: int
    tenant_name: str
    tenant_contact: str = ""
    room_id: int
    room_name: str
    persons: int
    move_in: date
    move_out: date | None
    person_periods: list[PersonPeriodRead] = Field(default_factory=list)
    advance_rates: list[AdvanceRateRead] = Field(default_factory=list)
    current_advance_payment: Decimal | None = None

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
    allocation_key: AllocationKey | None = None
    allocation_scope: AllocationScope = AllocationScope.UNIT
    target_lease_ids: list[int] = Field(default_factory=list)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Betrag darf nicht negativ sein")
        return v


class InvoiceUpdate(InvoiceCreate):
    pass


class InvoiceRead(BaseModel):
    id: int
    billing_year_id: int | None
    property_billing_year_id: int | None
    invoice_type: InvoiceType
    invoice_type_label: str
    allocation_key: AllocationKey
    allocation_key_label: str
    allocation_scope: AllocationScope
    label: str
    amount: Decimal
    period_start: date
    period_end: date
    note: str
    prorated_amount: Decimal | None = None
    has_document: bool = False
    target_lease_ids: list[int] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AdvancePaymentItem(BaseModel):
    lease_id: int
    month: int
    # None removes the monthly entry so the planned rate (Soll) applies again.
    amount: Decimal | None = Decimal("0")


class AdvancePaymentBulkUpdate(BaseModel):
    payments: list[AdvancePaymentItem]


class AdvancePaymentMatrixRow(BaseModel):
    lease_id: int
    tenant_name: str
    room_name: str
    months: dict[int, Decimal]
    occupied_months: list[int]
    # Planned rate per occupied month (None = no Soll defined) and months with own entries.
    planned: dict[int, Decimal | None] = Field(default_factory=dict)
    overridden_months: list[int] = Field(default_factory=list)


class AdvanceRateItem(BaseModel):
    valid_from: date
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Vorauszahlung darf nicht negativ sein")
        return v


class AdvanceRateBulkUpdate(BaseModel):
    rates: list[AdvanceRateItem]


class CostLineItem(BaseModel):
    invoice_id: int
    label: str
    allocation_key: AllocationKey
    total_prorated: Decimal
    party_numerator: Decimal
    party_denominator: Decimal
    party_share: Decimal
    has_document: bool = False


class PartySettlement(BaseModel):
    lease_id: int
    tenant_name: str
    room_name: str
    head_months: Decimal
    living_area_sqm: Decimal | None
    cost_lines: list[CostLineItem]
    total_costs: Decimal
    total_advance_payments: Decimal
    balance: Decimal
    balance_type: str
    is_current_tenant: bool = False
    current_advance_payment: Decimal | None = None
    suggested_advance_payment: Decimal | None = None


class PlausibilityCheck(BaseModel):
    severity: str  # error | warning | info
    area: str  # rechnungen | vorauszahlungen | mietparteien | stammdaten | einstellungen | verteilung | frist
    message: str


class SettlementPreview(BaseModel):
    apartment_id: int
    year: int
    total_head_months: Decimal
    landlord_vacancy_head_months: Decimal
    total_property_area_sqm: Decimal | None
    unit_area_sqm: Decimal | None
    parties: list[PartySettlement]
    warnings: list[str] = Field(default_factory=list)
    checks: list[PlausibilityCheck] = Field(default_factory=list)


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
    property_id: int | None
    property_name: str | None
    room_count: int
    active_lease_count: int
    billing_years: list[int]


class DashboardPropertySummary(BaseModel):
    id: int
    name: str
    property_type: PropertyType
    unit_count: int
    total_area_sqm: Decimal | None
    billing_years: list[int]


class DeadlineRead(BaseModel):
    year: int
    deadline: date
    days_left: int
    state: str  # exported | open | due_soon | missing | overdue
    billing_year_exists: bool
    exported_at: datetime | None = None

    model_config = {"from_attributes": True}


class DashboardBillingUnit(BaseModel):
    """Unified top-level billing object — WG-Wohnung or MFH-Gebäude."""

    kind: str  # "wg" | "mfh"
    property_id: int
    apartment_id: int | None
    name: str
    street: str
    city: str
    sub_unit_count: int
    sub_unit_label: str
    active_lease_count: int
    billing_years: list[int]
    total_area_sqm: Decimal | None = None
    deadlines: list[DeadlineRead] = Field(default_factory=list)


class DashboardRead(BaseModel):
    billing_units: list[DashboardBillingUnit]
    apartments: list[DashboardApartmentSummary] = Field(default_factory=list)
    properties: list[DashboardPropertySummary] = Field(default_factory=list)
    landlord: LandlordProfileRead | None
