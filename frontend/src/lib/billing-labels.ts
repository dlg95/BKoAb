/** Parallel naming: same hierarchy, different labels per scenario. */

export type BillingKind = "wg" | "mfh"

export function billingKind(propertyType: string, unitCount: number): BillingKind {
  if (propertyType === "mfh" || propertyType === "weg" || unitCount > 1) {
    return "mfh"
  }
  return "wg"
}

/** Applies to WG and MFH alike — allocation is per invoice, not per object type. */
export const ALLOCATION_PER_INVOICE_HINT =
  "Die Verteilerquote (Personenmonate oder Fläche m²) wählen Sie pro Rechnung — Mischabrechnungen sind normal."

export const BILLING_LABELS = {
  wg: {
    topUnit: "WG-Wohnung",
    topUnitPlural: "WG-Wohnungen",
    subUnit: "Zimmer",
    subUnitPlural: "Zimmer",
    createTop: "WG-Wohnung anlegen",
    manageTop: "WG-Wohnung verwalten",
    hierarchyHint:
      "Übereinheit = WG-Wohnung · Untereinheit = Zimmer · Mietparteien mit Personenzeiträumen",
  },
  mfh: {
    topUnit: "Gebäude",
    topUnitPlural: "Gebäude",
    subUnit: "Wohnung",
    subUnitPlural: "Wohnungen",
    createTop: "Gebäude anlegen",
    manageTop: "Gebäude verwalten",
    hierarchyHint:
      "Übereinheit = Gebäude (MFH/WEG) · Untereinheit = Wohnung · Nutzfläche für Flächen-Rechnungen",
  },
} as const

export function labelsFor(kind: BillingKind) {
  return BILLING_LABELS[kind]
}

export const TOP_UNIT_STAMMDATEN = {
  name: "Bezeichnung",
  street: "Straße",
  city: "PLZ / Ort",
  total_area_sqm: "Gesamtfläche (m²)",
} as const

export function subUnitLabel(kind: BillingKind, count: number) {
  const labels = labelsFor(kind)
  return count === 1 ? labels.subUnit : labels.subUnitPlural
}
