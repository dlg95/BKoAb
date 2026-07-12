from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from bkoab.database import get_db
from bkoab.models import Apartment, BillingYear, LandlordProfile, Lease, Property, PropertyBillingYear, PropertyType, Room, Tenant
from bkoab.schemas import (
    ApartmentCreate,
    ApartmentRead,
    ApartmentUpdate,
    DashboardApartmentSummary,
    DashboardBillingUnit,
    DashboardPropertySummary,
    DashboardRead,
    LandlordProfileRead,
    LandlordProfileUpdate,
    RoomCreate,
    RoomRead,
    RoomUpdate,
)


def _property_kind(prop: Property, unit_count: int) -> str:
    if prop.property_type in (PropertyType.MFH, PropertyType.WEG) or unit_count > 1:
        return "mfh"
    return "wg"

router = APIRouter(prefix="/api", tags=["dashboard"])


def _apartment_to_read(apartment: Apartment) -> ApartmentRead:
    prop = apartment.property if hasattr(apartment, "property") else None
    total_area = prop.total_area_sqm if prop and prop.total_area_sqm is not None else apartment.living_area_sqm
    return ApartmentRead(
        id=apartment.id,
        property_id=apartment.property_id,
        name=apartment.name,
        street=apartment.street,
        city=apartment.city,
        total_area_sqm=total_area,
        living_area_sqm=apartment.living_area_sqm,
        mea_share=apartment.mea_share,
        consumption_amount=apartment.consumption_amount,
        rooms=[
            RoomRead(
                id=r.id,
                name=r.name,
                area_sqm=r.area_sqm,
                consumption_amount=r.consumption_amount,
            )
            for r in apartment.rooms
        ],
    )


def _sync_wg_property(db: Session, apartment: Apartment, *, total_area_sqm) -> None:
    if not apartment.property_id:
        return
    prop = db.get(Property, apartment.property_id)
    if not prop or prop.property_type != PropertyType.EINFAMILIEN:
        return
    prop.name = apartment.name
    prop.street = apartment.street
    prop.city = apartment.city
    prop.total_area_sqm = total_area_sqm
    apartment.living_area_sqm = total_area_sqm


def _ensure_property_for_apartment(db: Session, apartment: Apartment, total_area_sqm=None) -> None:
    if apartment.property_id:
        return
    area = total_area_sqm if total_area_sqm is not None else apartment.living_area_sqm
    prop = Property(
        name=apartment.name,
        street=apartment.street,
        city=apartment.city,
        total_area_sqm=area,
        property_type=PropertyType.EINFAMILIEN,
    )
    db.add(prop)
    db.flush()
    apartment.property_id = prop.id
    if area is not None:
        apartment.living_area_sqm = area


@router.get("/dashboard", response_model=DashboardRead)
def get_dashboard(db: Session = Depends(get_db)):
    apartments = db.query(Apartment).options(joinedload(Apartment.rooms), joinedload(Apartment.property)).all()
    properties = db.query(Property).all()
    billing_units: list[DashboardBillingUnit] = []
    today = __import__("datetime").date.today()

    apartments_by_property: dict[int, list[Apartment]] = {}
    for apt in apartments:
        if apt.property_id:
            apartments_by_property.setdefault(apt.property_id, []).append(apt)

    for prop in properties:
        units = apartments_by_property.get(prop.id, [])
        unit_count = len(units)
        kind = _property_kind(prop, unit_count)

        if kind == "wg":
            apt = units[0] if units else None
            years = (
                [by.year for by in db.query(BillingYear).filter(BillingYear.apartment_id == apt.id).all()]
                if apt
                else []
            )
            active_leases = (
                db.query(Lease)
                .join(Room)
                .filter(Room.apartment_id == apt.id)
                .filter(Lease.move_in <= today)
                .filter((Lease.move_out.is_(None)) | (Lease.move_out >= today))
                .count()
                if apt
                else 0
            )
            billing_units.append(
                DashboardBillingUnit(
                    kind="wg",
                    property_id=prop.id,
                    apartment_id=apt.id if apt else None,
                    name=prop.name,
                    street=prop.street,
                    city=prop.city,
                    sub_unit_count=len(apt.rooms) if apt else 0,
                    sub_unit_label="Zimmer",
                    active_lease_count=active_leases,
                    billing_years=sorted(years, reverse=True),
                    total_area_sqm=prop.total_area_sqm,
                )
            )
        else:
            active_leases = (
                db.query(Lease)
                .join(Room)
                .join(Apartment)
                .filter(Apartment.property_id == prop.id)
                .filter(Lease.move_in <= today)
                .filter((Lease.move_out.is_(None)) | (Lease.move_out >= today))
                .count()
            )
            years = [
                by.year
                for by in db.query(PropertyBillingYear).filter(PropertyBillingYear.property_id == prop.id).all()
            ]
            billing_units.append(
                DashboardBillingUnit(
                    kind="mfh",
                    property_id=prop.id,
                    apartment_id=None,
                    name=prop.name,
                    street=prop.street,
                    city=prop.city,
                    sub_unit_count=unit_count,
                    sub_unit_label="Wohnungen" if unit_count != 1 else "Wohnung",
                    active_lease_count=active_leases,
                    billing_years=sorted(years, reverse=True),
                    total_area_sqm=prop.total_area_sqm,
                )
            )

    billing_units.sort(key=lambda item: item.name.lower())
    landlord = db.query(LandlordProfile).first()
    return DashboardRead(
        billing_units=billing_units,
        landlord=LandlordProfileRead.model_validate(landlord) if landlord else None,
    )


@router.get("/apartments", response_model=list[ApartmentRead])
def list_apartments(db: Session = Depends(get_db)):
    apartments = (
        db.query(Apartment)
        .options(joinedload(Apartment.rooms), joinedload(Apartment.property))
        .all()
    )
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
        living_area_sqm=payload.total_area_sqm,
    )
    db.add(apartment)
    db.flush()

    if not property_id:
        _ensure_property_for_apartment(db, apartment, payload.total_area_sqm)
    elif payload.total_area_sqm is not None:
        apartment.living_area_sqm = payload.total_area_sqm

    for room in payload.rooms:
        db.add(Room(apartment_id=apartment.id, name=room.name, area_sqm=room.area_sqm))
    db.commit()
    apartment = (
        db.query(Apartment)
        .options(joinedload(Apartment.rooms), joinedload(Apartment.property))
        .filter(Apartment.id == apartment.id)
        .one()
    )
    return _apartment_to_read(apartment)


@router.get("/apartments/{apartment_id}", response_model=ApartmentRead)
def get_apartment(apartment_id: int, db: Session = Depends(get_db)):
    apartment = (
        db.query(Apartment)
        .options(joinedload(Apartment.rooms), joinedload(Apartment.property))
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
        if field in ("total_area_sqm", "living_area_sqm"):
            apartment.living_area_sqm = value
        else:
            setattr(apartment, field, value)
    _sync_wg_property(db, apartment, total_area_sqm=apartment.living_area_sqm)
    db.commit()
    apartment = (
        db.query(Apartment)
        .options(joinedload(Apartment.rooms), joinedload(Apartment.property))
        .filter(Apartment.id == apartment_id)
        .one()
    )
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


@router.put("/rooms/{room_id}", response_model=RoomRead)
def update_room(room_id: int, payload: RoomUpdate, db: Session = Depends(get_db)):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Zimmer nicht gefunden")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "name" and value is not None and not str(value).strip():
            raise HTTPException(400, "Zimmername darf nicht leer sein")
        setattr(room, field, value.strip() if field == "name" and isinstance(value, str) else value)
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
