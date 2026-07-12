import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"

import { BillingYearsCard } from "@/components/billing-years-card"
import { LinkButton } from "@/components/link-button"
import { Card, CardContent } from "@/components/ui/card"
import { api } from "@/lib/api"

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })

  if (isLoading) return <p className="text-muted-foreground">Laden…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Betriebskostenabrechnungen für WG-Wohnungen und MFH-Gebäude</p>
        </div>
        <div className="flex gap-2">
          <LinkButton variant="outline" to="/gebaeude">Gebäude anlegen</LinkButton>
          <LinkButton to="/wohnungen">
            <Plus className="mr-1 size-4" />
            Wohnung anlegen
          </LinkButton>
        </div>
      </div>

      {data?.properties && data.properties.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Gebäude</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.properties.map((prop) => (
              <Card key={prop.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{prop.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {prop.unit_count} Wohnung(en)
                      {prop.total_area_sqm ? ` · ${prop.total_area_sqm} m²` : ""}
                    </p>
                  </div>
                  <LinkButton size="sm" variant="outline" to={`/gebaeude/${prop.id}`}>Öffnen</LinkButton>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-medium">Wohnungen</h2>
        <div className="grid gap-4">
          {data?.apartments.map((apt) => (
            <BillingYearsCard key={apt.id} apartmentId={apt.id} apartmentName={apt.name} />
          ))}
          {data?.apartments.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Noch keine Wohnungen angelegt.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
