/** Parse locale-agnostic decimal strings from API/inputs. */
export function parseArea(value: string | null | undefined): number | null {
  if (value == null || String(value).trim() === "") return null
  const n = Number(String(value).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

export function sumAreas(values: Array<string | null | undefined>): number {
  return values.reduce((sum, v) => sum + (parseArea(v) ?? 0), 0)
}

/** WG: room areas should match apartment total. Tolerance in m². */
export function wgAreaMismatch(
  totalArea: string | null | undefined,
  roomAreas: Array<string | null | undefined>,
  tolerance = 0.05,
): { total: number; roomsSum: number; delta: number } | null {
  const total = parseArea(totalArea)
  if (total == null || total <= 0) return null
  const roomsWithArea = roomAreas.filter((a) => parseArea(a) != null)
  if (roomsWithArea.length === 0) return null
  const roomsSum = sumAreas(roomAreas)
  const delta = Math.abs(total - roomsSum)
  if (delta <= tolerance) return null
  return { total, roomsSum, delta }
}

export function formatSqm(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2, minimumFractionDigits: 0 })
}
