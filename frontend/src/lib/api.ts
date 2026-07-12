import { fetchDocxExport } from "@/lib/download"

const API_BASE = "/api"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export type Apartment = {
  id: number
  property_id: number | null
  name: string
  street: string
  city: string
  total_area_sqm: string | null
  living_area_sqm: string | null
  mea_share: string | null
  consumption_amount: string | null
  rooms: { id: number; name: string; area_sqm: string | null; consumption_amount: string | null }[]
}

export type Property = {
  id: number
  name: string
  street: string
  city: string
  total_area_sqm: string | null
  common_area_sqm: string | null
  property_type: string
  property_type_label: string
  units: {
    id: number
    name: string
    living_area_sqm: string | null
    mea_share: string | null
    consumption_amount: string | null
    room_count: number
  }[]
}

export type Lease = {
  id: number
  tenant_id: number
  tenant_name: string
  room_id: number
  room_name: string
  persons: number
  move_in: string
  move_out: string | null
  person_periods: {
    id: number
    valid_from: string
    valid_to: string | null
    persons: number
  }[]
}

export type Invoice = {
  id: number
  billing_year_id: number | null
  property_billing_year_id: number | null
  invoice_type: string
  invoice_type_label: string
  allocation_key: string
  allocation_key_label: string
  allocation_scope: string
  label: string
  amount: string
  period_start: string
  period_end: string
  note: string
  prorated_amount: string | null
  has_document: boolean
}

export type AdvancePaymentRow = {
  lease_id: number
  tenant_name: string
  room_name: string
  months: Record<string, string>
  occupied_months: number[]
}

export type PartySettlement = {
  lease_id: number
  tenant_name: string
  room_name: string
  head_months: string
  living_area_sqm: string | null
  cost_lines: {
    invoice_id: number
    label: string
    allocation_key: string
    total_prorated: string
    party_numerator: string
    party_denominator: string
    party_share: string
    has_document: boolean
  }[]
  total_costs: string
  total_advance_payments: string
  balance: string
  balance_type: string
}

export type SettlementPreview = {
  apartment_id: number
  year: number
  total_head_months: string
  landlord_vacancy_head_months: string
  total_property_area_sqm: string | null
  unit_area_sqm: string | null
  parties: PartySettlement[]
  warnings: string[]
}

export type LandlordProfile = {
  id: number
  name: string
  street: string
  city: string
  phone: string
  email: string
  logo_filename: string | null
  payment_text_template: string
}

export const DEFAULT_ALLOCATION_BY_TYPE: Record<string, string> = {
  weg: "flaeche_qm",
  gas: "personenmonate",
  strom: "personenmonate",
  handwerker: "personenmonate",
  grundsteuer: "flaeche_qm",
  sonstiges: "personenmonate",
  hausmeister: "flaeche_qm",
  aufzug: "flaeche_qm",
  versicherung: "flaeche_qm",
  schornsteinfeger: "wohneinheiten",
  wasser_abwasser: "direktzuordnung",
  muell: "flaeche_qm",
  kabel: "wohneinheiten",
  heizung_gebaeude: "flaeche_qm",
}

export const api = {
  dashboard: () =>
    request<{
      billing_units: {
        kind: "wg" | "mfh"
        property_id: number
        apartment_id: number | null
        name: string
        street: string
        city: string
        sub_unit_count: number
        sub_unit_label: string
        active_lease_count: number
        billing_years: number[]
        total_area_sqm: string | null
      }[]
      landlord: LandlordProfile | null
    }>("/dashboard"),
  apartments: () => request<Apartment[]>("/apartments"),
  createApartment: (data: object) => request<Apartment>("/apartments", { method: "POST", body: JSON.stringify(data) }),
  getApartment: (id: number) => request<Apartment>(`/apartments/${id}`),
  updateApartment: (id: number, data: object) => request<Apartment>(`/apartments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  addRoom: (apartmentId: number, name: string, area_sqm?: string) =>
    request<{ id: number; name: string }>(`/apartments/${apartmentId}/rooms`, {
      method: "POST",
      body: JSON.stringify({ name, area_sqm: area_sqm || null }),
    }),
  deleteRoom: (roomId: number) => request<void>(`/rooms/${roomId}`, { method: "DELETE" }),
  updateRoom: (roomId: number, data: { name?: string; area_sqm?: string | null; consumption_amount?: string | null }) =>
    request<{ id: number; name: string; area_sqm: string | null }>(`/rooms/${roomId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteApartment: (id: number) => request<void>(`/apartments/${id}`, { method: "DELETE" }),
  properties: () => request<Property[]>("/properties"),
  createProperty: (data: object) => request<Property>("/properties", { method: "POST", body: JSON.stringify(data) }),
  getProperty: (id: number) => request<Property>(`/properties/${id}`),
  updateProperty: (id: number, data: object) => request<Property>(`/properties/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProperty: (id: number) => request<void>(`/properties/${id}`, { method: "DELETE" }),
  createUnit: (propertyId: number, data: object) =>
    request<Apartment>(`/properties/${propertyId}/units`, { method: "POST", body: JSON.stringify(data) }),
  leases: (apartmentId: number) => request<Lease[]>(`/apartments/${apartmentId}/leases`),
  createLease: (apartmentId: number, data: object) => request<Lease>(`/apartments/${apartmentId}/leases`, { method: "POST", body: JSON.stringify(data) }),
  deleteLease: (id: number) => request<void>(`/leases/${id}`, { method: "DELETE" }),
  updatePersonPeriods: (leaseId: number, periods: object[]) =>
    request<Lease["person_periods"]>(`/leases/${leaseId}/person-periods`, {
      method: "PUT",
      body: JSON.stringify({ periods }),
    }),
  billingYears: (apartmentId: number) =>
    request<{ id: number; apartment_id: number; year: number; status: string }[]>(
      `/apartments/${apartmentId}/billing-years`,
    ),
  createBillingYear: (apartmentId: number, year: number) =>
    request<{ id: number; apartment_id: number; year: number; status: string }>(
      `/apartments/${apartmentId}/billing-years`,
      { method: "POST", body: JSON.stringify({ year }) },
    ),
  getBillingYear: (apartmentId: number, year: number) =>
    request<{ id: number; apartment_id: number; year: number; status: string }>(
      `/apartments/${apartmentId}/billing-years/${year}`,
    ),
  propertyBillingYears: (propertyId: number) =>
    request<{ id: number; property_id: number; year: number; status: string }[]>(
      `/properties/${propertyId}/billing-years`,
    ),
  createPropertyBillingYear: (propertyId: number, year: number) =>
    request<{ id: number; property_id: number; year: number; status: string }>(
      `/properties/${propertyId}/billing-years`,
      { method: "POST", body: JSON.stringify({ year }) },
    ),
  getPropertyBillingYear: (propertyId: number, year: number) =>
    request<{ id: number; property_id: number; year: number; status: string }>(
      `/properties/${propertyId}/billing-years/${year}`,
    ),
  invoices: (apartmentId: number, year: number) => request<Invoice[]>(`/apartments/${apartmentId}/billing-years/${year}/invoices`),
  propertyInvoices: (propertyId: number, year: number) =>
    request<Invoice[]>(`/properties/${propertyId}/billing-years/${year}/invoices`),
  createInvoice: (apartmentId: number, year: number, data: object) =>
    request<Invoice>(`/apartments/${apartmentId}/billing-years/${year}/invoices`, { method: "POST", body: JSON.stringify(data) }),
  createPropertyInvoice: (propertyId: number, year: number, data: object) =>
    request<Invoice>(`/properties/${propertyId}/billing-years/${year}/invoices`, { method: "POST", body: JSON.stringify(data) }),
  updateInvoice: (id: number, data: object) => request<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteInvoice: (id: number) => request<void>(`/invoices/${id}`, { method: "DELETE" }),
  uploadInvoiceDocument: async (invoiceId: number, file: File) => {
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`${API_BASE}/invoices/${invoiceId}/document`, { method: "POST", body: form })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  downloadInvoiceDocument: (invoiceId: number) =>
    `${API_BASE}/invoices/${invoiceId}/document`,
  deleteInvoiceDocument: (invoiceId: number) =>
    request<void>(`/invoices/${invoiceId}/document`, { method: "DELETE" }),
  advancePayments: (apartmentId: number, year: number) => request<AdvancePaymentRow[]>(`/apartments/${apartmentId}/billing-years/${year}/advance-payments`),
  updateAdvancePayments: (apartmentId: number, year: number, payments: object[]) =>
    request(`/apartments/${apartmentId}/billing-years/${year}/advance-payments`, { method: "PUT", body: JSON.stringify({ payments }) }),
  preview: (apartmentId: number, year: number) => request<SettlementPreview>(`/apartments/${apartmentId}/billing-years/${year}/preview`),
  export: (apartmentId: number, year: number) =>
    request<{ files: { lease_id: number; tenant_name: string; filename: string }[] }>(`/apartments/${apartmentId}/billing-years/${year}/export`, { method: "POST" }),
  exportPartyDocx: (
    apartmentId: number,
    year: number,
    leaseId: number,
    tenantName: string,
    roomName: string,
  ) =>
    fetchDocxExport(
      `${API_BASE}/apartments/${apartmentId}/billing-years/${year}/export/${leaseId}`,
      `Abrechnung_${year}_${tenantName}_${roomName}.docx`,
    ),
  landlord: () => request<LandlordProfile | null>("/landlord-profile"),
  updateLandlord: (data: object) => request<LandlordProfile>("/landlord-profile", { method: "PUT", body: JSON.stringify(data) }),
}

export function formatEur(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num)
}

export const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
