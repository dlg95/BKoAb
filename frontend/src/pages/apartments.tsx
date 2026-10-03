import { useQuery } from "@tanstack/react-query"
import { ArrowRight, BedDouble, Building2, MapPin, Plus, Ruler } from "lucide-react"

import { CreateApartmentDialog } from "@/components/create-apartment-dialog"
import { EmptyState } from "@/components/empty-state"
import { LinkButton } from "@/components/link-button"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { BILLING_LABELS } from "@/lib/billing-labels"

export function ApartmentsPage() {
  const { data: apartments, isLoading } = useQuery({ queryKey: ["apartments"], queryFn: api.apartments })

  return (
    <div className="space-y-6">
      <PageHeader
        title={BILLING_LABELS.wg.topUnitPlural}
        description="Ablauf: WG-Wohnung anlegen → Zimmer → Mietparteien → Abrechnung."
        actions={
          <CreateApartmentDialog
            trigger={
              <>
                <Plus className="size-4" />
                {BILLING_LABELS.wg.createTop}
              </>
            }
          />
        }
      />

      {isLoading ? <p className="text-muted-foreground">Laden…</p> : null}

      {apartments?.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Noch keine WG-Wohnung"
          description="Legen Sie Ihre erste WG-Wohnung an. Zimmer und Mietparteien folgen im nächsten Schritt."
          action={<CreateApartmentDialog trigger={BILLING_LABELS.wg.createTop} />}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {apartments?.map((apt) => (
          <Card key={apt.id} className="transition-shadow hover:shadow-lg">
            <CardHeader>
              <CardTitle>{apt.name}</CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {[apt.street, apt.city].filter(Boolean).join(", ") || "Keine Adresse"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <BedDouble className="size-4" />
                  {apt.rooms.length} {BILLING_LABELS.wg.subUnitPlural}
                </span>
                {apt.total_area_sqm ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Ruler className="size-4" />
                    {apt.total_area_sqm} m²
                  </span>
                ) : null}
              </div>
              <LinkButton size="sm" variant="outline" className="w-full" to={`/wohnungen/${apt.id}`}>
                Öffnen
                <ArrowRight className="size-4" />
              </LinkButton>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
