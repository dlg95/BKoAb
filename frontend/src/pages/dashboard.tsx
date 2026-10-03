import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  Ruler,
  Plus,
  ReceiptText,
  Settings,
  UserPlus,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Callout } from "@/components/callout"
import { CreateApartmentDialog } from "@/components/create-apartment-dialog"
import { EmptyState } from "@/components/empty-state"
import { LinkButton } from "@/components/link-button"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { ALLOCATION_PER_INVOICE_HINT } from "@/lib/billing-labels"

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Settings, title: "Briefkopf", text: "Vermieterdaten & Zahlungstext unter Einstellungen" },
  { icon: Building2, title: "WG-Wohnung", text: "Bezeichnung, Adresse, optional Gesamtfläche" },
  { icon: BedDouble, title: "Zimmer", text: "Alle vermieteten Zimmer der WG" },
  { icon: UserPlus, title: "Mietparteien", text: "Je Zimmer: Einzug, Auszug, Personenzahl" },
  { icon: ReceiptText, title: "Abrechnung", text: "Rechnungen, Vorauszahlungen, Export" },
]

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })
  const wgUnits = data?.billing_units.filter((unit) => unit.kind === "wg" && unit.apartment_id) ?? []
  const lastYear = new Date().getFullYear() - 1
  const landlordIncomplete = !!data && (!data.landlord || data.landlord.name === "Vermieter" || !data.landlord.street)

  if (isLoading) return <p className="text-muted-foreground">Laden…</p>

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={`Ihre WG-Wohnungen und Abrechnungsjahre auf einen Blick. ${ALLOCATION_PER_INVOICE_HINT}`}
        actions={
          <CreateApartmentDialog
            trigger={
              <>
                <Plus className="size-4" />
                WG-Wohnung anlegen
              </>
            }
          />
        }
      />

      {landlordIncomplete && wgUnits.length > 0 ? (
        <Callout
          variant="warning"
          title="Briefkopf noch unvollständig"
          action={
            <LinkButton size="sm" variant="outline" to="/einstellungen">
              Ergänzen
            </LinkButton>
          }
        >
          Name und Adresse des Vermieters erscheinen auf jeder Abrechnung.
        </Callout>
      ) : null}

      {wgUnits.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            icon={Building2}
            title="Noch keine WG-Wohnung angelegt"
            description="In fünf Schritten zur fertigen Betriebskostenabrechnung je Mietpartei (DOCX/PDF)."
            action={<CreateApartmentDialog trigger="Erste WG-Wohnung anlegen" />}
          />
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-3xl bg-card p-4 ring-1 ring-foreground/5 dark:ring-foreground/10">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <step.icon className="size-4 text-muted-foreground" />
                </div>
                <p className="font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {wgUnits.map((unit) => {
            const apartmentId = unit.apartment_id!
            const years = [...unit.billing_years].sort((a, b) => b - a)
            return (
              <Card key={`wg-${apartmentId}`}>
                <CardHeader>
                  <CardTitle className="text-lg">{unit.name}</CardTitle>
                  <CardDescription>
                    {[unit.street, unit.city].filter(Boolean).join(", ") || "Keine Adresse hinterlegt"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <BedDouble className="size-4" />
                      {unit.sub_unit_count} Zimmer
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4" />
                      {unit.active_lease_count} aktive Mietparteien
                    </span>
                    {unit.total_area_sqm ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Ruler className="size-4" />
                        {unit.total_area_sqm} m²
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      <CalendarDays className="size-3.5" />
                      Abrechnungsjahre
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {years.length ? (
                        years.map((year) => (
                          <LinkButton
                            key={year}
                            size="sm"
                            variant={year === years[0] ? "secondary" : "outline"}
                            to={`/wohnungen/${apartmentId}/abrechnung/${year}`}
                          >
                            {year}
                          </LinkButton>
                        ))
                      ) : (
                        <LinkButton
                          size="sm"
                          variant="outline"
                          to={`/wohnungen/${apartmentId}?tab=abrechnungen`}
                        >
                          <Plus className="size-4" />
                          Abrechnung {lastYear} anlegen
                        </LinkButton>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <LinkButton size="sm" to={`/wohnungen/${apartmentId}`}>
                      Zimmer & Mietparteien
                      <ArrowRight className="size-4" />
                    </LinkButton>
                    <LinkButton size="sm" variant="ghost" to={`/wohnungen/${apartmentId}?tab=abrechnungen`}>
                      Abrechnungen verwalten
                    </LinkButton>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
