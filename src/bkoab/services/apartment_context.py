"""WG vs MFH context for apartments (MFH Wohnung ≈ WG Zimmer hierarchy level)."""

from bkoab.models import Apartment, PropertyType


def apartment_billing_kind(apartment: Apartment) -> str:
    if not apartment.property_id:
        return "wg"
    prop = apartment.property
    if prop and prop.property_type != PropertyType.EINFAMILIEN:
        return "mfh"
    return "wg"


def is_wg_apartment(apartment: Apartment) -> bool:
    return apartment_billing_kind(apartment) == "wg"
