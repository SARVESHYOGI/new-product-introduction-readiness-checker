"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Factory, LoaderCircle, LogIn, Eye, EyeOff } from "lucide-react";
import { useLogin } from "@/lib/client/queries";
import { ApiClientError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_ACCOUNTS = [
  { role: "ADMIN", email: "admin@npi.local", password: "admin123" },
  { role: "ENGINEER", email: "engineer@npi.local", password: "engineer123" },
  { role: "VIEWER", email: "viewer@npi.local", password: "viewer123" },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      const from = searchParams.get("from");
      router.replace(from && from.startsWith("/") ? from : "/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Unable to sign in. Please try again."
      );
    }
  };

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Factory className="h-6 w-6" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">NPI Readiness Checker</CardTitle>
        <CardDescription>
          Sign in to run deterministic production-readiness checks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@npi.local"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogIn className="h-4 w-4" aria-hidden="true" />
            )}
            Sign in
          </Button>
        </form>

        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Demo accounts
          </p>
          <ul className="space-y-1.5">
            {DEMO_ACCOUNTS.map((acc) => (
              <li key={acc.role}>
                <button
                  type="button"
                  onClick={() => fillDemo(acc.email, acc.password)}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className="font-medium">{acc.role}</span>
                  <span className="text-muted-foreground">{acc.email}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Click an account to fill its credentials. Passwords are scrypt-hashed with an
            application pepper; sessions are HttpOnly and database-backed.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/60 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}