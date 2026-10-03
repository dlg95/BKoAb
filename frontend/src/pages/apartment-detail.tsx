import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMemo, useState } from "react"
import {
  BedDouble,
  CalendarRange,
  DoorOpen,
  Pencil,
  Plus,
  Ruler,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"

import { BillingYearsCard } from "@/components/billing-years-card"
import { Callout } from "@/components/callout"
import { EmptyState } from "@/components/empty-state"
import { GuidedLeaseDialog } from "@/components/guided-lease-dialog"
import { LeaseDialog } from "@/components/lease-dialog"
import { PageHeader } from "@/components/page-header"
import { PersonPeriodsDialog } from "@/components/person-periods-editor"
import { RoomDialog } from "@/components/room-dialog"
import { Stat } from "@/components/stat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, errorMessage, formatDate, type Apartment, type Lease } from "@/lib/api"
import { formatSqm, parseArea, wgAreaMismatch } from "@/lib/area"
import { TOP_UNIT_STAMMDATEN } from "@/lib/billing-labels"
import {
  currentPersons,
  LEASE_STATUS_LABEL,
  leaseStatus,
  sortLeases,
  todayIso,
} from "@/lib/lease-status"
import { cn } from "@/lib/utils"

type Room = Apartment["rooms"][number]
type TabValue = "belegung" | "abrechnungen" | "stammdaten"
const TABS: TabValue[] = ["belegung", "abrechnungen", "stammdaten"]

function personsLabel(count: number) {
  return `${count} ${count === 1 ? "Person" : "Personen"}`
}

export function ApartmentDetailPage() {
  const { id } = useParams()
  const apartmentId = Number(id)
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const { data: apartment, isError } = useQuery({
    queryKey: ["apartment", apartmentId],
    queryFn: () => api.getApartment(apartmentId),
    enabled: !!apartmentId,
  })
  const { data: leases } = useQuery({
    queryKey: ["leases", apartmentId],
    queryFn: () => api.leases(apartmentId),
    enabled: !!apartmentId,
  })

  const tabParam = searchParams.get("tab") as TabValue | null
  const tab: TabValue = tabParam && TABS.includes(tabParam) ? tabParam : "belegung"

  // `?room=<id>` (e.g. from the former Mietparteien page) opens the lease dialog for that room.
  const [leaseDialog, setLeaseDialog] = useState<{ lease: Lease | null; roomId: number | null } | null>(() => {
    const room = Number(searchParams.get("room"))
    return room ? { lease: null, roomId: room } : null
  })
  const [roomDialog, setRoomDialog] = useState<{ room: Room | null } | null>(null)
  const [periodsLease, setPeriodsLease] = useState<Lease | null>(null)
  const [newRoomPrompt, setNewRoomPrompt] = useState<{ id: number; name: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function setTab(next: TabValue) {
    const params = new URLSearchParams(searchParams)
    params.delete("room")
    if (next === "belegung") params.delete("tab")
    else params.set("tab", next)
    setSearchParams(params, { replace: true })
  }

  function openLeaseDialog(value: { lease: Lease | null; roomId: number | null } | null) {
    setLeaseDialog(value)
    if (!value && searchParams.has("room")) {
      const params = new URLSearchParams(searchParams)
      params.delete("room")
      setSearchParams(params, { replace: true })
    }
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["apartment", apartmentId] })
    queryClient.invalidateQueries({ queryKey: ["apartments"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    queryClient.invalidateQueries({ queryKey: ["leases", apartmentId] })
  }

  const deleteRoomMutation = useMutation({
    mutationFn: (roomId: number) => api.deleteRoom(roomId),
    onSuccess: invalidate,
    onError: (error) => setActionError(errorMessage(error)),
  })

  const deleteLeaseMutation = useMutation({
    mutationFn: (leaseId: number) => api.deleteLease(leaseId),
    onSuccess: invalidate,
    onError: (error) => setActionError(errorMessage(error)),
  })

  const today = todayIso()
  const leasesByRoom = useMemo(() => {
    const map = new Map<number, Lease[]>()
    for (const lease of leases ?? []) {
      map.set(lease.room_id, [...(map.get(lease.room_id) ?? []), lease])
    }
    for (const [roomId, list] of map) map.set(roomId, sortLeases(list, today))
    return map
  }, [leases, today])

  if (isError) {
    return (
      <EmptyState
        icon={DoorOpen}
        title="WG-Wohnung nicht gefunden"
        description="Die Wohnung existiert nicht (mehr). Zurück zur Übersicht?"
      />
    )
  }
  if (!apartment) return <p className="text-muted-foreground">Laden…</p>

  const rooms = apartment.rooms
  const currentLeases = (leases ?? []).filter((l) => leaseStatus(l, today) === "current")
  const occupiedRooms = new Set(currentLeases.map((l) => l.room_id))
  const personsNow = currentLeases.reduce((sum, l) => sum + currentPersons(l, today), 0)
  const roomsWithoutLease = rooms.filter((r) => (leasesByRoom.get(r.id)?.length ?? 0) === 0)
  const areaWarning = wgAreaMismatch(apartment.total_area_sqm, rooms.map((r) => r.area_sqm))
  const totalArea = parseArea(apartment.total_area_sqm)

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "WG-Wohnungen", to: "/wohnungen" }, { label: apartment.name }]}
        title={apartment.name}
        description={[apartment.street, apartment.city].filter(Boolean).join(", ") || "Keine Adresse hinterlegt"}
        actions={
          <Button onClick={() => openLeaseDialog({ lease: null, roomId: null })} disabled={rooms.length === 0}>
            <UserPlus className="size-4" />
            Mietpartei hinzufügen
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={BedDouble} label="Zimmer" value={rooms.length} />
          <Stat
            icon={DoorOpen}
            label="Zimmer belegt"
            value={`${occupiedRooms.size} / ${rooms.length}`}
          />
          <Stat icon={Users} label="Personen heute" value={personsNow} />
          <Stat icon={Ruler} label="Gesamtfläche" value={totalArea ? `${formatSqm(totalArea)} m²` : "—"} />
        </div>
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="belegung">Zimmer & Mietparteien</TabsTrigger>
          <TabsTrigger value="abrechnungen">Abrechnungen</TabsTrigger>
          <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>
        </TabsList>

        <TabsContent value="belegung" className="mt-4 space-y-4">
          <Callout title="So hängt alles zusammen">
            Alle Mietparteien gehören zur WG-Wohnung und werden gemeinsam abgerechnet — die Kosten
            werden über alle Zimmer verteilt. Jede Mietpartei bewohnt genau ein Zimmer; leere
            Zeiträume eines Zimmers trägt der Vermieter (Leerstand).
          </Callout>

          {actionError ? (
            <Callout
              variant="error"
              action={
                <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>
                  Schließen
                </Button>
              }
            >
              {actionError}
            </Callout>
          ) : null}

          {rooms.length === 0 ? (
            <EmptyState
              icon={BedDouble}
              title="Noch keine Zimmer"
              description="Legen Sie zuerst die vermieteten Zimmer an. Danach können Sie Mietparteien zuordnen."
              action={
                <Button onClick={() => setRoomDialog({ room: null })}>
                  <Plus className="size-4" />
                  Erstes Zimmer anlegen
                </Button>
              }
            />
          ) : (
            <>
              {roomsWithoutLease.length > 0 && (
                <Callout variant="warning">
                  Noch keine Mietpartei für {roomsWithoutLease.map((r) => `„${r.name}“`).join(", ")}.
                  Ohne Mietpartei gilt das Zimmer als leer (Kosten beim Vermieter).
                </Callout>
              )}
              {areaWarning && (
                <Callout variant="warning">
                  Die Summe der Zimmerflächen ({formatSqm(areaWarning.roomsSum)} m²) weicht von der
                  Gesamtfläche ({formatSqm(areaWarning.total)} m²) ab. Für die Verteilerquote
                  „Fläche (m²)“ sollten beide übereinstimmen.
                </Callout>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    leases={leasesByRoom.get(room.id) ?? []}
                    today={today}
                    canDelete={rooms.length > 1 && (leasesByRoom.get(room.id)?.length ?? 0) === 0}
                    onAddLease={() => openLeaseDialog({ lease: null, roomId: room.id })}
                    onEditRoom={() => setRoomDialog({ room })}
                    onDeleteRoom={() => {
                      if (window.confirm(`Zimmer „${room.name}“ wirklich entfernen?`)) {
                        setActionError(null)
                        deleteRoomMutation.mutate(room.id)
                      }
                    }}
                    onEditLease={(lease) => openLeaseDialog({ lease, roomId: lease.room_id })}
                    onEditPersons={(lease) => setPeriodsLease(lease)}
                    onDeleteLease={(lease) => {
                      if (
                        window.confirm(
                          `Mietpartei „${lease.tenant_name}“ inkl. Vorauszahlungen wirklich löschen?\n\n` +
                            "Tipp: Bei Auszug stattdessen „Bearbeiten“ → Auszugsdatum eintragen.",
                        )
                      ) {
                        setActionError(null)
                        deleteLeaseMutation.mutate(lease.id)
                      }
                    }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setRoomDialog({ room: null })}
                  className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-4xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <Plus className="size-5" />
                  Weiteres Zimmer hinzufügen
                </button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="abrechnungen" className="mt-4">
          <BillingYearsCard apartmentId={apartmentId} unitName={apartment.name} />
        </TabsContent>

        <TabsContent value="stammdaten" className="mt-4 space-y-4">
          <MasterDataCard key={apartment.id} apartment={apartment} />
          <DangerZone apartment={apartment} />
        </TabsContent>
      </Tabs>

      <LeaseDialog
        apartmentId={apartmentId}
        rooms={rooms}
        open={leaseDialog != null}
        onOpenChange={(open) => !open && openLeaseDialog(null)}
        lease={leaseDialog?.lease}
        defaultRoomId={leaseDialog?.roomId}
      />
      <RoomDialog
        apartmentId={apartmentId}
        open={roomDialog != null}
        onOpenChange={(open) => !open && setRoomDialog(null)}
        room={roomDialog?.room}
        suggestedName={`Zimmer ${rooms.length + 1}`}
        onCreated={(room) => setNewRoomPrompt(room)}
      />
      <PersonPeriodsDialog
        lease={periodsLease ? (leases?.find((l) => l.id === periodsLease.id) ?? periodsLease) : null}
        apartmentId={apartmentId}
        onOpenChange={(open) => !open && setPeriodsLease(null)}
      />
      <GuidedLeaseDialog
        open={newRoomPrompt != null}
        onOpenChange={(open) => !open && setNewRoomPrompt(null)}
        subUnitLabel="Zimmer"
        subUnitName={newRoomPrompt?.name ?? ""}
        onConfirm={() => newRoomPrompt && openLeaseDialog({ lease: null, roomId: newRoomPrompt.id })}
      />
    </div>
  )
}

type RoomCardProps = {
  room: Room
  leases: Lease[]
  today: string
  canDelete: boolean
  onAddLease: () => void
  onEditRoom: () => void
  onDeleteRoom: () => void
  onEditLease: (lease: Lease) => void
  onEditPersons: (lease: Lease) => void
  onDeleteLease: (lease: Lease) => void
}

function RoomCard({
  room,
  leases,
  today,
  canDelete,
  onAddLease,
  onEditRoom,
  onDeleteRoom,
  onEditLease,
  onEditPersons,
  onDeleteLease,
}: RoomCardProps) {
  const current = leases.find((l) => leaseStatus(l, today) === "current")
  const area = parseArea(room.area_sqm)

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {room.name}
            {current ? (
              <Badge>belegt</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                leer
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{area ? `${formatSqm(area)} m²` : "Fläche nicht angegeben"}</CardDescription>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onEditRoom} aria-label={`${room.name} bearbeiten`}>
            <Pencil />
          </Button>
          {canDelete && (
            <Button variant="ghost" size="icon-sm" onClick={onDeleteRoom} aria-label={`${room.name} entfernen`}>
              <Trash2 />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {leases.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Mietpartei zugeordnet.</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {leases.map((lease) => (
              <LeaseRow
                key={lease.id}
                lease={lease}
                today={today}
                onEdit={() => onEditLease(lease)}
                onEditPersons={() => onEditPersons(lease)}
                onDelete={() => onDeleteLease(lease)}
              />
            ))}
          </ul>
        )}
        <Button variant="ghost" size="sm" className="text-primary" onClick={onAddLease}>
          <UserPlus className="size-4" />
          Mietpartei für dieses Zimmer
        </Button>
      </CardContent>
    </Card>
  )
}

function LeaseRow({
  lease,
  today,
  onEdit,
  onEditPersons,
  onDelete,
}: {
  lease: Lease
  today: string
  onEdit: () => void
  onEditPersons: () => void
  onDelete: () => void
}) {
  const status = leaseStatus(lease, today)
  const persons = currentPersons(lease, today)
  const changes = lease.person_periods.length > 1

  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5", status === "past" && "opacity-70")}>
      <div className="min-w-48 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {lease.tenant_name}
          <Badge
            variant={status === "current" ? "secondary" : "outline"}
            className={cn(status === "future" && "border-primary/40 text-primary")}
          >
            {LEASE_STATUS_LABEL[status]}
          </Badge>
        </p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarRange className="size-3" />
            {formatDate(lease.move_in)} – {formatDate(lease.move_out, "unbefristet")}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" />
            {personsLabel(persons)}
            {changes ? " (wechselnd)" : ""}
          </span>
          {lease.tenant_contact ? <span className="truncate">{lease.tenant_contact}</span> : null}
        </p>
      </div>
      <div className="flex gap-1">
        <Button variant="outline" size="xs" onClick={onEdit}>
          Bearbeiten
        </Button>
        <Button variant="outline" size="xs" onClick={onEditPersons}>
          Personenzahl
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label={`${lease.tenant_name} löschen`}>
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}

function MasterDataCard({ apartment }: { apartment: Apartment }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: apartment.name,
    street: apartment.street,
    city: apartment.city,
    total_area_sqm: apartment.total_area_sqm || "",
  })
  const [saved, setSaved] = useState(false)

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateApartment(apartment.id, {
        ...form,
        total_area_sqm: form.total_area_sqm || null,
      }),
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ["apartment", apartment.id] })
      queryClient.invalidateQueries({ queryKey: ["apartments"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const update = (patch: Partial<typeof form>) => {
    setSaved(false)
    setForm({ ...form, ...patch })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stammdaten</CardTitle>
        <CardDescription>
          Bezeichnung und Adresse erscheinen in der Abrechnung. Die Gesamtfläche wird nur für die
          Verteilerquote „Fläche (m²)“ benötigt und sollte der Summe der Zimmerflächen entsprechen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            saveMutation.mutate()
          }}
        >
          {(
            [
              ["name", TOP_UNIT_STAMMDATEN.name],
              ["street", TOP_UNIT_STAMMDATEN.street],
              ["city", TOP_UNIT_STAMMDATEN.city],
              ["total_area_sqm", TOP_UNIT_STAMMDATEN.total_area_sqm],
            ] as const
          ).map(([key, label]) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`apt-${key}`}>{label}</Label>
              <Input
                id={`apt-${key}`}
                type={key === "total_area_sqm" ? "number" : "text"}
                step={key === "total_area_sqm" ? "0.01" : undefined}
                value={form[key]}
                onChange={(e) => update({ [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={!form.name.trim() || saveMutation.isPending}>
              Speichern
            </Button>
            {saved && <span className="text-sm text-muted-foreground">Gespeichert.</span>}
            {saveMutation.isError && (
              <span className="text-sm text-destructive">{errorMessage(saveMutation.error)}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function DangerZone({ apartment }: { apartment: Apartment }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteApartment(apartment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartments"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      navigate("/wohnungen")
    },
  })

  return (
    <Card className="ring-destructive/20">
      <CardHeader>
        <CardTitle>WG-Wohnung löschen</CardTitle>
        <CardDescription>
          Löscht die Wohnung mit allen Zimmern, Mietparteien und Abrechnungen. Erstellen Sie vorher
          unter Einstellungen einen Datenexport.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button
          variant="destructive"
          disabled={deleteMutation.isPending}
          onClick={() => {
            const answer = window.prompt(
              `Zum Bestätigen den Namen der Wohnung eingeben:\n„${apartment.name}“`,
            )
            if (answer != null && answer.trim() === apartment.name.trim()) deleteMutation.mutate()
          }}
        >
          <Trash2 className="size-4" />
          Endgültig löschen
        </Button>
        {deleteMutation.isError && (
          <span className="text-sm text-destructive">{errorMessage(deleteMutation.error)}</span>
        )}
      </CardContent>
    </Card>
  )
}
