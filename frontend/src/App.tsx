import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { Layout } from "@/components/layout"
import { ApartmentDetailPage } from "@/pages/apartment-detail"
import { ApartmentsPage } from "@/pages/apartments"
import { BillingPage } from "@/pages/billing"
import { DashboardPage } from "@/pages/dashboard"
import { LeasesPage } from "@/pages/leases"
import { PropertiesPage } from "@/pages/properties"
import { PropertyBillingPage } from "@/pages/property-billing"
import { PropertyDetailPage } from "@/pages/property-detail"
import { PropertyLeasesPage } from "@/pages/property-leases"
import { SettingsPage } from "@/pages/settings"

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="wohnungen" element={<ApartmentsPage />} />
            <Route path="wohnungen/:id" element={<ApartmentDetailPage />} />
            <Route path="wohnungen/:id/mietparteien" element={<LeasesPage />} />
            <Route path="wohnungen/:id/abrechnung/:year" element={<BillingPage />} />
            <Route path="gebaeude" element={<PropertiesPage />} />
            <Route path="gebaeude/:id" element={<PropertyDetailPage />} />
            <Route path="gebaeude/:id/mietparteien" element={<PropertyLeasesPage />} />
            <Route path="gebaeude/:id/abrechnung/:year" element={<PropertyBillingPage />} />
            <Route path="einstellungen" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
