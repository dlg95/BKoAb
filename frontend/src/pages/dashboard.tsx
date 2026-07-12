import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"

import { BillingYearsCard } from "@/components/billing-years-card"
import { LinkButton } from "@/components/link-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { api } from "@/lib/api"
import { ALLOCATION_PER_INVOICE_HINT, labelsFor } from "@/lib/billing-labels"

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })

  if (isLoading) return <p className="text-muted-foreground">Laden…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Abrechnungs-Dashboard</h1>
          <p className="text-muted-foreground">
            Übereinheiten (gleichwertig): WG-Wohnung oder Gebäude — jeweils mit Untereinheiten.
            {" "}
            {ALLOCATION_PER_INVOICE_HINT}
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton variant="outline" to="/wohnungen">
            <Plus className="mr-1 size-4" />
            WG-Wohnung anlegen
          </LinkButton>
          <LinkButton variant="outline" to="/gebaeude">
            <Plus className="mr-1 size-4" />
            Gebäude anlegen
          </LinkButton>
        </div>
      </div>

      <div className="space-y-6">
        {data?.billing_units.map((unit) => {
          const labels = labelsFor(unit.kind)
          const detailPath =
            unit.kind === "wg" && unit.apartment_id
              ? `/wohnungen/${unit.apartment_id}`
              : `/gebaeude/${unit.property_id}`

          return (
            <div key={`${unit.kind}-${unit.property_id}`} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge variant="secondary" className="mb-1">
                    {labels.topUnit}
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
                <LinkButton size="sm" variant="outline" to={detailPath}>
                  {labels.manageTop}
                </LinkButton>
              </div>

              {unit.kind === "wg" && unit.apartment_id ? (
                <BillingYearsCard apartmentId={unit.apartment_id} apartmentName={unit.name} kind="wg" />
              ) : (
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-2 py-4">
                    <span className="text-sm text-muted-foreground">Haus-Abrechnungsjahre:</span>
                    {unit.billing_years.length > 0 ? (
                      unit.billing_years.map((year) => (
                        <LinkButton
                          key={year}
                          variant="outline"
                          size="sm"
                          to={`/gebaeude/${unit.property_id}/abrechnung/${year}`}
                        >
                          {year}
                        </LinkButton>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">Noch keine Haus-Abrechnung angelegt.</span>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )
        })}

        {data?.billing_units.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Noch keine Übereinheit angelegt. Beide Anlegarten sind gleichwertig — wählen Sie WG-Wohnung oder Gebäude.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
