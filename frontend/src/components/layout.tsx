import { Outlet } from "react-router-dom"
import { Building2, FileText, Settings } from "lucide-react"

import { LinkButton } from "@/components/link-button"
import { Separator } from "@/components/ui/separator"

export function Layout() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <FileText className="size-5" />
            BKoAb
          </div>
          <Separator orientation="vertical" className="h-6" />
          <nav className="flex gap-2">
            <LinkButton variant="ghost" size="sm" to="/">
              Dashboard
            </LinkButton>
            <LinkButton variant="ghost" size="sm" to="/wohnungen">
              <Building2 className="mr-1 size-4" />
              Wohnungen
            </LinkButton>
            <LinkButton variant="ghost" size="sm" to="/einstellungen">
              <Settings className="mr-1 size-4" />
              Briefkopf
            </LinkButton>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
