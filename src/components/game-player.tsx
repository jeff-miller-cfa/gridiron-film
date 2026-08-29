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
  findActiveSegmentAtClipTime,
  fullPositionToPlaybackTime,
  isGapSegment,
  isPlaySegment,
  localClipTimeToPlaybackTime,
  playbackToFullPosition,
  playIndexToPlaybackTime,
  playbackTimeToClipTime,
  resolveClipIdFromVideo,
  segmentLocalTime,
} from "@/lib/player-timeline";
import { usePersistedPlayhead } from "@/hooks/use-persisted-playhead";
import { useTimelineScrub } from "@/hooks/use-timeline-scrub";
import {
  offenseTimelineTone,
  playTimelineSegmentClass,
} from "@/lib/play-timeline-colors";
import type { PlayWithClip, VideoClipRecord } from "@/types";
import { List, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

type GamePlayerProps = {
  plays: PlayWithClip[];
  homeTeam: string;
  awayTeam: string;
  clips?: VideoClipRecord[];
};

function deriveClipsFromPlays(plays: PlayWithClip[]): VideoClipRecord[] {
  const seen = new Set<string>();
  const clips: VideoClipRecord[] = [];

  for (const play of plays) {
    if (play.videoClip && !seen.has(play.videoClip.id)) {
      seen.add(play.videoClip.id);
      clips.push(play.videoClip);
    }
  }

  return clips.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function GamePlayer({
  plays,
  homeTeam,
  awayTeam,
  clips: clipsProp,
}: GamePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const seekingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const currentIndexRef = useRef(0);
  const initializedRef = useRef(false);
  const loadedClipIdRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(false);
  const seekTokenRef = useRef(0);
  const { persisted, persistPlayhead } = usePersistedPlayhead();

  const clips = useMemo(
    () => clipsProp ?? deriveClipsFromPlays(plays),
    [clipsProp, plays],
  );

  const clipSources = useMemo(
    () => clips.map((clip) => ({ id: clip.id, blobUrl: clip.blobUrl })),
    [clips],
  );

  const { segments, fullDuration, playbackDuration, playSegments } = useMemo(
    () => buildTimelines(clips, plays),
    [clips, plays],
  );

  const [playbackTime, setPlaybackTime] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const fullPosition = playbackToFullPosition(playbackTime, playSegments);
  const currentSegment =
    playSegments.find((s) => s.playIndex === currentIndex) ?? playSegments[0];
  const currentPlay = currentSegment?.play;

  isPlayingRef.current = isPlaying;

  const seekToPlaybackTime = useCallback(
    (time: number, autoplay = false): Promise<void> => {
      const video = videoRef.current;
      const segment = playSegments.find(
        (s) => time >= s.playbackStart && time < s.playbackEnd,
      );
      if (!video || !segment?.play.videoClip) return Promise.resolve();

      const clamped = Math.max(
        0,
        Math.min(time, playbackDuration > 0 ? playbackDuration - 0.001 : 0),
      );
      const localTime = segmentLocalTime(clamped, segment);
      const clipUrl = segment.play.videoClip.blobUrl;
      const clipId = segment.play.videoClipId;
      const previousClipId = loadedClipIdRef.current;
      const seekToken = ++seekTokenRef.current;

      seekingRef.current = true;
      setPlaybackTime(clamped);
      setCurrentIndex(segment.playIndex);
      currentIndexRef.current = segment.playIndex;
      loadedClipIdRef.current = clipId;

      const clipTime = playbackTimeToClipTime(clamped, playSegments);
      if (clipTime) persistPlayhead(clipTime.clipId, clipTime.time);

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
    [playSegments, playbackDuration, persistPlayhead],
  );

  const seekToPlay = useCallback(
    (playIndex: number, autoplay = true) => {
      const playback = playIndexToPlaybackTime(playIndex, playSegments);
      if (playback === null) return;
      void seekToPlaybackTime(playback, autoplay);
    },
    [playSegments, seekToPlaybackTime],
  );

  const seekToFullPosition = useCallback(
    (position: number, autoplay = false) => {
      const playback = fullPositionToPlaybackTime(
        position,
        segments,
        playSegments,
      );
      if (playback !== null) {
        void seekToPlaybackTime(playback, autoplay);
      }
    },
    [segments, playSegments, seekToPlaybackTime],
  );

  useEffect(() => {
    if (playSegments.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    let targetPlayback = 0;
    if (persisted) {
      const restored = clipTimeToPlaybackTime(
        persisted.clipId,
        persisted.time,
        playSegments,
      );
      if (restored !== null) targetPlayback = restored;
    }

    void seekToPlaybackTime(targetPlayback, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSegments.length, seekToPlaybackTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || playSegments.length === 0) return;

    const syncFromVideo = () => {
      if (seekingRef.current) return;
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;

      const local = video.currentTime;
      const clipId =
        loadedClipIdRef.current ?? resolveClipIdFromVideo(video, clipSources);
      if (!clipId) return;

      loadedClipIdRef.current = clipId;

      let segment = findActiveSegmentAtClipTime(
        clipId,
        local,
        playSegments,
      );

      if (!segment) {
        const playback = localClipTimeToPlaybackTime(
          clipId,
          local,
          playSegments,
        );
        if (playback === null) return;
        segment =
          playSegments.find(
            (s) => playback >= s.playbackStart && playback < s.playbackEnd,
          ) ?? null;
      }

      if (!segment) return;

      if (local >= segment.play.endTime - 0.08) {
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
        segment.playbackStart + (local - segment.play.startTime);
      setPlaybackTime(newPlayback);
      persistPlayhead(clipId, local);
      if (segment.playIndex !== currentIndexRef.current) {
        currentIndexRef.current = segment.playIndex;
        setCurrentIndex(segment.playIndex);
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
  }, [playSegments, clipSources, persistPlayhead, seekToPlaybackTime]);

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

  const { playheadPercent, onTimelinePointerDown, onPlayheadPointerDown } =
    useTimelineScrub({
      timelineRef,
      fullDuration,
      fullPosition,
      onSeek: (position) => {
        void seekToFullPosition(position, isPlaying);
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

  const playList = (
    <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto md:max-h-[calc(100vh-280px)]">
      {playSegments.map((segment) => {
        const index = segment.playIndex;
        const play = segment.play;

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
                Play {segment.playNumber}
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

  if (!currentPlay?.videoClip || playSegments.length === 0) {
    return (
      <Card className="surface-card">
        <CardContent className="py-16 text-center text-muted-foreground">
          No plays have been processed for this game yet.
        </CardContent>
      </Card>
    );
  }

  const currentPlayNumber =
    currentSegment?.playNumber ?? currentIndex + 1;

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
                  Play {currentPlayNumber}
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
            className="relative h-12 cursor-pointer touch-none overflow-hidden rounded-xl border border-border/80 bg-muted/40 select-none"
            onPointerDown={onTimelinePointerDown}
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

              if (isGapSegment(segment)) {
                return (
                  <div
                    key={`gap-${segment.globalStart}-${segment.globalEnd}`}
                    className="absolute top-0 h-full border-r border-white/20 bg-muted-foreground/20"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              }

              if (!isPlaySegment(segment)) return null;

              const isActive = segment.playIndex === currentIndex;
              const offenseTone = offenseTimelineTone(
                segment.play.offenseTeam,
                homeTeam,
                awayTeam,
              );

              return (
                <button
                  key={segment.play.id}
                  type="button"
                  title={
                    segment.play.offenseTeam
                      ? `Play ${segment.playNumber} · ${segment.play.offenseTeam}`
                      : `Play ${segment.playNumber}`
                  }
                  className={playTimelineSegmentClass(offenseTone, isActive)}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekToPlay(segment.playIndex, true);
                  }}
                >
                  {width > 4 ? segment.playNumber : ""}
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
          <p className="text-center text-xs text-muted-foreground">
            Drag the timeline or playhead to scrub
          </p>
        </div>

        <div className="surface-card flex items-center justify-between gap-3 p-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              disabled={
                playSegments.findIndex((s) => s.playIndex === currentIndex) <= 0
              }
              onClick={() => {
                const idx = playSegments.findIndex(
                  (s) => s.playIndex === currentIndex,
                );
                if (idx > 0) seekToPlay(playSegments[idx - 1].playIndex, true);
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
                playSegments.findIndex((s) => s.playIndex === currentIndex) >=
                playSegments.length - 1
              }
              onClick={() => {
                const idx = playSegments.findIndex(
                  (s) => s.playIndex === currentIndex,
                );
                if (idx < playSegments.length - 1) {
                  seekToPlay(playSegments[idx + 1].playIndex, true);
                }
              }}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {playSegments.findIndex((s) => s.playIndex === currentIndex) + 1}{" "}
            of {playSegments.length}
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
              All plays ({playSegments.length})
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
