import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bkoab.database import Base


def _str_enum(enum_cls, **kwargs):
    return mapped_column(
        Enum(enum_cls, values_callable=lambda members: [member.value for member in members]),
        **kwargs,
    )


class BillingStatus(str, enum.Enum):
    DRAFT = "draft"
    FINALIZED = "finalized"


class PropertyType(str, enum.Enum):
    EINFAMILIEN = "einfamilien"
    MFH = "mfh"
    WEG = "weg"


class AllocationKey(str, enum.Enum):
    PERSONENMONATE = "personenmonate"
    FLAECHE_QM = "flaeche_qm"


class AllocationScope(str, enum.Enum):
    UNIT = "unit"
    PROPERTY = "property"


class InvoiceType(str, enum.Enum):
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


class LandlordProfile(Base):
    __tablename__ = "landlord_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    street: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    logo_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_text_template: Mapped[str] = mapped_column(Text, default="")


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    street: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(200), default="")
    total_area_sqm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    common_area_sqm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    property_type: Mapped[PropertyType] = _str_enum(
        PropertyType, default=PropertyType.EINFAMILIEN
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    units: Mapped[list["Apartment"]] = relationship(back_populates="property", cascade="all, delete-orphan")
    billing_years: Mapped[list["PropertyBillingYear"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )


class Apartment(Base):
    __tablename__ = "apartments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int | None] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200))
    street: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(200), default="")
    living_area_sqm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    iban: Mapped[str] = mapped_column(String(34), default="")
    account_holder: Mapped[str] = mapped_column(String(200), default="")
    payment_reference_hint: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    property: Mapped["Property | None"] = relationship(back_populates="units")
    rooms: Mapped[list["Room"]] = relationship(back_populates="apartment", cascade="all, delete-orphan")
    billing_years: Mapped[list["BillingYear"]] = relationship(
        back_populates="apartment", cascade="all, delete-orphan"
    )


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    area_sqm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    apartment: Mapped["Apartment"] = relationship(back_populates="rooms")
    leases: Mapped[list["Lease"]] = relationship(back_populates="room", cascade="all, delete-orphan")


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    contact: Mapped[str] = mapped_column(String(300), default="")

    leases: Mapped[list["Lease"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class Lease(Base):
    __tablename__ = "leases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"))
    persons: Mapped[int] = mapped_column(Integer, default=1)
    move_in: Mapped[date] = mapped_column(Date)
    move_out: Mapped[date | None] = mapped_column(Date, nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="leases")
    room: Mapped["Room"] = relationship(back_populates="leases")
    person_periods: Mapped[list["LeasePersonPeriod"]] = relationship(
        back_populates="lease", cascade="all, delete-orphan", order_by="LeasePersonPeriod.valid_from"
    )
    advance_payments: Mapped[list["AdvancePayment"]] = relationship(
        back_populates="lease", cascade="all, delete-orphan"
    )


class LeasePersonPeriod(Base):
    __tablename__ = "lease_person_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lease_id: Mapped[int] = mapped_column(ForeignKey("leases.id", ondelete="CASCADE"))
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    persons: Mapped[int] = mapped_column(Integer, default=1)

    lease: Mapped["Lease"] = relationship(back_populates="person_periods")


class BillingYear(Base):
    __tablename__ = "billing_years"
    __table_args__ = (UniqueConstraint("apartment_id", "year", name="uq_apartment_year"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id", ondelete="CASCADE"))
    year: Mapped[int] = mapped_column(Integer)
    status: Mapped[BillingStatus] = mapped_column(Enum(BillingStatus), default=BillingStatus.DRAFT)

    apartment: Mapped["Apartment"] = relationship(back_populates="billing_years")
    invoices: Mapped[list["Invoice"]] = relationship(
        back_populates="billing_year",
        cascade="all, delete-orphan",
        foreign_keys="Invoice.billing_year_id",
    )


class PropertyBillingYear(Base):
    __tablename__ = "property_billing_years"
    __table_args__ = (UniqueConstraint("property_id", "year", name="uq_property_year"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"))
    year: Mapped[int] = mapped_column(Integer)
    status: Mapped[BillingStatus] = mapped_column(Enum(BillingStatus), default=BillingStatus.DRAFT)

    property: Mapped["Property"] = relationship(back_populates="billing_years")
    invoices: Mapped[list["Invoice"]] = relationship(
        back_populates="property_billing_year",
        cascade="all, delete-orphan",
        foreign_keys="Invoice.property_billing_year_id",
    )


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    billing_year_id: Mapped[int | None] = mapped_column(
        ForeignKey("billing_years.id", ondelete="CASCADE"), nullable=True
    )
    property_billing_year_id: Mapped[int | None] = mapped_column(
        ForeignKey("property_billing_years.id", ondelete="CASCADE"), nullable=True
    )
    invoice_type: Mapped[InvoiceType] = mapped_column(Enum(InvoiceType))
    allocation_key: Mapped[AllocationKey] = _str_enum(
        AllocationKey, default=AllocationKey.PERSONENMONATE
    )
    allocation_scope: Mapped[AllocationScope] = _str_enum(
        AllocationScope, default=AllocationScope.UNIT
    )
    label: Mapped[str] = mapped_column(String(200), default="")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, default="")
    has_document: Mapped[bool] = mapped_column(Boolean, default=False)

    billing_year: Mapped["BillingYear | None"] = relationship(
        back_populates="invoices", foreign_keys=[billing_year_id]
    )
    property_billing_year: Mapped["PropertyBillingYear | None"] = relationship(
        back_populates="invoices", foreign_keys=[property_billing_year_id]
    )


class AdvancePayment(Base):
    __tablename__ = "advance_payments"
    __table_args__ = (UniqueConstraint("lease_id", "month", name="uq_lease_month"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lease_id: Mapped[int] = mapped_column(ForeignKey("leases.id", ondelete="CASCADE"))
    month: Mapped[int] = mapped_column(Integer)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)

    lease: Mapped["Lease"] = relationship(back_populates="advance_payments")
