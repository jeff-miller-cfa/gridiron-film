"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewGamePage() {
  const router = useRouter();
  const [stadium, setStadium] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [gameDateTime, setGameDateTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stadium, homeTeam, awayTeam, gameDateTime }),
    });

    if (res.ok) {
      const game = await res.json();
      router.push(`/admin/games/${game.id}`);
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to create game");
    }
    setLoading(false);
  };

  return (
    <PageShell variant="admin">
      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          eyebrow="New game"
          title="Create a game"
          description="Enter matchup details before uploading footage."
        />

        <Card className="surface-elevated">
          <CardContent className="pt-6">
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="awayTeam">Away team</Label>
                  <Input
                    id="awayTeam"
                    className="h-11 rounded-xl"
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="homeTeam">Home team</Label>
                  <Input
                    id="homeTeam"
                    className="h-11 rounded-xl"
                    value={homeTeam}
                    onChange={(e) => setHomeTeam(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stadium">Stadium</Label>
                <Input
                  id="stadium"
                  className="h-11 rounded-xl"
                  value={stadium}
                  onChange={(e) => setStadium(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gameDateTime">Date & time</Label>
                <Input
                  id="gameDateTime"
                  type="datetime-local"
                  className="h-11 rounded-xl"
                  value={gameDateTime}
                  onChange={(e) => setGameDateTime(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  className="h-11 flex-1 rounded-xl"
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Create game"}
                </Button>
                <Link
                  href="/admin"
                  className={buttonVariants({
                    variant: "outline",
                    className: "h-11 rounded-xl",
                  })}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </PageShell>
  );
}
