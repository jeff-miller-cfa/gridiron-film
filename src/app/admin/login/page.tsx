"use client";

import { useActionState } from "react";
import { PageShell } from "@/components/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "@/app/admin/login/actions";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-11 w-full min-w-0 rounded-xl border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

const initialState: LoginState = {};

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <PageShell variant="admin">
      <main className="mx-auto flex max-w-md flex-col px-4 py-16 sm:py-24">
        <Card className="surface-elevated overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <CardTitle className="font-heading text-2xl">Admin sign in</CardTitle>
            <CardDescription>
              Upload footage and manage plays for your games.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <input
                  id="username"
                  name="username"
                  className={inputClassName}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className={inputClassName}
                  autoComplete="current-password"
                  required
                />
              </div>
              {state.error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </p>
              )}
              <button
                type="submit"
                className={cn(
                  buttonVariants({ className: "h-11 w-full rounded-xl" }),
                )}
                disabled={pending}
              >
                {pending ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    </PageShell>
  );
}
