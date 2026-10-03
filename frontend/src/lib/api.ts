import { fetchExport, fetchExportGet } from "@/lib/download"
import { ApiError, parseErrorDetail } from "@/lib/errors"

export { ApiError, errorMessage, parseErrorDetail } from "@/lib/errors"

const API_BASE = "/api"

async function throwApiError(res: Response): Promise<never> {
  const text = await res.text()
  throw new ApiError(res.status, parseErrorDetail(text, res.statusText || `Fehler ${res.status}`))
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })
  if (!res.ok) await throwApiError(res)
  if (res.status === 204) return undefined as T
  return res.json()
}

export type Apartment = {
  id: number
  property_id: number | null
  billing_kind: "wg" | "mfh"
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
  tenant_contact: string
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
  /** Planned monthly advance payments (Soll), each valid from a month onwards. */
  advance_rates: AdvanceRate[]
  current_advance_payment: string | null
}

export type AdvanceRate = { valid_from: string; amount: string }

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
  target_lease_ids: number[]
}

export type AdvancePaymentRow = {
  lease_id: number
  tenant_name: string
  room_name: string
  months: Record<string, string>
  occupied_months: number[]
  /** Planned rate per occupied month (null = no Soll defined). */
  planned: Record<string, string | null>
  /** Months with an own entry (deviation from the Soll). */
  overridden_months: number[]
}

export type PlausibilityCheck = {
  severity: "error" | "warning" | "info"
  area: "rechnungen" | "vorauszahlungen" | "mietparteien" | "stammdaten" | "einstellungen" | "verteilung" | "frist"
  message: string
}

export type Deadline = {
  year: number
  deadline: string
  days_left: number
  state: "exported" | "open" | "due_soon" | "missing" | "overdue"
  billing_year_exists: boolean
  exported_at: string | null
}

export type BackupItem = { filename: string; created_at: string; size_bytes: number; reason: string }

export type ExportFormat = "docx" | "pdf" | "both"

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
  is_current_tenant: boolean
  current_advance_payment: string | null
  suggested_advance_payment: string | null
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
  checks: PlausibilityCheck[]
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

/** Default Verteilerquote for new invoices: always head-months (pro Kopf). */
export const DEFAULT_ALLOCATION_KEY = "personenmonate"

/** @deprecated Prefer DEFAULT_ALLOCATION_KEY; kept for callers that keyed by type. */
export const DEFAULT_ALLOCATION_BY_TYPE: Record<string, string> = new Proxy(
  {},
  { get: () => DEFAULT_ALLOCATION_KEY },
)

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
        deadlines: Deadline[]
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
  updateLease: (
    id: number,
    data: {
      tenant_name?: string
      tenant_contact?: string
      room_id?: number
      persons?: number
      move_in?: string
      move_out?: string | null
    },
  ) => request<Lease>(`/leases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateAdvanceRates: (leaseId: number, rates: AdvanceRate[]) =>
    request<AdvanceRate[]>(`/leases/${leaseId}/advance-rates`, {
      method: "PUT",
      body: JSON.stringify({ rates }),
    }),
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
    if (!res.ok) await throwApiError(res)
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
    includeAdvanceSuggestion = true,
  ) =>
    fetchExport(
      `${API_BASE}/apartments/${apartmentId}/billing-years/${year}/export/${leaseId}?include_advance_suggestion=${includeAdvanceSuggestion}`,
      `Abrechnung_${year}_${tenantName}_${roomName}.docx`,
    ),
  exportPartyPdf: (
    apartmentId: number,
    year: number,
    leaseId: number,
    tenantName: string,
    roomName: string,
    includeAdvanceSuggestion = true,
  ) =>
    fetchExport(
      `${API_BASE}/apartments/${apartmentId}/billing-years/${year}/export/${leaseId}/pdf?include_advance_suggestion=${includeAdvanceSuggestion}`,
      `Abrechnung_${year}_${tenantName}_${roomName}.pdf`,
    ),
  exportAllZip: (apartmentId: number, year: number, format: ExportFormat, includeAdvanceSuggestion = true) =>
    fetchExport(
      `${API_BASE}/apartments/${apartmentId}/billing-years/${year}/export-zip?format=${format}&include_advance_suggestion=${includeAdvanceSuggestion}`,
      `Abrechnungen_${year}.zip`,
    ),
  backups: () =>
    request<{ directory: string; interval_days: number; keep: number; items: BackupItem[] }>("/backups"),
  createBackup: () => request<BackupItem>("/backups", { method: "POST" }),
  backupDownloadUrl: (filename: string) => `${API_BASE}/backups/${encodeURIComponent(filename)}`,
  restoreBackup: (filename: string) =>
    request<{ ok: boolean; imported_files: number; backup_path: string | null }>(
      `/backups/${encodeURIComponent(filename)}/restore`,
      { method: "POST" },
    ),
  landlord: () => request<LandlordProfile | null>("/landlord-profile"),
  updateLandlord: (data: object) =>
    request<LandlordProfile>("/landlord-profile", { method: "PUT", body: JSON.stringify(data) }),
  exportAllUserData: () =>
    fetchExportGet(`${API_BASE}/data-export`, "BKoAb_Datenexport.zip"),
  importAllUserData: async (file: File) => {
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`${API_BASE}/data-import`, { method: "POST", body: form })
    if (!res.ok) await throwApiError(res)
    return res.json() as Promise<{
      ok: boolean
      imported_files: number
      imported: string[]
      backup_path: string | null
      exported_at?: string
    }>
  },
}

export function formatDate(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback
  const [y, m, d] = value.split("-")
  if (!y || !m || !d) return value
  return `${d}.${m}.${y}`
}

export function formatEur(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num)
}

export const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
