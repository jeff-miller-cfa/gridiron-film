"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatDuration } from "@/lib/video";
import {
  buildTimelines,
  clipTimeToPlaybackTime,
  fullPositionToPlaybackTime,
  fullPositionToSegment,
  playbackToFullPosition,
  playIndexToPlaybackTime,
  playbackTimeToClipTime,
  segmentLocalTime,
} from "@/lib/player-timeline";
import { usePersistedPlayhead } from "@/hooks/use-persisted-playhead";
import type { PlayWithClip } from "@/types";
import { List, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

type GamePlayerProps = {
  plays: PlayWithClip[];
  homeTeam: string;
  awayTeam: string;
  allowRecover?: boolean;
  onRecoverPlay?: (playId: string) => void;
};

export function GamePlayer({
  plays,
  homeTeam,
  awayTeam,
  allowRecover = false,
  onRecoverPlay,
}: GamePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const seekingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const currentIndexRef = useRef(0);
  const initializedRef = useRef(false);
  const { persisted, persistPlayhead } = usePersistedPlayhead();

  const { segments, fullDuration, playbackDuration, activeSegments } = useMemo(
    () => buildTimelines(plays),
    [plays],
  );

  const [playbackTime, setPlaybackTime] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadedClipUrl, setLoadedClipUrl] = useState<string | null>(null);

  const fullPosition = playbackToFullPosition(playbackTime, segments);
  const currentSegment =
    activeSegments.find((s) => s.playIndex === currentIndex) ??
    activeSegments[0];
  const currentPlay = currentSegment?.play;

  isPlayingRef.current = isPlaying;

  const seekToPlaybackTime = useCallback(
    (time: number, autoplay = false): Promise<void> => {
      const video = videoRef.current;
      const segment = activeSegments.find(
        (s) =>
          s.playbackStart !== null &&
          time >= s.playbackStart &&
          time < s.playbackEnd!,
      );
      if (!video || !segment?.play.videoClip) return Promise.resolve();

      const clamped = Math.max(
        0,
        Math.min(time, playbackDuration > 0 ? playbackDuration - 0.001 : 0),
      );
      const localTime = segmentLocalTime(clamped, segment);
      const clipUrl = segment.play.videoClip.blobUrl;

      seekingRef.current = true;
      setPlaybackTime(clamped);
      setCurrentIndex(segment.playIndex);
      currentIndexRef.current = segment.playIndex;

      const clipTime = playbackTimeToClipTime(clamped, segments);
      if (clipTime) persistPlayhead(clipTime.clipId, clipTime.time);

      return new Promise((resolve) => {
        const finish = () => {
          seekingRef.current = false;
          if (autoplay) {
            void video.play().then(() => setIsPlaying(true));
          }
          resolve();
        };

        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          finish();
        };

        if (loadedClipUrl !== clipUrl) {
          video.src = clipUrl;
          video.load();
          setLoadedClipUrl(clipUrl);
          video.addEventListener(
            "loadedmetadata",
            () => {
              video.currentTime = localTime;
            },
            { once: true },
          );
          video.addEventListener("seeked", onSeeked);
        } else {
          video.currentTime = localTime;
          video.addEventListener("seeked", onSeeked);
        }

        setTimeout(() => {
          if (seekingRef.current) finish();
        }, 2000);
      });
    },
    [activeSegments, playbackDuration, loadedClipUrl, segments, persistPlayhead],
  );

  const seekToPlay = useCallback(
    (playIndex: number, autoplay = true) => {
      const playback = playIndexToPlaybackTime(playIndex, segments);
      if (playback === null) return;
      void seekToPlaybackTime(playback, autoplay);
    },
    [segments, seekToPlaybackTime],
  );

  const seekToFullPosition = useCallback(
    (position: number, autoplay = false) => {
      const segment = fullPositionToSegment(position, segments);
      if (!segment) return;

      if (segment.deleted && allowRecover && onRecoverPlay && segment.play.id) {
        onRecoverPlay(segment.play.id);
        return;
      }

      if (segment.deleted) return;

      const playback = fullPositionToPlaybackTime(position, segments);
      if (playback !== null) {
        void seekToPlaybackTime(playback, autoplay);
      }
    },
    [segments, allowRecover, onRecoverPlay, seekToPlaybackTime],
  );

  useEffect(() => {
    if (activeSegments.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    let targetPlayback = 0;
    if (persisted) {
      const restored = clipTimeToPlaybackTime(
        persisted.clipId,
        persisted.time,
        segments,
      );
      if (restored !== null) targetPlayback = restored;
    }

    void seekToPlaybackTime(targetPlayback, false);
  }, [activeSegments.length, persisted, segments, seekToPlaybackTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeSegments.length === 0) return;

    const onTimeUpdate = () => {
      if (seekingRef.current) return;

      const local = video.currentTime;
      const clipUrl = loadedClipUrl ?? video.currentSrc;

      let segment = activeSegments.find(
        (s) =>
          s.play.videoClip?.blobUrl === clipUrl &&
          local >= s.play.startTime - 0.05 &&
          local < s.play.endTime,
      );

      if (!segment) {
        segment = activeSegments.find(
          (s) => s.playIndex === currentIndexRef.current,
        );
      }
      if (!segment || segment.playbackStart === null) return;

      if (local >= segment.play.endTime - 0.08) {
        const segIdx = activeSegments.indexOf(segment);
        const next = activeSegments[segIdx + 1];
        if (next) {
          void seekToPlaybackTime(next.playbackStart!, isPlayingRef.current);
        } else {
          video.pause();
          setIsPlaying(false);
          setPlaybackTime(segment.playbackEnd!);
        }
        return;
      }

      const newPlayback =
        segment.playbackStart + (local - segment.play.startTime);
      setPlaybackTime(newPlayback);
      persistPlayhead(segment.play.videoClipId, local);
      if (segment.playIndex !== currentIndexRef.current) {
        currentIndexRef.current = segment.playIndex;
        setCurrentIndex(segment.playIndex);
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [activeSegments, seekToPlaybackTime, loadedClipUrl, persistPlayhead]);

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

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = timelineRef.current;
    if (!el || fullDuration <= 0) return;

    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToFullPosition(ratio * fullDuration, isPlaying);
  };

  const activePlays = plays.filter((p) => !p.deletedAt);

  const playList = (
    <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto md:max-h-[calc(100vh-280px)]">
      {activePlays.map((play) => {
        const segment = segments.find((s) => s.play.id === play.id);
        if (!segment) return null;
        const index = segment.playIndex;

        return (
          <button
            key={play.id}
            type="button"
            onClick={() => seekToPlay(index, true)}
            className={cn(
              "rounded-xl border p-3.5 text-left transition-all",
              index === currentIndex
                ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                : "border-border/80 bg-card hover:border-primary/20 hover:bg-muted/50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">
                Play {play.playNumber}
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {formatDuration(segment.duration)}
              </span>
            </div>
            {play.offenseTeam && (
              <p className="mt-1.5 text-xs font-medium text-accent">
                Offense: {play.offenseTeam}
              </p>
            )}
            {play.notes && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {play.notes}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );

  if (!currentPlay?.videoClip || activeSegments.length === 0) {
    return (
      <Card className="surface-card">
        <CardContent className="py-16 text-center text-muted-foreground">
          No plays have been processed for this game yet.
        </CardContent>
      </Card>
    );
  }

  const playheadPercent =
    fullDuration > 0 ? (fullPosition / fullDuration) * 100 : 0;

  const deletedCount = segments.filter((s) => s.deleted).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="surface-elevated overflow-hidden p-1">
          <div className="relative overflow-hidden rounded-xl bg-slate-900">
            <video
              ref={videoRef}
              className="aspect-video w-full"
              playsInline
              preload="auto"
              controls={false}
              onClick={togglePlay}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-primary/95 via-primary/70 to-transparent px-5 py-4">
              <div className="flex items-center justify-between gap-2 text-sm text-white">
                <span className="font-heading text-lg font-bold">
                  Play {currentPlay.playNumber}
                </span>
                {currentPlay.offenseTeam && (
                  <Badge className="border-0 bg-white/20 text-white backdrop-blur-sm">
                    {currentPlay.offenseTeam}
                  </Badge>
                )}
              </div>
              {currentPlay.notes && (
                <p className="mt-1 text-sm text-white/85">{currentPlay.notes}</p>
              )}
            </div>
          </div>
        </div>

        <div className="surface-card space-y-2 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{formatDuration(playbackTime)}</span>
            <span>{formatDuration(playbackDuration)}</span>
          </div>
          <div
            ref={timelineRef}
            role="slider"
            aria-label="Game timeline"
            aria-valuemin={0}
            aria-valuemax={fullDuration}
            aria-valuenow={fullPosition}
            tabIndex={0}
            className="relative h-12 cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-muted/40"
            onClick={handleTimelineClick}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                void seekToPlaybackTime(
                  Math.min(playbackTime + 5, playbackDuration),
                  isPlaying,
                );
              }
              if (e.key === "ArrowLeft") {
                void seekToPlaybackTime(Math.max(playbackTime - 5, 0), isPlaying);
              }
            }}
          >
            {segments.map((segment) => {
              const left = (segment.globalStart / fullDuration) * 100;
              const width = (segment.duration / fullDuration) * 100;
              const isActive =
                !segment.deleted && segment.playIndex === currentIndex;

              return (
                <button
                  key={segment.play.id}
                  type="button"
                  title={
                    segment.deleted
                      ? `Play ${segment.play.playNumber} (removed — click to restore)`
                      : `Play ${segment.play.playNumber}`
                  }
                  className={cn(
                    "absolute top-0 flex h-full items-center justify-center border-r border-white/40 text-[10px] font-bold transition-colors sm:text-xs",
                    segment.deleted
                      ? "bg-muted-foreground/30 text-muted-foreground line-through hover:bg-accent/30 hover:text-accent"
                      : isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/50 text-white hover:bg-primary/70",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (segment.deleted && allowRecover && onRecoverPlay) {
                      onRecoverPlay(segment.play.id);
                    } else if (!segment.deleted) {
                      seekToPlay(segment.playIndex, true);
                    }
                  }}
                >
                  {segment.deleted ? (
                    <RotateCcw className="h-3 w-3" />
                  ) : width > 4 ? (
                    segment.play.playNumber
                  ) : (
                    ""
                  )}
                </button>
              );
            })}
            <div
              className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-accent shadow-[0_0_6px_rgba(0,0,0,0.35)]"
              style={{ left: `${playheadPercent}%` }}
            />
            <div
              className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-accent shadow-md"
              style={{ left: `${playheadPercent}%` }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {allowRecover && deletedCount > 0
              ? "Gray segments are removed plays — click to restore"
              : "Tap a play segment or scrub anywhere on the timeline"}
          </p>
        </div>

        <div className="surface-card flex items-center justify-between gap-3 p-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              disabled={
                activeSegments.findIndex(
                  (s) => s.playIndex === currentIndex,
                ) <= 0
              }
              onClick={() => {
                const idx = activeSegments.findIndex(
                  (s) => s.playIndex === currentIndex,
                );
                if (idx > 0) seekToPlay(activeSegments[idx - 1].playIndex, true);
              }}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              className="min-w-[120px] rounded-xl bg-primary shadow-sm"
              onClick={togglePlay}
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
              size="icon"
              className="rounded-xl"
              disabled={
                activeSegments.findIndex(
                  (s) => s.playIndex === currentIndex,
                ) >=
                activeSegments.length - 1
              }
              onClick={() => {
                const idx = activeSegments.findIndex(
                  (s) => s.playIndex === currentIndex,
                );
                if (idx < activeSegments.length - 1) {
                  seekToPlay(activeSegments[idx + 1].playIndex, true);
                }
              }}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {activeSegments.findIndex((s) => s.playIndex === currentIndex) + 1}{" "}
            of {activeSegments.length}
          </p>
        </div>

        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger
              className={buttonVariants({
                variant: "outline",
                className: "h-11 w-full rounded-xl border-primary/20",
              })}
            >
              <List className="mr-2 h-4 w-4" />
              All plays ({activePlays.length})
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl">
              <SheetHeader>
                <SheetTitle className="font-heading">
                  {awayTeam} @ {homeTeam}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4">{playList}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card className="hidden surface-card lg:block">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="font-heading text-lg">Play list</CardTitle>
        </CardHeader>
        <CardContent className="p-4">{playList}</CardContent>
      </Card>
    </div>
  );
}
