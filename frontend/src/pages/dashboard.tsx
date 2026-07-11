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
          <p className="text-muted-foreground">Betriebskostenabrechnungen für Ihre WG-Wohnungen</p>
        </div>
        <LinkButton to="/wohnungen">
          <Plus className="mr-1 size-4" />
          Wohnung anlegen
        </LinkButton>
      </div>

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
  )
}
