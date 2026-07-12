from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from bkoab.database import get_db
from bkoab.models import Apartment, Property, PropertyType, Room
from bkoab.schemas import (
    PROPERTY_TYPE_LABELS,
    ApartmentCreate,
    ApartmentRead,
    PropertyCreate,
    PropertyRead,
    PropertyUnitSummary,
    PropertyUpdate,
    RoomRead,
)

router = APIRouter(prefix="/api", tags=["properties"])


def _property_to_read(prop: Property, db: Session) -> PropertyRead:
    units = db.query(Apartment).options(joinedload(Apartment.rooms)).filter(Apartment.property_id == prop.id).all()
    return PropertyRead(
        id=prop.id,
        name=prop.name,
        street=prop.street,
        city=prop.city,
        total_area_sqm=prop.total_area_sqm,
        common_area_sqm=prop.common_area_sqm,
        property_type=prop.property_type,
        property_type_label=PROPERTY_TYPE_LABELS.get(prop.property_type, prop.property_type.value),
        units=[
            PropertyUnitSummary(
                id=u.id,
                name=u.name,
                living_area_sqm=u.living_area_sqm,
                room_count=len(u.rooms),
            )
            for u in units
        ],
    )


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
        rooms=[RoomRead(id=r.id, name=r.name, area_sqm=r.area_sqm) for r in apartment.rooms],
    )


@router.get("/properties", response_model=list[PropertyRead])
def list_properties(db: Session = Depends(get_db)):
    properties = db.query(Property).all()
    return [_property_to_read(p, db) for p in properties]


@router.post("/properties", response_model=PropertyRead, status_code=201)
def create_property(payload: PropertyCreate, db: Session = Depends(get_db)):
    prop = Property(
        name=payload.name,
        street=payload.street,
        city=payload.city,
        total_area_sqm=payload.total_area_sqm,
        common_area_sqm=payload.common_area_sqm,
        property_type=payload.property_type,
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return _property_to_read(prop, db)


@router.get("/properties/{property_id}", response_model=PropertyRead)
def get_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.get(Property, property_id)
    if not prop:
        raise HTTPException(404, "Gebäude nicht gefunden")
    return _property_to_read(prop, db)


@router.put("/properties/{property_id}", response_model=PropertyRead)
def update_property(property_id: int, payload: PropertyUpdate, db: Session = Depends(get_db)):
    prop = db.get(Property, property_id)
    if not prop:
        raise HTTPException(404, "Gebäude nicht gefunden")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    db.commit()
    db.refresh(prop)
    return _property_to_read(prop, db)


@router.delete("/properties/{property_id}", status_code=204)
def delete_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.get(Property, property_id)
    if not prop:
        raise HTTPException(404, "Gebäude nicht gefunden")
    unit_count = db.query(Apartment).filter(Apartment.property_id == property_id).count()
    if unit_count > 0:
        raise HTTPException(400, "Gebäude hat noch Wohnungen und kann nicht gelöscht werden")
    db.delete(prop)
    db.commit()


@router.post("/properties/{property_id}/units", response_model=ApartmentRead, status_code=201)
def create_unit(property_id: int, payload: ApartmentCreate, db: Session = Depends(get_db)):
    prop = db.get(Property, property_id)
    if not prop:
        raise HTTPException(404, "Gebäude nicht gefunden")

    apartment = Apartment(
        property_id=property_id,
        name=payload.name,
        street=payload.street or prop.street,
        city=payload.city or prop.city,
        living_area_sqm=payload.living_area_sqm or payload.total_area_sqm,
    )
    db.add(apartment)
    db.flush()
    if not payload.rooms:
        db.add(
            Room(
                apartment_id=apartment.id,
                name="Wohnung",
                area_sqm=payload.living_area_sqm or payload.total_area_sqm,
            )
        )
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
