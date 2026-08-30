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
import { normalizeGamePlays } from "@/lib/play-boundaries";
import { clipIndexForGameTime } from "@/lib/clip-layout";
import { parsePersistedPlayhead } from "@/hooks/use-persisted-playhead";
import { sortPlays } from "@/lib/plays";
import { formatGameDate } from "@/lib/video";
import type { GameWithRelations, PlayDraft, PlayGap } from "@/types";
import { Calendar, Download, ExternalLink, Layers, MapPin, Scissors, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const VIEW_MODES = ["upload", "timeline", "clip", "export"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

function parseViewMode(
  value: string | null,
  modeParam: string | null = null,
  hasClips = false,
): ViewMode {
  if (value === "plays") {
    return modeParam === "clip" ? "clip" : "timeline";
  }
  if (value && VIEW_MODES.includes(value as ViewMode)) {
    return value as ViewMode;
  }
  return hasClips ? "timeline" : "upload";
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

function mapPlaysFromApi(
  items: PlayDraft[],
  clips: GameWithRelations["videoClips"] = [],
): PlayDraft[] {
  return normalizeGamePlays(
    items.map((p) => ({
      id: p.id,
      startTime: p.startTime,
      endTime: p.endTime,
      offenseTeam: p.offenseTeam,
      notes: p.notes,
    })),
    clips ?? [],
  );
}

export default function AdminGamePage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gameId = params.id as string;
  const [game, setGame] = useState<GameWithRelations | null>(null);
  const [plays, setPlays] = useState<PlayDraft[]>([]);
  const hasClips = (game?.videoClips?.length ?? 0) > 0;
  const activeView = parseViewMode(
    searchParams.get("view"),
    searchParams.get("mode"),
    hasClips,
  );
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
      data.videoClips ?? [],
    );
    lastSavedSnapshotRef.current = normalizePlaysSnapshot(loadedPlays);
    setGame(data);
    setPlays(loadedPlays);
  }, [gameId]);

  useEffect(() => {
    void loadGame();
  }, [loadGame]);

  useEffect(() => {
    if (!game || searchParams.has("view")) return;
    if (!hasClips) return;

    const next = new URLSearchParams(searchParams.toString());
    next.set("view", "timeline");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [game, hasClips, searchParams, pathname, router]);

  useEffect(() => {
    const view = searchParams.get("view");
    const mode = searchParams.get("mode");
    if (view !== "plays" && mode !== "clip") return;

    const next = new URLSearchParams(searchParams.toString());
    if (view === "plays") {
      next.set("view", mode === "clip" ? "clip" : "timeline");
    }
    next.delete("mode");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

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

      const saved = mapPlaysFromApi(await res.json(), game?.videoClips ?? []);
      lastSavedSnapshotRef.current = normalizePlaysSnapshot(saved);
      setPlays(saved);

      isSavingRef.current = false;
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    [game?.videoClips, gameId],
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

    setPlays((current) =>
      normalizeGamePlays(
        [
          ...current,
          ...gaps.map((gap) => ({
            clientKey: crypto.randomUUID(),
            startTime: gap.startTime,
            endTime: gap.endTime,
            offenseTeam: null,
            notes: "",
          })),
        ],
        game?.videoClips ?? [],
      ),
    );
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

  const isPlayEditingView = activeView === "timeline" || activeView === "clip";

  const setActiveView = (view: ViewMode) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", view);
    if (view !== "clip") {
      next.delete("clip");
    } else if (game) {
      const persisted = parsePersistedPlayhead(searchParams);
      if (persisted) {
        next.set(
          "clip",
          String(
            clipIndexForGameTime(persisted.gameTime, game.videoClips ?? []),
          ),
        );
      }
    }
    next.delete("mode");
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
      <main
        className={cn(
          "w-full px-4 py-6 max-lg:landscape:px-2 max-lg:landscape:py-2 sm:px-6 sm:py-8",
          isPlayEditingView &&
            "max-lg:landscape:h-svh max-lg:landscape:overflow-hidden max-lg:landscape:py-0",
        )}
      >
        <Tabs
          value={activeView}
          onValueChange={(value) =>
            setActiveView(parseViewMode(value, null, hasClips))
          }
          className={cn(
            "space-y-4 max-lg:landscape:space-y-2",
            isPlayEditingView && "max-lg:landscape:space-y-0",
          )}
        >
          <div
            className={cn(
              "surface-card overflow-hidden",
              isPlayEditingView ? "mb-0 max-lg:landscape:hidden" : "mb-4",
            )}
          >
            <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
              <div className="min-w-0 flex-1">
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
                <h1 className="mt-1.5 font-heading text-2xl font-bold sm:text-3xl">
                  <span className="text-muted-foreground">{game.awayTeam}</span>
                  <span className="mx-2 font-normal text-border">@</span>
                  {game.homeTeam}
                </h1>
                <div className="mt-3 flex flex-wrap gap-2">
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

              <div className="flex flex-col items-stretch gap-3 sm:items-end lg:shrink-0">
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Link
                    href={`/games/${gameId}`}
                    target="_blank"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "rounded-lg",
                    })}
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
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

                <TabsList className="ml-auto h-9 w-auto max-w-full justify-end gap-0.5 overflow-x-auto rounded-lg border border-border/60 bg-muted/70 p-1 shadow-inner">
                  <TabsTrigger
                    value="upload"
                    className="h-7 shrink-0 gap-1.5 rounded-md px-2.5 text-xs after:hidden data-active:bg-background data-active:text-primary data-active:font-semibold data-active:shadow-sm sm:px-3 sm:text-sm"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger
                    value="timeline"
                    className="h-7 shrink-0 gap-1.5 rounded-md px-2.5 text-xs after:hidden data-active:bg-background data-active:text-primary data-active:font-semibold data-active:shadow-sm sm:px-3 sm:text-sm"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger
                    value="clip"
                    className="h-7 shrink-0 gap-1.5 rounded-md px-2.5 text-xs after:hidden data-active:bg-background data-active:text-primary data-active:font-semibold data-active:shadow-sm sm:px-3 sm:text-sm"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    Clips
                  </TabsTrigger>
                  <TabsTrigger
                    value="export"
                    className="h-7 shrink-0 gap-1.5 rounded-md px-2.5 text-xs after:hidden data-active:bg-background data-active:text-primary data-active:font-semibold data-active:shadow-sm sm:px-3 sm:text-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>

          <TabsContent value="upload">
            <VideoUploader gameId={gameId} onUploaded={() => void loadGame()} />
          </TabsContent>

          <TabsContent value="timeline">
            <PlayEditor
              mode="game"
              clips={game.videoClips ?? []}
              plays={plays}
              gameId={gameId}
              homeTeam={game.homeTeam}
              awayTeam={game.awayTeam}
              playLookbackSeconds={game.playLookbackSeconds}
              onChange={setPlays}
              onRestoreGap={restoreGap}
            />
          </TabsContent>

          <TabsContent value="clip">
            <PlayEditor
              mode="clip"
              clips={game.videoClips ?? []}
              plays={plays}
              gameId={gameId}
              homeTeam={game.homeTeam}
              awayTeam={game.awayTeam}
              playLookbackSeconds={game.playLookbackSeconds}
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
