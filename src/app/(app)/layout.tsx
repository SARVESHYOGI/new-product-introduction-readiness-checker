import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";

/**
 * Auth boundary for all application pages (defense in depth alongside
 * src/proxy.ts). Real session validation happens here, on the server —
 * the proxy only does an optimistic cookie check.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}