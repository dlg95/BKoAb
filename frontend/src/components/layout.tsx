import { NavLink, Outlet } from "react-router-dom"
import { Building2, Coffee, LayoutDashboard, ReceiptText, Scale, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { LinkButton } from "@/components/link-button"
import { buttonVariants } from "@/components/ui/button"
import { LEGAL_BANNER } from "@/lib/legal"
import { cn } from "@/lib/utils"

const NAV_ITEMS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/wohnungen", label: "WG-Wohnungen", icon: Building2 },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings },
  { to: "/rechtliches", label: "Rechtliches", icon: Scale },
]

export function Layout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="border-b bg-muted/60">
        <p className="mx-auto max-w-6xl px-4 py-1.5 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
          {LEGAL_BANNER}{" "}
          <LinkButton
            variant="link"
            size="sm"
            to="/rechtliches"
            className="h-auto px-0 text-[11px] text-muted-foreground underline"
          >
            Nutzungsbedingungen & Haftungsausschluss
          </LinkButton>
        </p>
      </div>

      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ReceiptText className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-semibold tracking-tight">BKoAb</span>
              <span className="block text-[11px] text-muted-foreground">
                Betriebskosten für WG-Wohnungen
              </span>
            </span>
          </NavLink>

          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "text-muted-foreground",
                    isActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <a
            href="https://paypal.me/danielglauert"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto sm:ml-0")}
          >
            <Coffee className="size-4" />
            <span className="hidden sm:inline">Buy me a coffee</span>
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} Daniel Glauert · Private Anwendung · Verwendung auf eigene
            Gefahr
          </p>
          <div className="flex flex-wrap gap-3">
            <LinkButton variant="link" size="sm" to="/rechtliches" className="h-auto px-0 text-xs">
              Nutzungsbedingungen
            </LinkButton>
            <LinkButton variant="link" size="sm" to="/rechtliches" className="h-auto px-0 text-xs">
              Haftungsausschluss
            </LinkButton>
            <LinkButton variant="link" size="sm" to="/rechtliches" className="h-auto px-0 text-xs">
              Drittlizenzen
            </LinkButton>
            <LinkButton variant="link" size="sm" to="/rechtliches" className="h-auto px-0 text-xs">
              Keine Steuerberatung
            </LinkButton>
          </div>
        </div>
      </footer>
    </div>
  )
}
