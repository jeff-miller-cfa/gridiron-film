"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { VideoUploader } from "@/components/video-uploader";
import { PlayEditor } from "@/components/play-editor";
import { ExportVideoButton } from "@/components/export-video-button";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import { DeleteGameButton } from "@/components/delete-game-button";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatGameDate } from "@/lib/video";
import type { GameWithRelations, PlayDraft } from "@/types";
import { Calendar, ExternalLink, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const VIEW_MODES = ["upload", "plays", "export"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

function parseViewMode(value: string | null): ViewMode {
  if (value && VIEW_MODES.includes(value as ViewMode)) {
    return value as ViewMode;
  }
  return "upload";
}

function normalizePlaysSnapshot(plays: PlayDraft[]): string {
  return JSON.stringify(
    [...plays]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({
        id: p.id ?? null,
        videoClipId: p.videoClipId,
        startTime: p.startTime,
        endTime: p.endTime,
        playNumber: p.playNumber,
        offenseTeam: p.offenseTeam ?? null,
        notes: p.notes ?? null,
        sortOrder: p.sortOrder,
        deletedAt: p.deletedAt ?? null,
      })),
  );
}

function mapPlaysFromApi(
  items: Array<Omit<PlayDraft, "deletedAt"> & { deletedAt?: string | Date | null }>,
): PlayDraft[] {
  return [...items]
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
      deletedAt: p.deletedAt
        ? typeof p.deletedAt === "string"
          ? p.deletedAt
          : new Date(p.deletedAt as string | Date).toISOString()
        : null,
    }));
}

export default function AdminGamePage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gameId = params.id as string;
  const activeView = parseViewMode(searchParams.get("view"));
  const [game, setGame] = useState<GameWithRelations | null>(null);
  const [plays, setPlays] = useState<PlayDraft[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadGame = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}`);
    if (!res.ok) return;
    const data: GameWithRelations = await res.json();
    const loadedPlays = mapPlaysFromApi(
      (data.plays ?? []).map((p) => ({
        id: p.id,
        videoClipId: p.videoClipId,
        startTime: p.startTime,
        endTime: p.endTime,
        playNumber: p.playNumber,
        offenseTeam: p.offenseTeam,
        notes: p.notes,
        sortOrder: p.sortOrder,
        deletedAt: p.deletedAt,
      })),
    );
    lastSavedSnapshotRef.current = normalizePlaysSnapshot(loadedPlays);
    setGame(data);
    setPlays(loadedPlays);
  }, [gameId]);

  useEffect(() => {
    void loadGame();
  }, [loadGame]);

  const persistPlays = useCallback(
    async (playsToSave: PlayDraft[]) => {
      if (isSavingRef.current) return;

      const snapshot = normalizePlaysSnapshot(playsToSave);
      if (snapshot === lastSavedSnapshotRef.current) return;

      isSavingRef.current = true;
      setSaveStatus("saving");

      const res = await fetch(`/api/games/${gameId}/plays`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plays: playsToSave }),
      });

      if (!res.ok) {
        isSavingRef.current = false;
        setSaveStatus("error");
        return;
      }

      const saved = mapPlaysFromApi(await res.json());
      lastSavedSnapshotRef.current = normalizePlaysSnapshot(saved);

      setPlays((current) => {
        let changed = false;
        const next = current.map((play) => {
          if (play.id) {
            const match = saved.find((s) => s.id === play.id);
            if (!match) return play;
            if (
              normalizePlaysSnapshot([play]) === normalizePlaysSnapshot([match])
            ) {
              return play;
            }
            changed = true;
            return match;
          }

          const match = saved.find(
            (s) =>
              s.videoClipId === play.videoClipId &&
              s.startTime === play.startTime &&
              s.endTime === play.endTime &&
              s.sortOrder === play.sortOrder,
          );
          if (match?.id) {
            changed = true;
            return { ...play, id: match.id };
          }
          return play;
        });
        return changed ? next : current;
      });

      isSavingRef.current = false;
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    [gameId],
  );

  useEffect(() => {
    if (!game || isSavingRef.current) return;

    const snapshot = normalizePlaysSnapshot(plays);
    if (snapshot === lastSavedSnapshotRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistPlays(plays);
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [plays, game, persistPlays]);

  const recoverPlay = (playId: string) => {
    setPlays((current) => {
      const updated = current.map((p) =>
        p.id === playId ? { ...p, deletedAt: null } : p,
      );
      let n = 0;
      return [...updated]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => {
          if (p.deletedAt) return p;
          n += 1;
          return { ...p, playNumber: n };
        });
    });
  };

  const setActiveView = (view: ViewMode) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", view);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (!game) {
    return (
      <PageShell variant="admin">
        <main className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Loading game...
        </main>
      </PageShell>
    );
  }

  const activePlays = plays.filter((p) => !p.deletedAt);
  const playsWithClips = plays
    .filter((p) => !p.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({
      ...p,
      id: p.id ?? "",
      gameId: game.id,
      offenseTeam: p.offenseTeam ?? null,
      notes: p.notes ?? null,
      deletedAt: null,
      createdAt: "",
      updatedAt: "",
      videoClip: game.videoClips?.find((c) => c.id === p.videoClipId),
    }));

  return (
    <PageShell variant="admin">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-8 surface-card p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Game editor
                </p>
                <span
                  className={cn(
                    "text-xs font-medium",
                    saveStatus === "saving" && "text-muted-foreground",
                    saveStatus === "saved" && "text-accent",
                    saveStatus === "error" && "text-destructive",
                  )}
                >
                  {saveStatus === "saving" && "Saving…"}
                  {saveStatus === "saved" && "All changes saved"}
                  {saveStatus === "error" && "Save failed — retrying on next edit"}
                </span>
              </div>
              <h1 className="mt-2 font-heading text-3xl font-bold">
                <span className="text-muted-foreground">{game.awayTeam}</span>
                <span className="mx-2 font-normal text-border">@</span>
                {game.homeTeam}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <MapPin className="h-3 w-3" />
                  {game.stadium}
                </Badge>
                <Badge variant="secondary" className="gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {formatGameDate(game.gameDateTime)}
                </Badge>
                <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                  {game.videoClips?.length ?? 0} clips
                </Badge>
                <Badge className="bg-accent/10 text-accent hover:bg-accent/15">
                  {activePlays.length} plays
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/games/${gameId}`}
                target="_blank"
                className={buttonVariants({
                  variant: "outline",
                  className: "rounded-xl",
                })}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Preview
              </Link>
              <DeleteGameButton
                gameId={gameId}
                awayTeam={game.awayTeam}
                homeTeam={game.homeTeam}
                className="h-9 rounded-xl px-3"
              />
              <AdminLogoutButton />
            </div>
          </div>
        </div>

        <Tabs
          value={activeView}
          onValueChange={(value) => setActiveView(parseViewMode(value))}
          className="space-y-6"
        >
          <TabsList className="h-11 w-full justify-start rounded-xl bg-muted/80 p-1 sm:w-auto">
            <TabsTrigger value="upload" className="rounded-lg px-5">
              Upload
            </TabsTrigger>
            <TabsTrigger value="plays" className="rounded-lg px-5">
              Edit plays
            </TabsTrigger>
            <TabsTrigger value="export" className="rounded-lg px-5">
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <VideoUploader gameId={gameId} onUploaded={() => void loadGame()} />
          </TabsContent>

          <TabsContent value="plays">
            <PlayEditor
              clips={game.videoClips ?? []}
              plays={plays}
              gameId={gameId}
              homeTeam={game.homeTeam}
              awayTeam={game.awayTeam}
              onChange={setPlays}
              onRecoverPlay={recoverPlay}
            />
          </TabsContent>

          <TabsContent value="export" className="surface-card p-6">
            <ExportVideoButton
              plays={playsWithClips}
              gameTitle={`${game.awayTeam}-at-${game.homeTeam}`}
            />
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Export stitches all active plays into a single video with play
              numbers in a footer overlay.
            </p>
          </TabsContent>
        </Tabs>
      </main>
    </PageShell>
  );
}
