import type { Lease } from "@/lib/api"

export type LeaseStatus = "current" | "future" | "past"

export function todayIso(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function leaseStatus(lease: Pick<Lease, "move_in" | "move_out">, today = todayIso()): LeaseStatus {
  if (lease.move_in > today) return "future"
  if (lease.move_out && lease.move_out < today) return "past"
  return "current"
}

export const LEASE_STATUS_LABEL: Record<LeaseStatus, string> = {
  current: "wohnt aktuell",
  future: "zieht ein",
  past: "ausgezogen",
}

/** Persons right now (or at move-in for future leases). */
export function currentPersons(lease: Lease, today = todayIso()): number {
  const day = lease.move_in > today ? lease.move_in : today
  const period = lease.person_periods.find(
    (p) => p.valid_from <= day && (p.valid_to == null || p.valid_to >= day),
  )
  return period?.persons ?? lease.persons
}

/** Sort: current first, then future, then past (most recent first). */
export function sortLeases(leases: Lease[], today = todayIso()): Lease[] {
  const rank: Record<LeaseStatus, number> = { current: 0, future: 1, past: 2 }
  return [...leases].sort((a, b) => {
    const diff = rank[leaseStatus(a, today)] - rank[leaseStatus(b, today)]
    if (diff !== 0) return diff
    return b.move_in.localeCompare(a.move_in)
  })
}
