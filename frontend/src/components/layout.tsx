import { Outlet } from "react-router-dom"
import { Building2, Coffee, FileText, Settings } from "lucide-react"

import { LinkButton } from "@/components/link-button"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function Layout() {
  return (
    <div className="min-h-svh bg-background">
      <div className="border-b bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-2">
          <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
            Dieses Tool wurde von Daniel Glauert zur privaten Nutzung erstellt. Es ist keine
            Steuer- oder Finanzberatung; es wird keinerlei Haftung übernommen. Frei nutzbar,
            aber nicht weiterlizenziert oder kommerzialisiert. © Daniel Glauert.
          </p>
          <a
            href="https://paypal.me/danielglauert"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Coffee className="size-4" />
            Buy me a coffee
          </a>
        </div>
      </div>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <FileText className="size-5" />
            BKoAb
          </div>
          <Separator orientation="vertical" className="h-6" />
          <nav className="flex gap-2">
            <LinkButton variant="ghost" size="sm" to="/">
              Abrechnungs-Dashboard
            </LinkButton>
            <LinkButton variant="ghost" size="sm" to="/wohnungen">
              <Building2 className="mr-1 size-4" />
              WG-Wohnungen
            </LinkButton>
            <LinkButton variant="ghost" size="sm" to="/gebaeude">
              Gebäude
            </LinkButton>
            <LinkButton variant="ghost" size="sm" to="/einstellungen">
              <Settings className="mr-1 size-4" />
              Briefkopf
            </LinkButton>
          </nav>
        </div>
      </header>
      <p className="border-b px-6 py-1.5 text-center text-xs text-muted-foreground">
        Betriebskosten-Abrechnung — Übereinheit & Untereinheit · Verteilerquote pro Rechnung
      </p>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
