import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

export function ApartmentsPage() {
  const queryClient = useQueryClient()
  const { data: apartments } = useQuery({ queryKey: ["apartments"], queryFn: api.apartments })
  const [form, setForm] = useState({
    name: "",
    street: "",
    city: "",
    room1: "Zimmer 1",
    room2: "Zimmer 2",
    room3: "Zimmer 3",
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.createApartment({
        name: form.name,
        street: form.street,
        city: form.city,
        rooms: [form.room1, form.room2, form.room3].filter(Boolean).map((name) => ({ name })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartments"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      setForm({ name: "", street: "", city: "", room1: "Zimmer 1", room2: "Zimmer 2", room3: "Zimmer 3" })
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wohnungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Neue Wohnung</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Straße</Label>
            <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>PLZ / Ort</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          {[1, 2, 3].map((n) => (
            <div className="space-y-2" key={n}>
              <Label>Zimmer {n}</Label>
              <Input
                value={form[`room${n}` as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [`room${n}`]: e.target.value })}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}>
              Anlegen
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {apartments?.map((apt) => (
          <Card key={apt.id}>
            <CardContent className="flex items-center justify-between py-6">
              <div>
                <p className="font-medium">{apt.name}</p>
                <p className="text-sm text-muted-foreground">
                  {apt.street}, {apt.city} · {apt.rooms.length} Zimmer
                </p>
              </div>
              <div className="flex gap-2">
                <LinkButton variant="outline" size="sm" to={`/wohnungen/${apt.id}`}>
                  Bearbeiten
                </LinkButton>
                <LinkButton size="sm" to={`/wohnungen/${apt.id}/mietparteien`}>
                  Mietparteien
                </LinkButton>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
