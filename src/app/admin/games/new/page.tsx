"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Create new game</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="homeTeam">Home team</Label>
                <Input
                  id="homeTeam"
                  value={homeTeam}
                  onChange={(e) => setHomeTeam(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="awayTeam">Away team</Label>
                <Input
                  id="awayTeam"
                  value={awayTeam}
                  onChange={(e) => setAwayTeam(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stadium">Stadium</Label>
                <Input
                  id="stadium"
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
                  value={gameDateTime}
                  onChange={(e) => setGameDateTime(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create game"}
                </Button>
                <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
                  Cancel
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
