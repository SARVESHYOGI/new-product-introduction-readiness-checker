"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Factory,
  ClipboardCheck,
  History,
  Boxes,
  LogOut,
  LayoutDashboard,
  LoaderCircle,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogout, useMe } from "@/lib/client/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { User } from "@/lib/client/types";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/" },
  { href: "/readiness", label: "Run Check", icon: ClipboardCheck, match: (p: string) => p.startsWith("/readiness") && p !== "/readiness/history" },
  { href: "/history", label: "History", icon: History, match: (p: string) => p.startsWith("/history") },
  { href: "/products", label: "Products", icon: Boxes, match: (p: string) => p.startsWith("/products") },
  { href: "/configuration", label: "Configuration", icon: Settings2, match: (p: string) => p.startsWith("/configuration") },
];

const roleVariant: Record<User["role"], "default" | "secondary" | "outline"> = {
  ADMIN: "default",
  ENGINEER: "secondary",
  VIEWER: "outline",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, isLoading } = useMe();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Factory className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">NPI Readiness Checker</span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {isLoading || !user ? (
              <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <>
                <div className="hidden items-center gap-2 sm:flex">
                  <span className="text-sm font-medium">{user.name}</span>
                  <Badge variant={roleVariant[user.role]}>{user.role}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  disabled={logout.isPending}
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <nav aria-label="Primary mobile" className="border-b bg-card md:hidden">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 text-xs text-muted-foreground sm:px-6">
          <span>NPI Readiness Checker · deterministic, fail-safe manufacturing validation</span>
          <Separator className="hidden h-4 w-px sm:block" />
          <span>Readiness engine is the source of truth</span>
        </div>
      </footer>
    </div>
  );
}