"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { VideoUploader } from "@/components/video-uploader";
import { PlayEditor } from "@/components/play-editor";
import { ExportVideoButton } from "@/components/export-video-button";
import { GameAdminMenu } from "@/components/game-admin-menu";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { sortPlays } from "@/lib/plays";
import { formatGameDate } from "@/lib/video";
import type { GameWithRelations, PlayDraft, PlayGap } from "@/types";
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
      .sort((a, b) => a.startTime - b.startTime)
      .map((p) => ({
        id: p.id ?? null,
        startTime: p.startTime,
        endTime: p.endTime,
        offenseTeam: p.offenseTeam ?? null,
        notes: p.notes ?? null,
      })),
  );
}

function mapPlaysFromApi(items: PlayDraft[]): PlayDraft[] {
  return items.map((p) => ({
    id: p.id,
    startTime: p.startTime,
    endTime: p.endTime,
    offenseTeam: p.offenseTeam,
    notes: p.notes,
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
        startTime: p.startTime,
        endTime: p.endTime,
        offenseTeam: p.offenseTeam,
        notes: p.notes,
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
              s.startTime === play.startTime && s.endTime === play.endTime,
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

  const restoreGap = (gaps: PlayGap[]) => {
    if (gaps.length === 0) return;

    setPlays((current) => [
      ...current,
      ...gaps.map((gap) => ({
        clientKey: crypto.randomUUID(),
        startTime: gap.startTime,
        endTime: gap.endTime,
        offenseTeam: null,
        notes: "",
      })),
    ]);
  };

  const handlePlaysReset = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    isSavingRef.current = false;
    setSaveStatus("idle");
    void loadGame();
  }, [loadGame]);

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

  const sortedPlays = sortPlays(
    plays.map((p) => ({
      ...p,
      id: p.id ?? "",
      gameId: game.id,
      offenseTeam: p.offenseTeam ?? null,
      notes: p.notes ?? null,
      createdAt: "",
      updatedAt: "",
    })),
  );

  return (
    <PageShell variant="admin">
      <main className="mx-auto max-w-6xl px-4 py-6 max-lg:landscape:px-3 max-lg:landscape:py-3 sm:px-6 sm:py-8">
        <div className="surface-card mb-8 p-6 max-lg:landscape:mb-3 max-lg:landscape:p-3">
          <div className="flex flex-col gap-4 max-lg:landscape:gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3 max-lg:landscape:gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent max-lg:landscape:hidden">
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
              <h1 className="mt-2 font-heading text-3xl font-bold max-lg:landscape:mt-0 max-lg:landscape:truncate max-lg:landscape:text-xl">
                <span className="text-muted-foreground">{game.awayTeam}</span>
                <span className="mx-2 font-normal text-border">@</span>
                {game.homeTeam}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2 max-lg:landscape:hidden">
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
                  {plays.length} plays
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-lg:landscape:shrink-0">
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
              <GameAdminMenu
                gameId={gameId}
                awayTeam={game.awayTeam}
                homeTeam={game.homeTeam}
                clipCount={game.videoClips?.length ?? 0}
                playCount={plays.length}
                onPlaysReset={handlePlaysReset}
                onClipsDeleted={() => void loadGame()}
              />
            </div>
          </div>
        </div>

        <Tabs
          value={activeView}
          onValueChange={(value) => setActiveView(parseViewMode(value))}
          className="space-y-6 max-lg:landscape:space-y-3"
        >
          <TabsList className="h-11 w-full justify-start rounded-xl bg-muted/80 p-1 max-lg:landscape:h-9 sm:w-auto">
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
              onRestoreGap={restoreGap}
            />
          </TabsContent>

          <TabsContent value="export" className="surface-card p-6">
            <ExportVideoButton
              plays={sortedPlays}
              clips={game.videoClips ?? []}
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
