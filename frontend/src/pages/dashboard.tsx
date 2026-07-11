import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"

import { LinkButton } from "@/components/link-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })

  if (isLoading) return <p className="text-muted-foreground">Laden…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Betriebskostenabrechnungen für Ihre WG-Wohnungen</p>
        </div>
        <LinkButton to="/wohnungen">
          <Plus className="mr-1 size-4" />
          Wohnung anlegen
        </LinkButton>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data?.apartments.map((apt) => (
          <Card key={apt.id}>
            <CardHeader>
              <CardTitle>{apt.name}</CardTitle>
              <CardDescription>
                {apt.room_count} Zimmer · {apt.active_lease_count} aktive Mietverträge
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {apt.billing_years.length === 0 ? (
                  <Badge variant="secondary">Noch keine Abrechnung</Badge>
                ) : (
                  apt.billing_years.map((year) => (
                    <LinkButton key={year} variant="outline" size="sm" to={`/wohnungen/${apt.id}/abrechnung/${year}`}>
                      Abrechnung {year}
                    </LinkButton>
                  ))
                )}
                <LinkButton size="sm" to={`/wohnungen/${apt.id}/abrechnung/${new Date().getFullYear() - 1}`}>
                  Abrechnung {new Date().getFullYear() - 1}
                </LinkButton>
              </div>
              <div className="flex gap-2">
                <LinkButton variant="secondary" size="sm" to={`/wohnungen/${apt.id}`}>
                  Details
                </LinkButton>
                <LinkButton variant="secondary" size="sm" to={`/wohnungen/${apt.id}/mietparteien`}>
                  Mietparteien
                </LinkButton>
              </div>
            </CardContent>
          </Card>
        ))}
        {data?.apartments.length === 0 && (
          <Card className="md:col-span-2">
            <CardContent className="py-10 text-center text-muted-foreground">
              Noch keine Wohnungen angelegt.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
