"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipCacheButton } from "@/components/clip-cache-button";
import { ClipPicker } from "@/components/clip-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/video";
import { buildClipLayout, gameTimeToClipTime } from "@/lib/clip-layout";
import {
  DEFAULT_PLAY_LOOKBACK_SECONDS,
  normalizePlayLookbackSeconds,
} from "@/lib/game-settings";
import {
  clipHasWrapperPlay,
  clipLocalToGameTime,
  clipTimelineSegments,
  gameTimeToClipLocal,
  insertPlayInClip,
  playNumberInGame,
  playsInClip,
  removeClipWrapperPlays,
} from "@/lib/clip-play-editing";
import {
  MIN_PLAY_DURATION,
  normalizeGamePlays,
  snapGameTime,
} from "@/lib/play-boundaries";
import { useElementWidth } from "@/hooks/use-element-width";
import type { ClipCacheApi } from "@/hooks/use-clip-cache";
import { useTimelineScrub } from "@/hooks/use-timeline-scrub";
import { shouldShowTimelinePlayNumber } from "@/lib/timeline-labels";
import { playIdentityKey } from "@/lib/plays";
import {
  offenseTimelineTone,
  playListTeamButtonClass,
  playTimelineSegmentClass,
} from "@/lib/play-timeline-colors";
import type { PlayDraft, VideoClipRecord } from "@/types";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  HardDrive,
  Pause,
  Pencil,
  Play,
  StickyNote,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PlayerStage,
  playerMainGridClass,
  playerPlayListCardClass,
  playerPlayListContentClass,
  playerVideoClass,
  playerVideoColumnClass,
  playerVideoFrameClass,
  playerVideoShellClass,
} from "@/components/player-stage";

type ClipPlayEditorProps = {
  clips: VideoClipRecord[];
  plays: PlayDraft[];
  homeTeam: string;
  awayTeam: string;
  clipIndex: number;
  playLookbackSeconds?: number;
  clipCache: ClipCacheApi;
  onClipIndexChange: (index: number) => void;
  onChange: (plays: PlayDraft[]) => void;
  initialGameTime?: number | null;
  onGameTimeChange?: (gameTime: number) => void;
};

export function ClipPlayEditor({
  clips,
  plays,
  homeTeam,
  awayTeam,
  clipIndex,
  playLookbackSeconds = DEFAULT_PLAY_LOOKBACK_SECONDS,
  clipCache,
  onClipIndexChange,
  onChange,
  initialGameTime = null,
  onGameTimeChange,
}: ClipPlayEditorProps) {
  const lookbackSeconds = normalizePlayLookbackSeconds(playLookbackSeconds);
  const {
    supported: cacheSupported,
    warmClip,
    resolvePlaybackUrl,
    cacheAll,
    loadingAll: cachingAll,
    loadAllProgress,
    allCached,
    cachedCount,
    isPlayCached,
  } = clipCache;

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineWidth = useElementWidth(timelineRef);

  const [localTime, setLocalTime] = useState(0);
  const [videoSrc, setVideoSrc] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [pendingStartGameTime, setPendingStartGameTime] = useState<number | null>(
    null,
  );
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  const [notesEditorPlayId, setNotesEditorPlayId] = useState<string | null>(
    null,
  );
  const [clipPickerOpen, setClipPickerOpen] = useState(false);

  const { entries } = useMemo(() => buildClipLayout(clips), [clips]);
  const safeClipIndex = Math.min(Math.max(clipIndex, 0), Math.max(entries.length - 1, 0));
  const entry = entries[safeClipIndex];
  const clip = entry?.clip;
  const clipDuration = clip?.duration ?? 0;

  const clipPlays = useMemo(
    () => (entry ? playsInClip(plays, entry) : []),
    [plays, entry],
  );

  const timelineSegments = useMemo(
    () => (entry ? clipTimelineSegments(plays, entry) : []),
    [plays, entry],
  );

  const hasWrapper = entry ? clipHasWrapperPlay(plays, entry) : false;

  useEffect(() => {
    if (safeClipIndex !== clipIndex) {
      onClipIndexChange(safeClipIndex);
    }
  }, [clipIndex, onClipIndexChange, safeClipIndex]);

  const pendingStartGameTimeRef = useRef(pendingStartGameTime);
  pendingStartGameTimeRef.current = pendingStartGameTime;

  const updatePlays = useCallback(
    (updated: PlayDraft[]) => {
      onChange(normalizeGamePlays(updated, clips));
    },
    [clips, onChange],
  );

  const removeWrapperForClip = useCallback(() => {
    if (!entry || !clipHasWrapperPlay(plays, entry)) return false;
    updatePlays(removeClipWrapperPlays(plays, entry));
    return true;
  }, [entry, plays, updatePlays]);

  const finalizePendingPlay = useCallback(
    (startGameTime: number, endLocalTime: number) => {
      if (!entry) return false;

      const endGame = clipLocalToGameTime(entry, endLocalTime);
      const startGame = snapGameTime(startGameTime);

      if (endGame <= startGame + MIN_PLAY_DURATION) return false;

      const newPlay: PlayDraft = {
        clientKey: crypto.randomUUID(),
        startTime: startGame,
        endTime: endGame,
        offenseTeam: null,
        notes: "",
      };

      const updated = insertPlayInClip(
        plays,
        entry,
        startGame,
        endGame,
        newPlay,
        clips,
      );
      updatePlays(updated);
      setPendingStartGameTime(null);
      pendingStartGameTimeRef.current = null;
      setSelectedPlayId(playIdentityKey(newPlay));
      return true;
    },
    [clips, entry, plays, updatePlays],
  );

  const autoEndPendingPlayAtClipEnd = useCallback(() => {
    if (!clip || pendingStartGameTimeRef.current === null) return false;

    const created = finalizePendingPlay(
      pendingStartGameTimeRef.current,
      clip.duration,
    );
    if (created) {
      const video = videoRef.current;
      if (video) {
        video.pause();
      }
      setIsPlaying(false);
    }
    return created;
  }, [clip, finalizePendingPlay]);

  const seekToLocalTime = useCallback(
    (time: number, autoplay = false, persistGameTime = true) => {
      const video = videoRef.current;
      if (!video || !clip) return;

      void warmClip(clip);

      const clamped = Math.max(
        0,
        Math.min(time, Math.max(0, clip.duration - 0.001)),
      );
      video.currentTime = clamped;
      setLocalTime(clamped);
      if (entry && persistGameTime) {
        onGameTimeChange?.(clipLocalToGameTime(entry, clamped));
      }

      if (
        pendingStartGameTimeRef.current !== null &&
        clip.duration > 0 &&
        clamped >= Math.max(0, clip.duration - 0.1)
      ) {
        autoEndPendingPlayAtClipEnd();
        return;
      }

      if (autoplay) {
        void video.play().then(() => setIsPlaying(true));
      }
    },
    [autoEndPendingPlayAtClipEnd, clip, entry, onGameTimeChange, warmClip],
  );

  useEffect(() => {
    if (!clip) {
      setVideoSrc("");
      return;
    }

    setVideoSrc(clip.blobUrl);

    let cancelled = false;

    void (async () => {
      void warmClip(clip);
      const playbackUrl = await resolvePlaybackUrl(clip);
      if (!cancelled && playbackUrl !== clip.blobUrl) {
        setVideoSrc(playbackUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clip, resolvePlaybackUrl, warmClip]);

  useEffect(() => {
    if (!clip || !entry) return;

    setPendingStartGameTime(null);
    pendingStartGameTimeRef.current = null;
    setIsPlaying(false);

    let localStart = 0;
    if (initialGameTime !== null) {
      const located = gameTimeToClipTime(initialGameTime, clips);
      if (located?.clipId === clip.id) {
        localStart = located.localTime;
      }
    }

    const video = videoRef.current;
    if (!video) return;

    video.pause();

    const applyStart = () => {
      seekToLocalTime(localStart, false, false);
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      applyStart();
      return;
    }

    video.addEventListener("loadedmetadata", applyStart, { once: true });
    return () => {
      video.removeEventListener("loadedmetadata", applyStart);
    };
    // Seek when the active clip changes without writing `t` back to the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, safeClipIndex]);

  const seekToPlay = useCallback(
    (playId: string) => {
      const segment = timelineSegments.find(
        (row) => playIdentityKey(row.play) === playId,
      );
      if (!segment) return;
      setSelectedPlayId(playId);
      seekToLocalTime(segment.localStart, true);
    },
    [seekToLocalTime, timelineSegments],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;

    const clipEndThreshold = Math.max(0, clip.duration - 0.1);

    const onTimeUpdate = () => {
      const time = video.currentTime;
      setLocalTime(time);

      if (
        pendingStartGameTimeRef.current !== null &&
        clip.duration > 0 &&
        time >= clipEndThreshold
      ) {
        autoEndPendingPlayAtClipEnd();
      }
    };

    const onEnded = () => {
      if (pendingStartGameTimeRef.current !== null) {
        autoEndPendingPlayAtClipEnd();
      } else {
        setIsPlaying(false);
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeked", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeked", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [autoEndPendingPlayAtClipEnd, clip]);

  const { playheadPercent, onTimelinePointerDown, onPlayheadPointerDown } =
    useTimelineScrub({
      timelineRef,
      fullDuration: clipDuration,
      fullPosition: localTime,
      onSeek: (time) => seekToLocalTime(time, isPlaying),
    });

  const markStartAt = useCallback(
    (lookbackSeconds = 0) => {
      if (!entry) return;
      removeWrapperForClip();
      const gameTime = clipLocalToGameTime(
        entry,
        Math.max(0, localTime - lookbackSeconds),
      );
      setPendingStartGameTime(gameTime);
      pendingStartGameTimeRef.current = gameTime;
    },
    [entry, localTime, removeWrapperForClip],
  );

  const markEndAndCreatePlay = useCallback(() => {
    if (!entry) return;

    const startGameTime =
      pendingStartGameTime ?? clipLocalToGameTime(entry, 0);

    if (pendingStartGameTime === null) {
      removeWrapperForClip();
    }

    finalizePendingPlay(startGameTime, localTime);
  }, [
    entry,
    finalizePendingPlay,
    localTime,
    pendingStartGameTime,
    removeWrapperForClip,
  ]);

  const removePlay = (play: PlayDraft) => {
    const targetKey = playIdentityKey(play);
    updatePlays(plays.filter((p) => playIdentityKey(p) !== targetKey));
    setSelectedPlayId(null);
  };

  const updatePlayField = (
    play: PlayDraft,
    field: keyof PlayDraft,
    value: string | number,
  ) => {
    onChange(
      normalizeGamePlays(
        plays.map((p) =>
          playIdentityKey(p) === playIdentityKey(play)
            ? { ...p, [field]: value }
            : p,
        ),
        clips,
      ),
    );
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  if (!clip || !entry) {
    return null;
  }

  const pendingStartLocal =
    pendingStartGameTime === null
      ? null
      : gameTimeToClipLocal(entry, pendingStartGameTime);

  const timelinePanel = (
    <div className="surface-card shrink-0 space-y-2 p-4 max-lg:landscape:py-3">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{formatDuration(localTime)}</span>
        <span>{formatDuration(clipDuration)} clip</span>
      </div>
      <div
        ref={timelineRef}
        role="slider"
        aria-label="Clip timeline"
        tabIndex={0}
        className="relative h-10 max-lg:landscape:h-9 sm:h-11 cursor-pointer touch-none overflow-hidden rounded-xl border border-border/80 bg-muted/40 select-none"
        onPointerDown={onTimelinePointerDown}
      >
        {timelineSegments.map((segment) => {
          const left =
            clipDuration > 0 ? (segment.localStart / clipDuration) * 100 : 0;
          const width =
            clipDuration > 0 ? (segment.duration / clipDuration) * 100 : 0;
          const playId = playIdentityKey(segment.play);
          const isSelected = playId === selectedPlayId;
          const playNumber = playNumberInGame(plays, segment.play);
          const offenseTone = offenseTimelineTone(
            segment.play.offenseTeam,
            homeTeam,
            awayTeam,
          );

          return (
            <button
              key={playId}
              type="button"
              className={playTimelineSegmentClass(offenseTone, isSelected)}
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={(e) => {
                e.stopPropagation();
                seekToPlay(playId);
              }}
            >
              {shouldShowTimelinePlayNumber(
                width,
                timelineWidth,
                playNumber,
                isSelected,
              ) ? (
                <span className="tabular-nums">{playNumber}</span>
              ) : null}
            </button>
          );
        })}
        {pendingStartLocal !== null && clipDuration > 0 ? (
          <div
            className="pointer-events-none absolute top-0 z-[4] h-full w-0.5 bg-amber-400"
            style={{ left: `${(pendingStartLocal / clipDuration) * 100}%` }}
          />
        ) : null}
        <div
          className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-accent shadow-[0_0_6px_rgba(0,0,0,0.35)]"
          style={{ left: `${playheadPercent}%` }}
        />
        <div
          role="presentation"
          className="absolute top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-card bg-accent shadow-md active:cursor-grabbing"
          style={{ left: `${playheadPercent}%`, touchAction: "none" }}
          onPointerDown={onPlayheadPointerDown}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground max-lg:landscape:hidden">
        Mark play start, scrub to the end, then mark play end — or let playback
        finish to auto-end at the clip boundary
      </p>
    </div>
  );

  return (
    <PlayerStage>
      <div className="surface-card flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <button
            type="button"
            className="group inline-flex max-w-full items-center gap-1.5 rounded-lg text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => setClipPickerOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
              Clip {safeClipIndex + 1} of {entries.length}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary sm:h-5 sm:w-5" />
          </button>
          {hasWrapper ? (
            <p className="text-xs text-muted-foreground">
              Full-clip placeholder — your first marked play replaces it
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-xl"
            disabled={safeClipIndex <= 0}
            onClick={() => onClipIndexChange(safeClipIndex - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-xl"
            disabled={safeClipIndex >= entries.length - 1}
            onClick={() => onClipIndexChange(safeClipIndex + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ClipPicker
        open={clipPickerOpen}
        onOpenChange={setClipPickerOpen}
        entries={entries}
        plays={plays}
        currentIndex={safeClipIndex}
        onSelectClip={onClipIndexChange}
      />

      {timelinePanel}

      <div className={playerMainGridClass}>
        <div className={playerVideoColumnClass}>
          <div className={playerVideoShellClass}>
            <div className={playerVideoFrameClass}>
              <video
                ref={videoRef}
                key={clip.id}
                src={videoSrc || clip.blobUrl}
                className={playerVideoClass}
                playsInline
                preload="auto"
                controls={false}
                onClick={() => void togglePlay()}
              />
              <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 max-lg:landscape:top-2 max-lg:landscape:left-2">
                <Button
                  variant="outline"
                  className="rounded-xl border-white/25 bg-black/50 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white"
                  onClick={() => void togglePlay()}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Play
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className={cn(
                    "rounded-xl border-white/25 bg-black/50 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white",
                    pendingStartGameTime !== null &&
                      "border-amber-300/60 bg-amber-500/30",
                  )}
                  onClick={() => markStartAt(0)}
                  title="Mark play start at playhead"
                >
                  <Flag className="mr-2 h-4 w-4" />
                  Start
                </Button>
                {lookbackSeconds > 0 ? (
                  <Button
                    variant="outline"
                    className="rounded-xl border-white/25 bg-black/50 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white"
                    onClick={() => markStartAt(lookbackSeconds)}
                    title={`Mark play start ${lookbackSeconds}s before playhead`}
                  >
                    <Flag className="mr-2 h-4 w-4" />
                    Start -{lookbackSeconds}s
                  </Button>
                ) : null}
                <Button
                  className="rounded-xl bg-primary/90 text-primary-foreground backdrop-blur-sm hover:bg-primary"
                  onClick={markEndAndCreatePlay}
                  title="Mark play end and create play (uses clip start if start is not set)"
                >
                  <Flag className="mr-2 h-4 w-4" />
                  End
                </Button>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs text-white/90 sm:text-sm">
                  <span className="font-medium">
                    {pendingStartGameTime === null
                      ? "End from clip start"
                      : `Start ${formatDuration(pendingStartLocal ?? 0)}`}
                  </span>
                  <span className="tabular-nums">
                    {formatDuration(localTime)} / {formatDuration(clipDuration)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card className={playerPlayListCardClass}>
          <CardHeader className="shrink-0 border-b border-border/60 py-3 max-lg:landscape:py-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="font-heading text-sm">Plays in clip</CardTitle>
              <ClipCacheButton
                supported={cacheSupported}
                cachingAll={cachingAll}
                loadAllProgress={loadAllProgress}
                allCached={allCached}
                cachedCount={cachedCount}
                clipCount={clips.length}
                onCacheAll={cacheAll}
              />
            </div>
          </CardHeader>
          <CardContent
            className={cn(
              playerPlayListContentClass,
              "space-y-2 p-3 max-lg:landscape:p-2",
            )}
          >
            {clipPlays.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {hasWrapper
                  ? "No plays marked yet. Use End to mark a play from the clip start, or set Start first."
                  : "No plays in this clip yet."}
              </p>
            ) : null}
            {clipPlays.map((play) => {
              const playId = playIdentityKey(play);
              const playNumber = playNumberInGame(plays, play);
              const duration = play.endTime - play.startTime;
              const hasNotes = Boolean(play.notes?.trim());
              const notesOpen = notesEditorPlayId === playId;

              return (
                <div
                  key={playId}
                  className={cn(
                    "cursor-pointer rounded-lg border px-2.5 py-2 transition-colors",
                    selectedPlayId === playId
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/80 bg-card hover:border-primary/20 hover:bg-muted/30",
                  )}
                  onClick={() => seekToPlay(playId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      seekToPlay(playId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      {playNumber}
                    </span>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {formatDuration(gameTimeToClipLocal(entry, play.startTime))}
                      {" – "}
                      {formatDuration(gameTimeToClipLocal(entry, play.endTime))}
                    </span>
                    {cacheSupported &&
                    isPlayCached(play.startTime, play.endTime) ? (
                      <HardDrive
                        className="h-3.5 w-3.5 shrink-0 text-accent"
                        aria-label="Cached for offline playback"
                      />
                    ) : null}
                  </div>
                    <div
                      className="flex shrink-0 items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[homeTeam, awayTeam].map((team) => (
                        <Button
                          key={team}
                          type="button"
                          size="xs"
                          variant="outline"
                          className={playListTeamButtonClass(
                            team,
                            homeTeam,
                            awayTeam,
                            play.offenseTeam,
                          )}
                          title={team}
                          onClick={() =>
                            updatePlayField(play, "offenseTeam", team)
                          }
                        >
                          {team}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        title={hasNotes ? "Edit note" : "Add note"}
                        onClick={() =>
                          setNotesEditorPlayId((current) =>
                            current === playId ? null : playId,
                          )
                        }
                      >
                        {hasNotes ? (
                          <Pencil className="h-3 w-3" />
                        ) : (
                          <StickyNote className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removePlay(play)}
                        title="Remove play"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {hasNotes && !notesOpen ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {play.notes}
                    </p>
                  ) : null}
                  {notesOpen ? (
                    <div
                      className="mt-2 space-y-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Label className="text-[11px] text-muted-foreground">
                        Note
                      </Label>
                      <Textarea
                        autoFocus
                        className="min-h-[56px] rounded-lg text-xs"
                        placeholder="Add a note for this play…"
                        value={play.notes ?? ""}
                        onChange={(e) =>
                          updatePlayField(play, "notes", e.target.value)
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </PlayerStage>
  );
}
