import { formatDate, type Deadline } from "@/lib/api"

export function deadlineText(d: Deadline): string {
  const due = formatDate(d.deadline)
  switch (d.state) {
    case "exported":
      return `${d.year}: erstellt am ${formatDate(d.exported_at?.slice(0, 10))}`
    case "overdue":
      return `${d.year}: Frist ${due} abgelaufen`
    case "missing":
      return `${d.year}: noch nicht angelegt · Frist ${due}`
    default:
      return `${d.year}: Frist ${due} · noch ${d.days_left} Tage`
  }
}

export function isUrgent(d: Deadline) {
  return d.state === "overdue" || d.state === "due_soon"
}
