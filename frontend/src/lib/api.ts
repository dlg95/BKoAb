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
  name: string
  street: string
  city: string
  iban: string
  account_holder: string
  payment_reference_hint: string
  rooms: { id: number; name: string }[]
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
  invoice_type: string
  invoice_type_label: string
  label: string
  amount: string
  period_start: string
  period_end: string
  note: string
  prorated_amount: string | null
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
  cost_lines: {
    invoice_id: number
    label: string
    total_prorated: string
    party_head_months: string
    party_share: string
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

export const api = {
  dashboard: () => request<{ apartments: { id: number; name: string; room_count: number; active_lease_count: number; billing_years: number[] }[]; landlord: LandlordProfile | null }>("/dashboard"),
  apartments: () => request<Apartment[]>("/apartments"),
  createApartment: (data: object) => request<Apartment>("/apartments", { method: "POST", body: JSON.stringify(data) }),
  getApartment: (id: number) => request<Apartment>(`/apartments/${id}`),
  updateApartment: (id: number, data: object) => request<Apartment>(`/apartments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  addRoom: (apartmentId: number, name: string) =>
    request<{ id: number; name: string }>(`/apartments/${apartmentId}/rooms`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteRoom: (roomId: number) => request<void>(`/rooms/${roomId}`, { method: "DELETE" }),
  deleteApartment: (id: number) => request<void>(`/apartments/${id}`, { method: "DELETE" }),
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
  invoices: (apartmentId: number, year: number) => request<Invoice[]>(`/apartments/${apartmentId}/billing-years/${year}/invoices`),
  createInvoice: (apartmentId: number, year: number, data: object) => request<Invoice>(`/apartments/${apartmentId}/billing-years/${year}/invoices`, { method: "POST", body: JSON.stringify(data) }),
  deleteInvoice: (id: number) => request<void>(`/invoices/${id}`, { method: "DELETE" }),
  advancePayments: (apartmentId: number, year: number) => request<AdvancePaymentRow[]>(`/apartments/${apartmentId}/billing-years/${year}/advance-payments`),
  updateAdvancePayments: (apartmentId: number, year: number, payments: object[]) =>
    request(`/apartments/${apartmentId}/billing-years/${year}/advance-payments`, { method: "PUT", body: JSON.stringify({ payments }) }),
  preview: (apartmentId: number, year: number) => request<SettlementPreview>(`/apartments/${apartmentId}/billing-years/${year}/preview`),
  export: (apartmentId: number, year: number) =>
    request<{ files: { lease_id: number; tenant_name: string; filename: string }[] }>(`/apartments/${apartmentId}/billing-years/${year}/export`, { method: "POST" }),
  exportPartyDocx: (apartmentId: number, year: number, leaseId: number, tenantName: string) =>
    fetchDocxExport(
      `${API_BASE}/apartments/${apartmentId}/billing-years/${year}/export/${leaseId}`,
      `Abrechnung_${year}_${tenantName}.docx`,
    ),
  landlord: () => request<LandlordProfile | null>("/landlord-profile"),
  updateLandlord: (data: object) => request<LandlordProfile>("/landlord-profile", { method: "PUT", body: JSON.stringify(data) }),
}

export function formatEur(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num)
}

export const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
