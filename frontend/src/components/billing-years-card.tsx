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

type BillingYearsCardProps = {
  apartmentId: number
  apartmentName?: string
}

export function BillingYearsCard({ apartmentId, apartmentName }: BillingYearsCardProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()
  const [newYear, setNewYear] = useState(String(currentYear - 1))

  const { data: years } = useQuery({
    queryKey: ["billing-years", apartmentId],
    queryFn: () => api.billingYears(apartmentId),
    enabled: !!apartmentId,
  })

  const createMutation = useMutation({
    mutationFn: () => api.createBillingYear(apartmentId, Number(newYear)),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["billing-years", apartmentId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      navigate(`/wohnungen/${apartmentId}/abrechnung/${created.year}`)
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abrechnungsjahre</CardTitle>
        <CardDescription>
          {apartmentName
            ? `Kalenderjahres-Abrechnungen für ${apartmentName} (01.01.–31.12.)`
            : "Pro Kalenderjahr eine eigene Abrechnung anlegen"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {years?.length ? (
            years.map((by) => (
              <LinkButton key={by.id} variant="outline" size="sm" to={`/wohnungen/${apartmentId}/abrechnung/${by.year}`}>
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
