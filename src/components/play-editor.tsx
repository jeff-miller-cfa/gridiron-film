"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/video";
import {
  buildTimelines,
  clipTimeToPlaybackTime,
  findActiveSegmentAtGameTime,
  resolvePlaybackSegment,
  fullPositionToPlaybackTime,
  fullPositionToSegment,
  gameTimeToPlaybackTime,
  gapToPlayGaps,
  isGapSegment,
  isPlaySegment,
  playbackToFullPosition,
  resolveClipIdFromVideo,
  segmentGameTime,
} from "@/lib/player-timeline";
import { clipTimeToGameTime, gameTimeToClipTime, clipIndexForGameTime } from "@/lib/clip-layout";
import { usePersistedPlayhead, parsePersistedPlayhead } from "@/hooks/use-persisted-playhead";
import { useElementWidth } from "@/hooks/use-element-width";
import { useTimelineScrub } from "@/hooks/use-timeline-scrub";
import {
  findPlayDraftByKey,
  MIN_PLAY_DURATION,
  normalizeGamePlays,
  snapGameTime,
} from "@/lib/play-boundaries";
import {
  DEFAULT_PLAY_LOOKBACK_SECONDS,
  normalizePlayLookbackSeconds,
} from "@/lib/game-settings";
import { shouldShowTimelinePlayNumber } from "@/lib/timeline-labels";
import { playIdentityKey, sortPlays } from "@/lib/plays";
import {
  offenseTimelineTone,
  playListTeamButtonClass,
  playTimelineSegmentClass,
} from "@/lib/play-timeline-colors";
import type { PlayDraft, PlayGap, PlayRecord, VideoClipRecord } from "@/types";
import { Eye, EyeOff, Pause, Pencil, Play, RotateCcw, Scissors, StickyNote, Trash2 } from "lucide-react";
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
import { ClipPlayEditor } from "@/components/clip-play-editor";
import { PlayerLoopToggle } from "@/components/player-loop-toggle";
import { PlayerVideoOverlay } from "@/components/player-video-overlay";

type EditMode = "game" | "clip";

type PlayEditorProps = {
  mode: EditMode;
  clips: VideoClipRecord[];
  plays: PlayDraft[];
  homeTeam: string;
  awayTeam: string;
  gameId: string;
  playLookbackSeconds?: number;
  onChange: (plays: PlayDraft[]) => void;
  onRestoreGap: (gaps: PlayGap[]) => void;
};

function parseShowGaps(value: string | null): boolean {
  return value === "true" || value === "1";
}

function parseClipIndex(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export function PlayEditor({
  mode,
  clips,
  plays,
  homeTeam,
  awayTeam,
  gameId,
  playLookbackSeconds = DEFAULT_PLAY_LOOKBACK_SECONDS,
  onChange,
  onRestoreGap,
}: PlayEditorProps) {
  const lookbackSeconds = normalizePlayLookbackSeconds(playLookbackSeconds);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showGapsOnTimeline = parseShowGaps(searchParams.get("gaps"));
  const clipIndex = parseClipIndex(searchParams.get("clip"));

  const setClipIndex = useCallback(
    (index: number) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("view", "clip");
      next.set("clip", String(Math.max(0, index)));
      next.delete("mode");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setShowGapsOnTimeline = useCallback(
    (show: boolean) => {
      const next = new URLSearchParams(searchParams.toString());
      if (show) {
        next.set("gaps", "true");
      } else {
        next.delete("gaps");
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineWidth = useElementWidth(timelineRef);
  const playListRef = useRef<HTMLDivElement>(null);
  const playItemRefs = useRef(new Map<string, HTMLDivElement>());
  const seekingRef = useRef(false);
  const currentPlayIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const loadedClipIdRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const seekTokenRef = useRef(0);
  const gameTimeRef = useRef(0);
  const { persisted, persistPlayhead, flushPlayhead } = usePersistedPlayhead();

  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  isPlayingRef.current = isPlaying;
  const [loopPlay, setLoopPlay] = useState(false);
  const loopPlayRef = useRef(false);
  loopPlayRef.current = loopPlay;
  const selectedPlayIdRef = useRef<string | null>(null);
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  selectedPlayIdRef.current = selectedPlayId;
  const [notesEditorPlayId, setNotesEditorPlayId] = useState<string | null>(null);

  const playRecords: PlayRecord[] = useMemo(
    () =>
      plays.map((p) => ({
        ...p,
        id: p.id ?? `pending-${playIdentityKey(p)}`,
        gameId,
        offenseTeam: p.offenseTeam ?? null,
        notes: p.notes ?? null,
        createdAt: "",
        updatedAt: "",
      })),
    [plays, gameId],
  );

  const {
    segments,
    playSegments,
    gapSegments,
    fullDuration,
    playbackDuration,
  } = useMemo(
    () => buildTimelines(clips, playRecords),
    [clips, playRecords],
  );

  const sortedPlays = useMemo(() => sortPlays(plays), [plays]);

  const fullPosition = playbackToFullPosition(playbackTime, playSegments);
  const timelineDuration = showGapsOnTimeline ? fullDuration : playbackDuration;
  const timelinePosition = showGapsOnTimeline ? fullPosition : playbackTime;

  const seekToPlaybackTime = useCallback(
    (
      time: number,
      autoplay = false,
      preferredPlayKey: string | null = null,
    ): Promise<void> => {
      const video = videoRef.current;
      const segment =
        (preferredPlayKey
          ? playSegments.find(
              (row) => playIdentityKey(row.play) === preferredPlayKey,
            )
          : null) ??
        playSegments.find(
          (s) => time >= s.playbackStart && time < s.playbackEnd,
        );
      if (!video || !segment) return Promise.resolve();

      const clamped = Math.max(
        0,
        Math.min(time, playbackDuration > 0 ? playbackDuration - 0.001 : 0),
      );

      const gameTime = segmentGameTime(clamped, segment);
      const located = gameTimeToClipTime(gameTime, clips);
      if (!located) return Promise.resolve();

      const clip = located.clip;
      const localTime = located.localTime;
      const clipUrl = clip.blobUrl;
      const clipId = located.clipId;
      const previousClipId = resolveClipIdFromVideo(video, clips);
      const seekToken = ++seekTokenRef.current;

      seekingRef.current = true;
      setPlaybackTime(clamped);
      const playId = playIdentityKey(segment.play);
      setSelectedPlayId(playId);
      currentPlayIdRef.current = playId;

      gameTimeRef.current = gameTime;
      persistPlayhead(gameTime);

      return new Promise((resolve) => {
        let seekApplied = false;

        const resumePlayback = () => {
          if (!autoplay) return;

          const playVideo = () => {
            void video
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          };

          if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            playVideo();
          } else {
            video.addEventListener("canplay", playVideo, { once: true });
          }
        };

        const finish = () => {
          if (seekToken !== seekTokenRef.current) return;
          seekingRef.current = false;
          loadedClipIdRef.current = clipId;
          resumePlayback();
          resolve();
        };

        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          finish();
        };

        const applySeek = () => {
          if (seekToken !== seekTokenRef.current || seekApplied) return;
          seekApplied = true;

          if (Math.abs(video.currentTime - localTime) < 0.05) {
            finish();
            return;
          }
          video.addEventListener("seeked", onSeeked);
          video.currentTime = localTime;
        };

        const onMetadata = () => {
          video.removeEventListener("loadedmetadata", onMetadata);
          applySeek();
        };

        if (previousClipId !== clipId) {
          video.addEventListener("loadedmetadata", onMetadata);
          video.src = clipUrl;
          video.load();
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            onMetadata();
          }
        } else {
          applySeek();
        }
      });
    },
    [playSegments, playbackDuration, persistPlayhead, clips],
  );

  const seekToFullPosition = useCallback(
    (position: number) => {
      const segment = fullPositionToSegment(position, segments);
      if (!segment) return;

      if (isGapSegment(segment)) {
        onRestoreGap(gapToPlayGaps(segment));
        return;
      }

      const playback = fullPositionToPlaybackTime(
        position,
        segments,
        playSegments,
      );
      if (playback !== null) {
        void seekToPlaybackTime(playback);
      }
    },
    [segments, playSegments, onRestoreGap, seekToPlaybackTime],
  );

  const seekToPlay = useCallback(
    (playId: string) => {
      const segment = playSegments.find(
        (s) => playIdentityKey(s.play) === playId,
      );
      if (!segment) return;
      void seekToPlaybackTime(segment.playbackStart, true, playId);
    },
    [playSegments, seekToPlaybackTime],
  );

  const { playheadPercent, onTimelinePointerDown, onPlayheadPointerDown } =
    useTimelineScrub({
      timelineRef,
      fullDuration: timelineDuration,
      fullPosition: timelinePosition,
      onSeek: (position) => {
        if (showGapsOnTimeline) {
          gameTimeRef.current = position;
          seekToFullPosition(position);
        } else {
          void seekToPlaybackTime(position);
        }
      },
      onScrubStart: () => {
        const video = videoRef.current;
        wasPlayingRef.current = Boolean(video && !video.paused);
        video?.pause();
        setIsPlaying(false);
      },
      onScrubEnd: () => {
        if (wasPlayingRef.current) {
          void videoRef.current?.play().then(() => setIsPlaying(true));
        }
      },
    });

  useEffect(() => {
    if (playSegments.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    let targetPlayback = 0;
    if (persisted) {
      const restored = gameTimeToPlaybackTime(
        persisted.gameTime,
        playSegments,
      );
      if (restored !== null) targetPlayback = restored;
    }

    void seekToPlaybackTime(targetPlayback);
    // Only restore URL playhead on first load — not when segments/persisted update later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSegments.length, seekToPlaybackTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || playSegments.length === 0) return;

    const syncFromVideo = () => {
      if (seekingRef.current) return;
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;

      const local = video.currentTime;
      const clipId = resolveClipIdFromVideo(video, clips);
      if (!clipId) return;

      loadedClipIdRef.current = clipId;

      const gameTime = clipTimeToGameTime(clipId, local, clips);
      if (gameTime === null) return;

      const segment = resolvePlaybackSegment(
        gameTime,
        playSegments,
        selectedPlayIdRef.current,
      );
      if (!segment) return;

      if (gameTime >= segment.globalEnd - 0.08) {
        const shouldLoop =
          loopPlayRef.current &&
          selectedPlayIdRef.current !== null &&
          playIdentityKey(segment.play) === selectedPlayIdRef.current;

        if (shouldLoop) {
          void seekToPlaybackTime(segment.playbackStart, isPlayingRef.current);
          return;
        }

        const segIdx = playSegments.indexOf(segment);
        const next = playSegments[segIdx + 1];
        if (next) {
          void seekToPlaybackTime(next.playbackStart, isPlayingRef.current);
          return;
        }
        video.pause();
        setIsPlaying(false);
        setPlaybackTime(segment.playbackEnd);
        return;
      }

      const newPlayback =
        segment.playbackStart + (gameTime - segment.globalStart);
      setPlaybackTime(newPlayback);
      gameTimeRef.current = gameTime;
      persistPlayhead(gameTime);

      const playId = playIdentityKey(segment.play);
      if (playId !== currentPlayIdRef.current) {
        currentPlayIdRef.current = playId;
        setSelectedPlayId(playId);
      }
    };

    const onTimeUpdate = () => syncFromVideo();
    const onSeeked = () => syncFromVideo();

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeked", onSeeked);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [playSegments, clips, persistPlayhead, seekToPlaybackTime]);

  useEffect(() => {
    if (mode !== "game") return;
    return () => {
      flushPlayhead(gameTimeRef.current);
    };
  }, [flushPlayhead, mode]);

  useEffect(() => {
    if (mode !== "clip" || !persisted) return;
    const targetClipIndex = clipIndexForGameTime(persisted.gameTime, clips);
    if (targetClipIndex !== clipIndex) {
      setClipIndex(targetClipIndex);
    }
  }, [clipIndex, clips, mode, persisted, setClipIndex]);

  useEffect(() => {
    if (!selectedPlayId) return;
    const item = playItemRefs.current.get(selectedPlayId);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPlayId]);

  const updatePlays = (updated: PlayDraft[]) => {
    onChange(normalizeGamePlays(updated, clips));
  };

  const splitAtTime = (offsetSeconds = 0) => {
    const segment = findActiveSegmentAtGameTime(fullPosition, playSegments);
    if (!segment) return;

    const play = findPlayDraftByKey(
      plays,
      playIdentityKey(segment.play),
    );
    if (!play) return;

    const gameTime = snapGameTime(
      Math.max(
        play.startTime + MIN_PLAY_DURATION,
        Math.min(play.endTime - MIN_PLAY_DURATION, fullPosition + offsetSeconds),
      ),
    );

    if (
      gameTime <= play.startTime + MIN_PLAY_DURATION ||
      gameTime >= play.endTime - MIN_PLAY_DURATION
    ) {
      return;
    }

    const playKey = playIdentityKey(play);
    const newPlay: PlayDraft = {
      clientKey: crypto.randomUUID(),
      startTime: gameTime,
      endTime: play.endTime,
      offenseTeam: play.offenseTeam,
      notes: "",
    };

    const updated = plays.flatMap((p) =>
      playIdentityKey(p) === playKey
        ? [{ ...p, endTime: gameTime }, newPlay]
        : [p],
    );
    updatePlays(updated);
  };

  const splitAtCurrentTime = () => splitAtTime(0);
  const splitBeforePlayhead = () => splitAtTime(-lookbackSeconds);

  const removePlay = (play: PlayDraft) => {
    const targetKey = playIdentityKey(play);
    const updated = plays.filter((p) => playIdentityKey(p) !== targetKey);
    updatePlays(updated);
    setSelectedPlayId(null);
  };

  const updatePlayField = (
    play: PlayDraft,
    field: keyof PlayDraft,
    value: string | number,
  ) => {
    onChange(
      plays.map((p) =>
        playIdentityKey(p) === playIdentityKey(play)
          ? { ...p, [field]: value }
          : p,
      ),
    );
  };

  if (!clips.length) {
    return (
      <Card className="surface-card border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          Upload videos to start defining plays.
        </CardContent>
      </Card>
    );
  }

  if (mode === "clip") {
    return (
      <ClipPlayEditor
        clips={clips}
        plays={plays}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        clipIndex={clipIndex}
        playLookbackSeconds={lookbackSeconds}
        onClipIndexChange={setClipIndex}
        onChange={onChange}
        initialGameTime={persisted?.gameTime ?? null}
        onGameTimeChange={persistPlayhead}
      />
    );
  }

  if (playSegments.length === 0) {
    return (
      <Card className="surface-card border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          No plays yet. Restore a gap from the timeline, use per-clip mode, or
          upload footage.
        </CardContent>
      </Card>
    );
  }

  const currentSegment =
    playSegments.find((s) => playIdentityKey(s.play) === selectedPlayId) ??
    playSegments[0];
  const activeSegment =
    playSegments.find(
      (segment) =>
        playbackTime >= segment.playbackStart &&
        playbackTime < segment.playbackEnd,
    ) ?? currentSegment;
  const playPosition = activeSegment
    ? Math.max(
        0,
        Math.min(
          activeSegment.duration,
          playbackTime - activeSegment.playbackStart,
        ),
      )
    : 0;

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

  const timelineSegments = showGapsOnTimeline ? segments : playSegments;
  const playListSegments = showGapsOnTimeline ? segments : playSegments;

  const timelinePanel = (
    <div className="surface-card shrink-0 space-y-2 p-4 max-lg:landscape:py-3">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{formatDuration(playbackTime)}</span>
        <div className="flex items-center gap-2">
          {gapSegments.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-lg px-2 text-xs"
              onClick={() => setShowGapsOnTimeline(!showGapsOnTimeline)}
            >
              {showGapsOnTimeline ? (
                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Eye className="mr-1.5 h-3.5 w-3.5" />
              )}
              {showGapsOnTimeline ? "Hide gaps" : "Show gaps"}
            </Button>
          )}
          <span>
            {formatDuration(
              showGapsOnTimeline ? fullDuration : playbackDuration,
            )}{" "}
            total
          </span>
        </div>
      </div>
      <div
        ref={timelineRef}
        role="slider"
        aria-label="Stitched game timeline"
        tabIndex={0}
        className="relative h-10 max-lg:landscape:h-9 sm:h-11 cursor-pointer touch-none overflow-hidden rounded-xl border border-border/80 bg-muted/40 select-none"
        onPointerDown={onTimelinePointerDown}
      >
        {timelineSegments.map((segment) => {
          const useFullLayout = showGapsOnTimeline;
          const durationBase = useFullLayout
            ? fullDuration
            : playbackDuration;
          const segmentStart = useFullLayout
            ? segment.globalStart
            : isPlaySegment(segment)
              ? segment.playbackStart
              : 0;
          const left =
            durationBase > 0 ? (segmentStart / durationBase) * 100 : 0;
          const width =
            durationBase > 0 ? (segment.duration / durationBase) * 100 : 0;

          if (isGapSegment(segment)) {
            return (
              <button
                key={`gap-${segment.globalStart}-${segment.globalEnd}`}
                type="button"
                title="Restore deleted play"
                className="absolute top-0 flex h-full items-center justify-center border-r border-white/40 bg-muted-foreground/30 text-muted-foreground transition-colors hover:bg-accent/40"
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRestoreGap(gapToPlayGaps(segment));
                }}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            );
          }

          const playId = playIdentityKey(segment.play);
          const isSelected = playId === selectedPlayId;
          const offenseTone = offenseTimelineTone(
            segment.play.offenseTeam,
            homeTeam,
            awayTeam,
          );

          return (
            <button
              key={playIdentityKey(segment.play)}
              type="button"
              title={
                segment.play.offenseTeam
                  ? `Play ${segment.playNumber} · ${segment.play.offenseTeam}`
                  : `Play ${segment.playNumber}`
              }
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
                segment.playNumber,
                isSelected,
              ) ? (
                <span className="tabular-nums">{segment.playNumber}</span>
              ) : null}
            </button>
          );
        })}
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
        Drag the timeline or playhead to scrub — click a play to jump
        {showGapsOnTimeline && gapSegments.length > 0
          ? ", gray segments can be restored"
          : ""}
      </p>
    </div>
  );

  return (
    <PlayerStage>
      {timelinePanel}

      <div className={playerMainGridClass}>
      <div className={playerVideoColumnClass}>
        <div className={playerVideoShellClass}>
          <div className={playerVideoFrameClass}>
            <video
              ref={videoRef}
              className={playerVideoClass}
              playsInline
              preload="auto"
              controls={false}
              onClick={() => void togglePlay()}
            />
            <PlayerLoopToggle
              enabled={loopPlay}
              onChange={setLoopPlay}
              className="absolute top-3 right-3 z-10 max-lg:landscape:top-2 max-lg:landscape:right-2"
            />
            <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-4rem)] flex-wrap items-center gap-2 max-lg:landscape:top-2 max-lg:landscape:left-2">
              <Button
                variant="outline"
                className="rounded-xl border-white/25 bg-black/50 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white max-lg:landscape:h-9 max-lg:landscape:px-3 max-lg:landscape:text-sm"
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
                className="rounded-xl bg-primary/90 text-primary-foreground backdrop-blur-sm hover:bg-primary max-lg:landscape:h-9 max-lg:landscape:px-3 max-lg:landscape:text-sm"
                onClick={splitAtCurrentTime}
                title="Split at playhead"
              >
                <Scissors className="mr-2 h-4 w-4 max-lg:landscape:mr-1.5 max-lg:landscape:h-3.5 max-lg:landscape:w-3.5" />
                <span className="max-lg:landscape:hidden">Split at playhead</span>
                <span className="hidden max-lg:landscape:inline">Split</span>
              </Button>
              {lookbackSeconds > 0 ? (
                <Button
                  variant="outline"
                  className="rounded-xl border-white/25 bg-black/50 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white max-lg:landscape:h-9 max-lg:landscape:px-3 max-lg:landscape:text-sm"
                  onClick={splitBeforePlayhead}
                  title={`Split ${lookbackSeconds} seconds before playhead`}
                >
                  <Scissors className="mr-2 h-4 w-4 max-lg:landscape:mr-1.5 max-lg:landscape:h-3.5 max-lg:landscape:w-3.5" />
                  <span className="max-lg:landscape:hidden">
                    Split -{lookbackSeconds}s
                  </span>
                  <span className="hidden max-lg:landscape:inline">
                    -{lookbackSeconds}s
                  </span>
                </Button>
              ) : null}
            </div>
            <PlayerVideoOverlay
              playNumber={activeSegment?.playNumber ?? 1}
              playPosition={playPosition}
              playDuration={activeSegment?.duration ?? 0}
              gamePosition={playbackTime}
              gameDuration={playbackDuration}
            />
          </div>
        </div>
      </div>

      <Card className={playerPlayListCardClass}>
        <CardHeader className="shrink-0 border-b border-border/60 py-3 max-lg:landscape:py-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-heading text-sm">All plays</CardTitle>
            {gapSegments.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-lg px-2 text-xs"
                onClick={() => setShowGapsOnTimeline(!showGapsOnTimeline)}
              >
                {showGapsOnTimeline ? (
                  <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                )}
                {showGapsOnTimeline ? "Hide gaps" : "Show gaps"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent
          ref={playListRef}
          className={cn(playerPlayListContentClass, "space-y-2 p-3 max-lg:landscape:p-2")}
        >
          {playSegments.length === 0 && gapSegments.length === 0 && (
            <p className="text-sm text-muted-foreground">No plays yet.</p>
          )}
          {playListSegments.map((segment) => {
            if (isGapSegment(segment)) {
              return (
                <button
                  key={`gap-${segment.globalStart}-${segment.globalEnd}`}
                  type="button"
                  title="Restore deleted play"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-muted-foreground/35 bg-muted/50 px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-foreground"
                  onClick={() => onRestoreGap(gapToPlayGaps(segment))}
                >
                  <span className="font-medium uppercase tracking-wide">Gap</span>
                  <span className="tabular-nums">
                    {formatDuration(segment.duration)}
                  </span>
                </button>
              );
            }

            const play = segment.play;
            const playId = playIdentityKey(play);
            const playNumber = segment.playNumber;
            const duration = segment.duration;
            const hasNotes = Boolean(play.notes?.trim());
            const notesOpen = notesEditorPlayId === playId;

            return (
              <div
                key={playId}
                ref={(node) => {
                  if (node) playItemRefs.current.set(playId, node);
                  else playItemRefs.current.delete(playId);
                }}
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
                    {playNumber ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
                    {formatDuration(duration)}
                  </span>
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
                {hasNotes && !notesOpen && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {play.notes}
                  </p>
                )}
                {notesOpen && (
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
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      </div>
    </PlayerStage>
  );
}
