"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_PLAY_LOOKBACK_SECONDS,
  MAX_PLAY_LOOKBACK_SECONDS,
  MIN_PLAY_LOOKBACK_SECONDS,
  toDatetimeLocalValue,
} from "@/lib/game-settings";
import type { GameWithRelations } from "@/types";
import { ArrowLeft } from "lucide-react";

export default function GameSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;

  const [game, setGame] = useState<GameWithRelations | null>(null);
  const [stadium, setStadium] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [gameDateTime, setGameDateTime] = useState("");
  const [playLookbackSeconds, setPlayLookbackSeconds] = useState(
    String(DEFAULT_PLAY_LOOKBACK_SECONDS),
  );
  const [viewerAudioMuted, setViewerAudioMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadGame = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }

    const data: GameWithRelations = await res.json();
    setGame(data);
    setStadium(data.stadium);
    setHomeTeam(data.homeTeam);
    setAwayTeam(data.awayTeam);
    setGameDateTime(toDatetimeLocalValue(data.gameDateTime));
    setPlayLookbackSeconds(String(data.playLookbackSeconds));
    setViewerAudioMuted(data.viewerAudioMuted);
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    void loadGame();
  }, [loadGame]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stadium,
        homeTeam,
        awayTeam,
        gameDateTime,
        playLookbackSeconds: Number(playLookbackSeconds),
        viewerAudioMuted,
      }),
    });

    if (res.ok) {
      router.push(`/admin/games/${gameId}`);
      router.refresh();
      return;
    }

    const data = await res.json();
    setError(data.error ?? "Failed to save settings");
    setSaving(false);
  };

  if (loading) {
    return (
      <PageShell variant="admin">
        <main className="mx-auto flex min-h-[40vh] max-w-2xl items-center justify-center px-4 text-muted-foreground">
          Loading settings...
        </main>
      </PageShell>
    );
  }

  if (!game) {
    return (
      <PageShell variant="admin">
        <main className="mx-auto max-w-2xl px-4 py-8 text-center">
          <p className="text-muted-foreground">Game not found.</p>
          <Link href="/admin" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
            Back to admin
          </Link>
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell variant="admin">
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          eyebrow="Game settings"
          title={`${game.awayTeam} @ ${game.homeTeam}`}
          description="Update matchup details and playback preferences for this game."
          actions={
            <Link
              href={`/admin/games/${gameId}`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "rounded-lg" })}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to editor
            </Link>
          }
        />

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
          <Card className="surface-elevated">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Matchup details</CardTitle>
              <CardDescription>
                Teams, stadium, and kickoff time shown on the public game page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="awayTeam">Away team</Label>
                  <Input
                    id="awayTeam"
                    className="h-11 rounded-xl"
                    value={awayTeam}
                    onChange={(event) => setAwayTeam(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="homeTeam">Home team</Label>
                  <Input
                    id="homeTeam"
                    className="h-11 rounded-xl"
                    value={homeTeam}
                    onChange={(event) => setHomeTeam(event.target.value)}
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
                  onChange={(event) => setStadium(event.target.value)}
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
                  onChange={(event) => setGameDateTime(event.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card className="surface-elevated">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Playback</CardTitle>
              <CardDescription>
                Controls how plays are marked during editing and how the public
                viewer hears audio.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="playLookbackSeconds">Lookback before playhead</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="playLookbackSeconds"
                    type="number"
                    min={MIN_PLAY_LOOKBACK_SECONDS}
                    max={MAX_PLAY_LOOKBACK_SECONDS}
                    step={1}
                    className="h-11 w-28 rounded-xl"
                    value={playLookbackSeconds}
                    onChange={(event) => setPlayLookbackSeconds(event.target.value)}
                    required
                  />
                  <span className="text-sm text-muted-foreground">
                    seconds used by Split -Ns and Start -Ns
                  </span>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <Label htmlFor="viewerAudioMuted" className="text-base">
                    Mute public viewer audio
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, the public game page plays video without
                    sound. Admin editing always keeps audio on.
                  </p>
                </div>
                <Switch
                  id="viewerAudioMuted"
                  checked={viewerAudioMuted}
                  onCheckedChange={setViewerAudioMuted}
                />
              </div>
            </CardContent>
          </Card>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              type="submit"
              className="h-11 flex-1 rounded-xl"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save settings"}
            </Button>
            <Link
              href={`/admin/games/${gameId}`}
              className={buttonVariants({
                variant: "outline",
                className: "h-11 rounded-xl",
              })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </PageShell>
  );
}
