from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from bkoab.database import get_db
from bkoab.models import Apartment, BillingYear, LandlordProfile, Lease, Property, PropertyBillingYear, PropertyType, Room, Tenant
from bkoab.schemas import (
    ApartmentCreate,
    ApartmentRead,
    ApartmentUpdate,
    DashboardApartmentSummary,
    DashboardPropertySummary,
    DashboardRead,
    LandlordProfileRead,
    LandlordProfileUpdate,
    RoomCreate,
    RoomRead,
)

router = APIRouter(prefix="/api", tags=["dashboard"])


def _apartment_to_read(apartment: Apartment) -> ApartmentRead:
    return ApartmentRead(
        id=apartment.id,
        property_id=apartment.property_id,
        name=apartment.name,
        street=apartment.street,
        city=apartment.city,
        living_area_sqm=apartment.living_area_sqm,
        iban=apartment.iban,
        account_holder=apartment.account_holder,
        payment_reference_hint=apartment.payment_reference_hint,
        rooms=[RoomRead(id=r.id, name=r.name, area_sqm=r.area_sqm) for r in apartment.rooms],
    )


def _ensure_property_for_apartment(db: Session, apartment: Apartment) -> None:
    if apartment.property_id:
        return
    prop = Property(
        name=apartment.name,
        street=apartment.street,
        city=apartment.city,
        total_area_sqm=apartment.living_area_sqm,
        property_type=PropertyType.EINFAMILIEN,
    )
    db.add(prop)
    db.flush()
    apartment.property_id = prop.id


@router.get("/dashboard", response_model=DashboardRead)
def get_dashboard(db: Session = Depends(get_db)):
    apartments = db.query(Apartment).options(joinedload(Apartment.rooms), joinedload(Apartment.property)).all()
    properties = db.query(Property).all()
    summaries: list[DashboardApartmentSummary] = []
    property_summaries: list[DashboardPropertySummary] = []
    today = __import__("datetime").date.today()

    for apt in apartments:
        years = [by.year for by in db.query(BillingYear).filter(BillingYear.apartment_id == apt.id).all()]
        active_leases = (
            db.query(Lease)
            .join(Room)
            .filter(Room.apartment_id == apt.id)
            .filter(Lease.move_in <= today)
            .filter((Lease.move_out.is_(None)) | (Lease.move_out >= today))
            .count()
        )
        summaries.append(
            DashboardApartmentSummary(
                id=apt.id,
                name=apt.name,
                property_id=apt.property_id,
                property_name=apt.property.name if apt.property else None,
                room_count=len(apt.rooms),
                active_lease_count=active_leases,
                billing_years=sorted(years, reverse=True),
            )
        )

    for prop in properties:
        unit_count = db.query(Apartment).filter(Apartment.property_id == prop.id).count()
        years = [
            by.year
            for by in db.query(PropertyBillingYear).filter(PropertyBillingYear.property_id == prop.id).all()
        ]
        property_summaries.append(
            DashboardPropertySummary(
                id=prop.id,
                name=prop.name,
                property_type=prop.property_type,
                unit_count=unit_count,
                total_area_sqm=prop.total_area_sqm,
                billing_years=sorted(years, reverse=True),
            )
        )

    landlord = db.query(LandlordProfile).first()
    return DashboardRead(
        apartments=summaries,
        properties=property_summaries,
        landlord=LandlordProfileRead.model_validate(landlord) if landlord else None,
    )


@router.get("/apartments", response_model=list[ApartmentRead])
def list_apartments(db: Session = Depends(get_db)):
    apartments = db.query(Apartment).options(joinedload(Apartment.rooms)).all()
    return [_apartment_to_read(a) for a in apartments]


@router.post("/apartments", response_model=ApartmentRead, status_code=201)
def create_apartment(payload: ApartmentCreate, db: Session = Depends(get_db)):
    property_id = payload.property_id
    if property_id:
        prop = db.get(Property, property_id)
        if not prop:
            raise HTTPException(404, "Gebäude nicht gefunden")

    apartment = Apartment(
        property_id=property_id,
        name=payload.name,
        street=payload.street,
        city=payload.city,
        living_area_sqm=payload.living_area_sqm,
        iban=payload.iban,
        account_holder=payload.account_holder,
        payment_reference_hint=payload.payment_reference_hint,
    )
    db.add(apartment)
    db.flush()

    if not property_id:
        _ensure_property_for_apartment(db, apartment)

    for room in payload.rooms:
        db.add(Room(apartment_id=apartment.id, name=room.name, area_sqm=room.area_sqm))
    db.commit()
    apartment = db.query(Apartment).options(joinedload(Apartment.rooms)).filter(Apartment.id == apartment.id).one()
    return _apartment_to_read(apartment)


@router.get("/apartments/{apartment_id}", response_model=ApartmentRead)
def get_apartment(apartment_id: int, db: Session = Depends(get_db)):
    apartment = (
        db.query(Apartment)
        .options(joinedload(Apartment.rooms))
        .filter(Apartment.id == apartment_id)
        .first()
    )
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")
    return _apartment_to_read(apartment)


@router.put("/apartments/{apartment_id}", response_model=ApartmentRead)
def update_apartment(apartment_id: int, payload: ApartmentUpdate, db: Session = Depends(get_db)):
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(apartment, field, value)
    db.commit()
    apartment = db.query(Apartment).options(joinedload(Apartment.rooms)).filter(Apartment.id == apartment_id).one()
    return _apartment_to_read(apartment)


@router.post("/apartments/{apartment_id}/rooms", response_model=RoomRead, status_code=201)
def add_room(apartment_id: int, payload: RoomCreate, db: Session = Depends(get_db)):
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")
    if not payload.name.strip():
        raise HTTPException(400, "Zimmername darf nicht leer sein")
    room = Room(apartment_id=apartment_id, name=payload.name.strip(), area_sqm=payload.area_sqm)
    db.add(room)
    db.commit()
    db.refresh(room)
    return RoomRead.model_validate(room)


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: int, db: Session = Depends(get_db)):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Zimmer nicht gefunden")
    if db.query(Lease).filter(Lease.room_id == room_id).count() > 0:
        raise HTTPException(400, "Zimmer hat Mietverträge und kann nicht gelöscht werden")
    apartment_id = room.apartment_id
    remaining = db.query(Room).filter(Room.apartment_id == apartment_id, Room.id != room_id).count()
    if remaining == 0:
        raise HTTPException(400, "Das letzte Zimmer einer Wohnung kann nicht gelöscht werden")
    db.delete(room)
    db.commit()


@router.delete("/apartments/{apartment_id}", status_code=204)
def delete_apartment(apartment_id: int, db: Session = Depends(get_db)):
    apartment = db.get(Apartment, apartment_id)
    if not apartment:
        raise HTTPException(404, "Wohnung nicht gefunden")
    db.delete(apartment)
    db.commit()


@router.get("/landlord-profile", response_model=LandlordProfileRead | None)
def get_landlord_profile(db: Session = Depends(get_db)):
    landlord = db.query(LandlordProfile).first()
    return LandlordProfileRead.model_validate(landlord) if landlord else None


@router.put("/landlord-profile", response_model=LandlordProfileRead)
def upsert_landlord_profile(payload: LandlordProfileUpdate, db: Session = Depends(get_db)):
    landlord = db.query(LandlordProfile).first()
    if not landlord:
        landlord = LandlordProfile(name=payload.name)
        db.add(landlord)
    for field, value in payload.model_dump().items():
        setattr(landlord, field, value)
    db.commit()
    db.refresh(landlord)
    return LandlordProfileRead.model_validate(landlord)
