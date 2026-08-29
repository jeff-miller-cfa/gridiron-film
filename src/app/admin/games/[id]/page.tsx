"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VideoUploader } from "@/components/video-uploader";
import { PlayEditor } from "@/components/play-editor";
import { ExportVideoButton } from "@/components/export-video-button";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatGameDate } from "@/lib/video";
import type { GameWithRelations, PlayDraft } from "@/types";
import { ExternalLink, Save } from "lucide-react";

export default function AdminGamePage() {
  const params = useParams();
  const gameId = params.id as string;
  const [game, setGame] = useState<GameWithRelations | null>(null);
  const [plays, setPlays] = useState<PlayDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const loadGame = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}`);
    if (!res.ok) return;
    const data: GameWithRelations = await res.json();
    setGame(data);
    setPlays(
      [...(data.plays ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => ({
          id: p.id,
          videoClipId: p.videoClipId,
          startTime: p.startTime,
          endTime: p.endTime,
          playNumber: p.playNumber,
          offenseTeam: p.offenseTeam,
          notes: p.notes,
          sortOrder: p.sortOrder,
        })),
    );
  }, [gameId]);

  useEffect(() => {
    void loadGame();
  }, [loadGame]);

  const savePlays = async () => {
    setSaving(true);
    setSaveMessage("");
    const res = await fetch(`/api/games/${gameId}/plays`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plays }),
    });

    if (res.ok) {
      setSaveMessage("Plays saved!");
      await loadGame();
    } else {
      setSaveMessage("Failed to save plays");
    }
    setSaving(false);
  };

  if (!game) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="p-8 text-center text-muted-foreground">Loading...</main>
      </div>
    );
  }

  const playsWithClips = plays
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({
      ...p,
      id: p.id ?? "",
      gameId: game.id,
      offenseTeam: p.offenseTeam ?? null,
      notes: p.notes ?? null,
      createdAt: "",
      updatedAt: "",
      videoClip: game.videoClips?.find((c) => c.id === p.videoClipId),
    }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {game.awayTeam} @ {game.homeTeam}
            </h1>
            <p className="text-sm text-muted-foreground">
              {game.stadium} · {formatGameDate(game.gameDateTime)}
            </p>
            <div className="mt-2 flex gap-2">
              <Badge variant="secondary">
                {game.videoClips?.length ?? 0} clips
              </Badge>
              <Badge variant="secondary">{plays.length} plays</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/games/${gameId}`}
              target="_blank"
              className={buttonVariants({ variant: "outline" })}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview
            </Link>
            <Button onClick={() => void savePlays()} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save plays"}
            </Button>
            <AdminLogoutButton />
          </div>
        </div>

        {saveMessage && (
          <p className="mb-4 text-sm text-muted-foreground">{saveMessage}</p>
        )}

        <Tabs defaultValue="upload">
          <TabsList className="mb-4">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="plays">Edit plays</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <VideoUploader gameId={gameId} onUploaded={() => void loadGame()} />
          </TabsContent>

          <TabsContent value="plays">
            <PlayEditor
              clips={game.videoClips ?? []}
              plays={plays}
              homeTeam={game.homeTeam}
              awayTeam={game.awayTeam}
              onChange={setPlays}
            />
          </TabsContent>

          <TabsContent value="export">
            <ExportVideoButton
              plays={playsWithClips}
              gameTitle={`${game.awayTeam}-at-${game.homeTeam}`}
            />
            <p className="mt-4 text-sm text-muted-foreground">
              Export stitches all plays into a single video with play numbers
              displayed in a footer overlay. Processing happens in your browser
              and may take a few minutes for long games.
            </p>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
