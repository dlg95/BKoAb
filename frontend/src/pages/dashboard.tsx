import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"

import { BillingYearsCard } from "@/components/billing-years-card"
import { LinkButton } from "@/components/link-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { api } from "@/lib/api"
import { ALLOCATION_PER_INVOICE_HINT, BILLING_LABELS } from "@/lib/billing-labels"

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })
  const wgUnits = data?.billing_units.filter((unit) => unit.kind === "wg" && unit.apartment_id) ?? []

  if (isLoading) return <p className="text-muted-foreground">Laden…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Abrechnungs-Dashboard</h1>
          <p className="text-muted-foreground">
            WG-Wohnungen mit Zimmern und Mietparteien. {ALLOCATION_PER_INVOICE_HINT}
          </p>
        </div>
        <LinkButton to="/wohnungen">
          <Plus className="mr-1 size-4" />
          WG-Wohnung anlegen
        </LinkButton>
      </div>

      <div className="space-y-6">
        {wgUnits.map((unit) => {
          const apartmentId = unit.apartment_id!
          return (
            <div key={`wg-${apartmentId}`} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge variant="secondary" className="mb-1">
                    {BILLING_LABELS.wg.topUnit}
                  </Badge>
                  <p className="font-medium">{unit.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[unit.street, unit.city].filter(Boolean).join(", ")}
                    {unit.street || unit.city ? " · " : ""}
                    {unit.sub_unit_count} {unit.sub_unit_label}
                    {unit.active_lease_count > 0 ? ` · ${unit.active_lease_count} aktive Mietparteien` : ""}
                    {unit.total_area_sqm ? ` · ${unit.total_area_sqm} m²` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LinkButton size="sm" variant="outline" to={`/wohnungen/${apartmentId}`}>
                    {BILLING_LABELS.wg.manageTop}
                  </LinkButton>
                  <LinkButton size="sm" to={`/wohnungen/${apartmentId}/mietparteien`}>
                    Mietparteien
                  </LinkButton>
                </div>
              </div>

              <BillingYearsCard apartmentId={apartmentId} unitName={unit.name} />
            </div>
          )
        })}

        {wgUnits.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Noch keine WG-Wohnung angelegt.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
