# Archiv: Gebäude / MFH / WEG (Frontend)

Die Gebäude-Oberfläche ist vorübergehend aus der App genommen.
Fokus liegt auf **WG-Wohnungen**. Backend-APIs unter `/api/properties*` bleiben.

## Enthaltene Dateien

| Datei | Frühere Route |
|-------|----------------|
| `properties.tsx` | `/gebaeude` |
| `property-detail.tsx` | `/gebaeude/:id` |
| `property-leases.tsx` | `/gebaeude/:id/mietparteien` |
| `property-billing.tsx` | `/gebaeude/:id/abrechnung/:year` |
| `billing-years-card.property-mode.tsx` | Dual-Mode (apartment **oder** property) der BillingYearsCard |

## Wiedereinbau

1. Dateien nach `frontend/src/pages/` verschieben (Card: Inhalt von `billing-years-card.property-mode.tsx` nach `frontend/src/components/billing-years-card.tsx`).
2. In `App.tsx` die Routes wieder aktivieren:

```tsx
import { PropertiesPage } from "@/pages/properties"
import { PropertyDetailPage } from "@/pages/property-detail"
import { PropertyLeasesPage } from "@/pages/property-leases"
import { PropertyBillingPage } from "@/pages/property-billing"

<Route path="gebaeude" element={<PropertiesPage />} />
<Route path="gebaeude/:id" element={<PropertyDetailPage />} />
<Route path="gebaeude/:id/mietparteien" element={<PropertyLeasesPage />} />
<Route path="gebaeude/:id/abrechnung/:year" element={<PropertyBillingPage />} />
```

3. Nav-Link „Gebäude“ in `layout.tsx` wieder einfügen.
4. Dashboard: MFH-Anlegen-Button und `kind === "mfh"`-Zweige wiederherstellen.
5. Import-Pfade und aktuelle WG-UI (Guided Flow, Flächenregeln) abgleichen.
6. Verteilerquoten: Gebäude-UI nutzt `ALLOCATION_KEYS_MFH` / `ALLOCATION_ITEMS_MFH` (inkl. **MEA**). Die WG-Liste `ALLOCATION_KEYS` enthält MEA bewusst nicht.
