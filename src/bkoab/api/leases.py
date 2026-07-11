from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from bkoab.database import get_db
from bkoab.models import Lease, LeasePersonPeriod, Room, Tenant
from bkoab.schemas import (
    LeaseCreate,
    LeaseRead,
    LeaseUpdate,
    PersonPeriodBulkUpdate,
    PersonPeriodRead,
)
from bkoab.services.person_periods import ensure_default_person_periods, validate_person_periods

router = APIRouter(prefix="/api", tags=["leases"])


def _lease_to_read(lease: Lease) -> LeaseRead:
    return LeaseRead(
        id=lease.id,
        tenant_id=lease.tenant.id,
        tenant_name=lease.tenant.name,
        room_id=lease.room_id,
        room_name=lease.room.name,
        persons=lease.persons,
        move_in=lease.move_in,
        move_out=lease.move_out,
        person_periods=[PersonPeriodRead.model_validate(p) for p in lease.person_periods],
    )


def _validate_no_overlap(db: Session, room_id: int, move_in, move_out, exclude_id: int | None = None):
    leases = db.query(Lease).filter(Lease.room_id == room_id)
    if exclude_id:
        leases = leases.filter(Lease.id != exclude_id)
    for existing in leases.all():
        existing_end = existing.move_out or __import__("datetime").date.max
        new_end = move_out or __import__("datetime").date.max
        if move_in <= existing_end and existing.move_in <= new_end:
            raise HTTPException(400, f"Überlappung mit Mietvertrag {existing.id}")


@router.get("/apartments/{apartment_id}/leases", response_model=list[LeaseRead])
def list_leases(apartment_id: int, db: Session = Depends(get_db)):
    leases = (
        db.query(Lease)
        .join(Tenant)
        .join(Room)
        .options(
            joinedload(Lease.tenant),
            joinedload(Lease.room),
            joinedload(Lease.person_periods),
        )
        .filter(Room.apartment_id == apartment_id)
        .all()
    )
    for lease in leases:
        ensure_default_person_periods(lease, db)
    return [_lease_to_read(lease) for lease in leases]


@router.post("/apartments/{apartment_id}/leases", response_model=LeaseRead, status_code=201)
def create_lease(apartment_id: int, payload: LeaseCreate, db: Session = Depends(get_db)):
    room = db.get(Room, payload.room_id)
    if not room or room.apartment_id != apartment_id:
        raise HTTPException(404, "Zimmer nicht gefunden")

    _validate_no_overlap(db, payload.room_id, payload.move_in, payload.move_out)

    if payload.tenant_id:
        tenant = db.get(Tenant, payload.tenant_id)
        if not tenant:
            raise HTTPException(404, "Mieter nicht gefunden")
    else:
        if not payload.tenant_name:
            raise HTTPException(400, "Mietername erforderlich")
        tenant = Tenant(name=payload.tenant_name, contact=payload.tenant_contact)
        db.add(tenant)
        db.flush()

    lease = Lease(
        tenant_id=tenant.id,
        room_id=payload.room_id,
        persons=payload.persons,
        move_in=payload.move_in,
        move_out=payload.move_out,
    )
    db.add(lease)
    db.flush()
    db.add(
        LeasePersonPeriod(
            lease_id=lease.id,
            valid_from=payload.move_in,
            valid_to=payload.move_out,
            persons=payload.persons,
        )
    )
    db.commit()
    lease = (
        db.query(Lease)
        .options(
            joinedload(Lease.tenant),
            joinedload(Lease.room),
            joinedload(Lease.person_periods),
        )
        .filter(Lease.id == lease.id)
        .one()
    )
    return _lease_to_read(lease)


@router.put("/leases/{lease_id}", response_model=LeaseRead)
def update_lease(lease_id: int, payload: LeaseUpdate, db: Session = Depends(get_db)):
    lease = (
        db.query(Lease)
        .options(
            joinedload(Lease.tenant),
            joinedload(Lease.room),
            joinedload(Lease.person_periods),
        )
        .filter(Lease.id == lease_id)
        .first()
    )
    if not lease:
        raise HTTPException(404, "Mietvertrag nicht gefunden")

    move_in = payload.move_in or lease.move_in
    move_out = payload.move_out if payload.move_out is not None else lease.move_out
    _validate_no_overlap(db, lease.room_id, move_in, move_out, exclude_id=lease_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lease, field, value)
    db.commit()
    db.refresh(lease)
    return _lease_to_read(lease)


@router.put("/leases/{lease_id}/person-periods", response_model=list[PersonPeriodRead])
def update_person_periods(
    lease_id: int,
    payload: PersonPeriodBulkUpdate,
    db: Session = Depends(get_db),
):
    lease = (
        db.query(Lease)
        .options(joinedload(Lease.person_periods))
        .filter(Lease.id == lease_id)
        .first()
    )
    if not lease:
        raise HTTPException(404, "Mietvertrag nicht gefunden")

    try:
        validate_person_periods(lease, payload.periods)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    for existing in list(lease.person_periods):
        db.delete(existing)
    db.flush()

    created: list[LeasePersonPeriod] = []
    for period in payload.periods:
        row = LeasePersonPeriod(
            lease_id=lease.id,
            valid_from=period.valid_from,
            valid_to=period.valid_to,
            persons=period.persons,
        )
        db.add(row)
        created.append(row)

    db.commit()
    for row in created:
        db.refresh(row)
    return [PersonPeriodRead.model_validate(p) for p in created]


@router.delete("/leases/{lease_id}", status_code=204)
def delete_lease(lease_id: int, db: Session = Depends(get_db)):
    lease = db.get(Lease, lease_id)
    if not lease:
        raise HTTPException(404, "Mietvertrag nicht gefunden")
    db.delete(lease)
    db.commit()
