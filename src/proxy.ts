import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Optimistic, network-boundary auth gate (Next.js 16 "proxy" — replaces the
 * deprecated `middleware` convention).
 *
 * This is intentionally NOT an authorization boundary: it only checks that a
 * session cookie exists to avoid rendering protected pages for anonymous
 * visitors. Every API route and server component still enforces the real
 * session/role check on the server, so an attacker cannot bypass auth by
 * hitting routes that skip the proxy.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE));

  if (pathname === "/login") {
    if (hasSessionCookie) {
      const url = new URL("/", request.url);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Everything else is an authenticated page.
  if (!hasSessionCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/readiness/:path*", "/history", "/products/:path*"],
};