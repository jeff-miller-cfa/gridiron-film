"use client";

import { useRef, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-11 w-full min-w-0 rounded-xl border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

export default function AdminLoginPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    const trimmedUsername = String(data.get("username") ?? "").trim();
    const trimmedPassword = String(data.get("password") ?? "").trim();

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          username: trimmedUsername,
          password: trimmedPassword,
        }),
      });

      if (res.ok) {
        window.location.assign("/admin");
        return;
      }

      setError("Invalid username or password");
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  };

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
            <form
              ref={formRef}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
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
              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className={cn("h-11 w-full rounded-xl")}
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </PageShell>
  );
}
