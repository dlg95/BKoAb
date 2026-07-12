import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { Plus } from "lucide-react"

import { LinkButton } from "@/components/link-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { BILLING_LABELS } from "@/lib/billing-labels"

type BillingYearsCardProps = {
  unitName?: string
  kind?: "wg" | "mfh"
} & (
  | { apartmentId: number; propertyId?: never }
  | { propertyId: number; apartmentId?: never }
)

export function BillingYearsCard(props: BillingYearsCardProps) {
  const { unitName, kind = props.propertyId ? "mfh" : "wg" } = props
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()
  const [newYear, setNewYear] = useState(String(currentYear - 1))

  const isProperty = "propertyId" in props && props.propertyId != null
  const entityId = isProperty ? props.propertyId! : props.apartmentId!

  const { data: years } = useQuery({
    queryKey: isProperty ? ["property-billing-years", entityId] : ["billing-years", entityId],
    queryFn: () =>
      isProperty ? api.propertyBillingYears(entityId) : api.billingYears(entityId),
    enabled: !!entityId,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      isProperty
        ? api.createPropertyBillingYear(entityId, Number(newYear))
        : api.createBillingYear(entityId, Number(newYear)),
    onSuccess: (created) => {
      if (isProperty) {
        queryClient.invalidateQueries({ queryKey: ["property-billing-years", entityId] })
        navigate(`/gebaeude/${entityId}/abrechnung/${created.year}`)
      } else {
        queryClient.invalidateQueries({ queryKey: ["billing-years", entityId] })
        navigate(`/wohnungen/${entityId}/abrechnung/${created.year}`)
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const billingPath = (year: number) =>
    isProperty
      ? `/gebaeude/${entityId}/abrechnung/${year}`
      : `/wohnungen/${entityId}/abrechnung/${year}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abrechnungsjahre</CardTitle>
        <CardDescription>
          {unitName
            ? `Kalenderjahres-Abrechnung für ${BILLING_LABELS[kind].topUnit} „${unitName}" (01.01.–31.12.)`
            : "Pro Kalenderjahr eine eigene Abrechnung anlegen"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {years?.length ? (
            years.map((by) => (
              <LinkButton key={by.id} variant="outline" size="sm" to={billingPath(by.year)}>
                {by.year}
                {by.status === "finalized" && (
                  <Badge variant="secondary" className="ml-2">
                    abgeschlossen
                  </Badge>
                )}
              </LinkButton>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Noch keine Abrechnung angelegt.</p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="space-y-2">
            <Label>Neues Abrechnungsjahr</Label>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              className="w-32"
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!newYear || createMutation.isPending}
          >
            <Plus className="mr-1 size-4" />
            Abrechnung anlegen
          </Button>
          {createMutation.isError && (
            <p className="text-sm text-destructive w-full">
              {(createMutation.error as Error).message.includes("409")
                ? "Diese Abrechnung existiert bereits."
                : "Abrechnung konnte nicht angelegt werden."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
