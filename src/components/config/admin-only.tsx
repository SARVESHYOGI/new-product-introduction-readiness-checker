"use client";

import { Lock } from "lucide-react";
import { useMe } from "@/lib/client/queries";

/**
 * Renders `children` only for ADMIN users; otherwise shows a read-only notice.
 *
 * This is a UX affordance, NOT a security control. Every write endpoint
 * independently enforces `requireUser(["ADMIN"])` server-side, so hiding a
 * button in the client can never be mistaken for authorization.
 */
export function AdminOnly({
  children,
  what = "configuration",
}: {
  children: React.ReactNode;
  what?: string;
}) {
  const { data: user } = useMe();

  if (user && user.role !== "ADMIN") {
    return (
      <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          You are signed in as <span className="font-medium">{user.role}</span>. You can view{" "}
          {what}, but only an <span className="font-medium">ADMIN</span> can change it.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

/** True when the current user may mutate configuration. Drives disabled states. */
export function useIsAdmin(): boolean {
  const { data: user } = useMe();
  return user?.role === "ADMIN";
}
