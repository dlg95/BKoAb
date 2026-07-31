import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"

import { GuidedLeaseDialog } from "@/components/guided-lease-dialog"
import { LinkButton } from "@/components/link-button"
import { BillingYearsCard } from "@/components/billing-years-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
import { formatSqm, sumAreas } from "@/lib/area"
import { ALLOCATION_PER_INVOICE_HINT, BILLING_LABELS, TOP_UNIT_STAMMDATEN } from "@/lib/billing-labels"

type UnitDraft = { name: string; living_area_sqm: string; mea_share: string }

export function PropertyDetailPage() {
  const { id } = useParams()
  const propertyId = Number(id)
  const queryClient = useQueryClient()
  const defaultBillingYear = new Date().getFullYear() - 1

  const { data: property } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => api.getProperty(propertyId),
    enabled: !!propertyId,
  })

  const [form, setForm] = useState({
    name: "",
    street: "",
    city: "",
    total_area_sqm: "",
  })
  const [unitDrafts, setUnitDrafts] = useState<Record<number, UnitDraft>>({})
  const [newUnit, setNewUnit] = useState({ name: "", living_area_sqm: "" })
  const [leasePrompt, setLeasePrompt] = useState<{ name: string; unitId: number } | null>(null)

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name,
        street: property.street,
        city: property.city,
        total_area_sqm: property.total_area_sqm || "",
      })
      setUnitDrafts(
        Object.fromEntries(
          property.units.map((unit) => [
            unit.id,
            {
              name: unit.name,
              living_area_sqm: unit.living_area_sqm || "",
              mea_share: unit.mea_share || "",
            },
          ]),
        ),
      )
    }
  }, [property])

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateProperty(propertyId, {
        name: form.name,
        street: form.street,
        city: form.city,
        total_area_sqm: form.total_area_sqm || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const createUnitMutation = useMutation({
    mutationFn: () =>
      api.createUnit(propertyId, {
        name: newUnit.name,
        living_area_sqm: newUnit.living_area_sqm || null,
      }),
    onSuccess: (unit) => {
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      const name = newUnit.name.trim()
      setNewUnit({ name: "", living_area_sqm: "" })
      setLeasePrompt({ name, unitId: unit.id })
    },
  })

  const saveUnitMutation = useMutation({
    mutationFn: (unitId: number) => {
      const draft = unitDrafts[unitId]
      return api.updateApartment(unitId, {
        name: draft.name,
        living_area_sqm: draft.living_area_sqm || null,
        mea_share: draft.mea_share || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const unitsAreaSum = useMemo(() => {
    if (!property) return 0
    return sumAreas(property.units.map((u) => unitDrafts[u.id]?.living_area_sqm ?? u.living_area_sqm))
  }, [property, unitDrafts])

  if (!property) return <p>Laden…</p>

  const nextUnitLabel = `${BILLING_LABELS.mfh.subUnit} ${property.units.length + 1}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{property.name}</h1>
          <p className="text-sm text-muted-foreground">{BILLING_LABELS.mfh.hierarchyHint}</p>
        </div>
        <LinkButton variant="outline" to={`/gebaeude/${propertyId}/mietparteien`}>
          Alle Mietparteien
        </LinkButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {BILLING_LABELS.mfh.subUnitPlural} ({property.units.length})
          </CardTitle>
          <CardDescription>
            Zuerst Wohnungen anlegen, danach je Wohnung die Mietparteien. {ALLOCATION_PER_INVOICE_HINT}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {property.units.length === 0 && (
            <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm">
              Noch keine Wohnungen. Legen Sie die erste Wohnung an — danach werden Sie zur
              Mietpartei geführt.
            </p>
          )}

          {property.units.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Fläche (m²)</TableHead>
                  <TableHead>MEA</TableHead>
                  <TableHead className="min-w-[14rem]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {property.units.map((unit) => {
                  const draft = unitDrafts[unit.id] ?? {
                    name: unit.name,
                    living_area_sqm: unit.living_area_sqm || "",
                    mea_share: unit.mea_share || "",
                  }
                  return (
                    <TableRow key={unit.id}>
                      <TableCell>
                        <Input
                          value={draft.name}
                          onChange={(e) =>
                            setUnitDrafts({
                              ...unitDrafts,
                              [unit.id]: { ...draft, name: e.target.value },
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.living_area_sqm}
                          onChange={(e) =>
                            setUnitDrafts({
                              ...unitDrafts,
                              [unit.id]: { ...draft, living_area_sqm: e.target.value },
                            })
                          }
                          className="w-32"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.mea_share}
                          onChange={(e) =>
                            setUnitDrafts({
                              ...unitDrafts,
                              [unit.id]: { ...draft, mea_share: e.target.value },
                            })
                          }
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => saveUnitMutation.mutate(unit.id)}
                            disabled={saveUnitMutation.isPending || !draft.name.trim()}
                          >
                            Speichern
                          </Button>
                          <LinkButton size="sm" to={`/wohnungen/${unit.id}/mietparteien`}>
                            Mietpartei
                          </LinkButton>
                          <LinkButton
                            variant="outline"
                            size="sm"
                            to={`/wohnungen/${unit.id}/abrechnung/${defaultBillingYear}`}
                          >
                            Abrechnung
                          </LinkButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {property.units.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Summe Ihrer Wohnungen: {formatSqm(unitsAreaSum)} m²
              {property.total_area_sqm
                ? ` · Gebäude-Gesamtfläche: ${property.total_area_sqm} m² (darf abweichen, z.B. bei Teilerwerb)`
                : ""}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="space-y-2">
              <Label>
                {property.units.length === 0
                  ? `Erste ${BILLING_LABELS.mfh.subUnit}`
                  : `Weitere ${BILLING_LABELS.mfh.subUnit}`}
              </Label>
              <Input
                value={newUnit.name}
                onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })}
                placeholder={nextUnitLabel}
                className="w-48"
              />
            </div>
            <div className="space-y-2">
              <Label>Fläche (m²)</Label>
              <Input
                type="number"
                step="0.01"
                value={newUnit.living_area_sqm}
                onChange={(e) => setNewUnit({ ...newUnit, living_area_sqm: e.target.value })}
                className="w-32"
              />
            </div>
            <Button
              onClick={() => createUnitMutation.mutate()}
              disabled={!newUnit.name.trim() || createUnitMutation.isPending}
            >
              <Plus className="mr-1 size-4" />
              Wohnung anlegen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardDescription>
            Gesamtfläche des Gebäudes (Nenner bei m²-Verteilung). Darf größer sein als die Summe
            Ihrer Wohnungen — z.B. wenn Sie nur einzelne Wohnungen im Haus besitzen.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["name", TOP_UNIT_STAMMDATEN.name],
              ["street", TOP_UNIT_STAMMDATEN.street],
              ["city", TOP_UNIT_STAMMDATEN.city],
              ["total_area_sqm", TOP_UNIT_STAMMDATEN.total_area_sqm],
            ] as const
          ).map(([key, label]) => (
            <div className="space-y-2" key={key}>
              <Label>{label}</Label>
              <Input
                type={key === "total_area_sqm" ? "number" : "text"}
                step={key === "total_area_sqm" ? "0.01" : undefined}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      <BillingYearsCard propertyId={propertyId} unitName={property.name} kind="mfh" />

      <GuidedLeaseDialog
        open={leasePrompt != null}
        onOpenChange={(open) => {
          if (!open) setLeasePrompt(null)
        }}
        subUnitLabel={BILLING_LABELS.mfh.subUnit}
        subUnitName={leasePrompt?.name ?? ""}
        leasesPath={`/wohnungen/${leasePrompt?.unitId ?? ""}/mietparteien`}
      />
    </div>
  )
}
