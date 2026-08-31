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
import { playIdentityKey } from "@/lib/plays";
import {
  buildTimelines,
  findActiveSegmentAtGameTime,
  resolvePlaybackSegment,
  gameTimeToPlaybackTime,
  playIndexToPlaybackTime,
  resolveClipIdFromVideo,
  segmentGameTime,
} from "@/lib/player-timeline";
import { clipTimeToGameTime, gameTimeToClipTime } from "@/lib/clip-layout";
import { usePersistedPlayhead } from "@/hooks/use-persisted-playhead";
import { useElementWidth } from "@/hooks/use-element-width";
import { useTimelineScrub } from "@/hooks/use-timeline-scrub";
import { shouldShowTimelinePlayNumber } from "@/lib/timeline-labels";
import {
  offenseTeamBadgeClass,
  offenseTimelineTone,
  playTimelineSegmentClass,
} from "@/lib/play-timeline-colors";
import { ClipCacheButton } from "@/components/clip-cache-button";
import { useClipCache } from "@/hooks/use-clip-cache";
import type { PlayRecord, VideoClipRecord } from "@/types";
import {
  HardDrive,
  List,
  Pause,
  Play,
  SkipBack,
  SkipForward,
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
import { PlayerLoopToggle } from "@/components/player-loop-toggle";
import { PlayerVideoOverlay } from "@/components/player-video-overlay";
import { FullscreenButton } from "@/components/fullscreen-button";
import { useFullscreen } from "@/hooks/use-fullscreen";

type GamePlayerProps = {
  plays: PlayRecord[];
  homeTeam: string;
  awayTeam: string;
  clips: VideoClipRecord[];
  viewerAudioMuted?: boolean;
};

export function GamePlayer({
  plays,
  homeTeam,
  awayTeam,
  clips,
  viewerAudioMuted = false,
}: GamePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoFrameRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineWidth = useElementWidth(timelineRef);
  const seekingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const currentIndexRef = useRef(0);
  const initializedRef = useRef(false);
  const loadedClipIdRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(false);
  const seekTokenRef = useRef(0);
  const { persisted, persistPlayhead } = usePersistedPlayhead();

  const clipSources = useMemo(
    () => clips.map((clip) => ({ id: clip.id, blobUrl: clip.blobUrl })),
    [clips],
  );

  const { playbackDuration, playSegments } = useMemo(
    () => buildTimelines(clips, plays),
    [clips, plays],
  );

  const {
    supported: cacheSupported,
    cachedCount,
    loadingAll: cachingAll,
    loadAllProgress,
    allCached,
    warmClip,
    resolvePlaybackUrl,
    cacheAll,
    isPlayCached,
  } = useClipCache(clips);

  const [playbackTime, setPlaybackTime] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopPlay, setLoopPlay] = useState(false);
  const loopPlayRef = useRef(false);
  loopPlayRef.current = loopPlay;

  const {
    isFullscreen,
    isPseudoFullscreen,
    toggle: toggleFullscreen,
  } = useFullscreen(videoFrameRef);

  const currentSegment =
    playSegments.find((s) => s.playIndex === currentIndex) ?? playSegments[0];
  const currentPlay = currentSegment?.play;

  isPlayingRef.current = isPlaying;

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
      const clipId = located.clipId;
      // Cached clips play from a blob: object URL that won't match clip.blobUrl,
      // so trust the clip we last loaded and fall back to URL matching.
      const previousClipId =
        loadedClipIdRef.current ?? resolveClipIdFromVideo(video, clipSources);
      const seekToken = ++seekTokenRef.current;

      seekingRef.current = true;
      setPlaybackTime(clamped);
      setCurrentIndex(segment.playIndex);
      currentIndexRef.current = segment.playIndex;

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

        void (async () => {
          void warmClip(clip);
          const playbackUrl = await resolvePlaybackUrl(clip);
          if (seekToken !== seekTokenRef.current) return;

          if (previousClipId !== clipId) {
            video.addEventListener("loadedmetadata", onMetadata);
            video.src = playbackUrl;
            video.load();
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
              onMetadata();
            }
          } else {
            applySeek();
          }
        })();
      });
    },
    [
      playSegments,
      playbackDuration,
      persistPlayhead,
      clips,
      clipSources,
      warmClip,
      resolvePlaybackUrl,
    ],
  );

  const seekToPlay = useCallback(
    (playIndex: number, autoplay = true) => {
      const segment = playSegments.find((s) => s.playIndex === playIndex);
      const playback = segment?.playbackStart ?? playIndexToPlaybackTime(playIndex, playSegments);
      if (playback === null) return;
      void seekToPlaybackTime(
        playback,
        autoplay,
        segment ? playIdentityKey(segment.play) : null,
      );
    },
    [playSegments, seekToPlaybackTime],
  );

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
      // Cached clips play from a blob: object URL that won't match clip.blobUrl;
      // fall back to the clip we last loaded so progress keeps tracking.
      const clipId =
        resolveClipIdFromVideo(video, clipSources) ?? loadedClipIdRef.current;
      if (!clipId) return;

      loadedClipIdRef.current = clipId;

      const gameTime = clipTimeToGameTime(clipId, local, clips);
      if (gameTime === null) return;

      const preferredSegment = playSegments.find(
        (row) => row.playIndex === currentIndexRef.current,
      );
      const segment = resolvePlaybackSegment(
        gameTime,
        playSegments,
        preferredSegment ? playIdentityKey(preferredSegment.play) : null,
      );
      if (!segment) return;

      if (gameTime >= segment.globalEnd - 0.08) {
        if (loopPlayRef.current) {
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
      persistPlayhead(gameTime);
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
      fullDuration: playbackDuration,
      fullPosition: playbackTime,
      onSeek: (position) => {
        void seekToPlaybackTime(position, isPlaying);
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

  const cacheButton = (
    <ClipCacheButton
      supported={cacheSupported}
      cachingAll={cachingAll}
      loadAllProgress={loadAllProgress}
      allCached={allCached}
      cachedCount={cachedCount}
      clipCount={clips.length}
      onCacheAll={cacheAll}
    />
  );

  const renderPlayList = (constrained = false) => (
    <div
      className={cn(
        "flex flex-col gap-2",
        constrained &&
          "max-h-[50vh] overflow-y-auto md:max-h-[calc(100vh-280px)]",
      )}
    >
      {playSegments.map((segment) => {
        const index = segment.playIndex;
        const play = segment.play;

        return (
          <button
            key={play.id}
            type="button"
            onClick={() => seekToPlay(index, true)}
            className={cn(
              "rounded-xl border p-3.5 text-left transition-all max-lg:landscape:p-2.5",
              index === currentIndex
                ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                : "border-border/80 bg-card hover:border-primary/20 hover:bg-muted/50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-semibold text-foreground max-lg:landscape:text-sm">
                  Play {segment.playNumber}
                </span>
                {play.offenseTeam ? (
                  <span
                    className={offenseTeamBadgeClass(
                      play.offenseTeam,
                      homeTeam,
                      awayTeam,
                    )}
                  >
                    {play.offenseTeam}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {cacheSupported &&
                isPlayCached(segment.globalStart, segment.globalEnd) ? (
                  <HardDrive
                    className="h-3.5 w-3.5 text-accent"
                    aria-label="Cached for offline playback"
                  />
                ) : null}
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {formatDuration(segment.duration)}
                </span>
              </div>
            </div>
            {play.notes && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground max-lg:landscape:line-clamp-1">
                {play.notes}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );

  if (playSegments.length === 0 || clips.length === 0) {
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
  const playPosition = currentSegment
    ? Math.max(
        0,
        Math.min(
          currentSegment.duration,
          playbackTime - currentSegment.playbackStart,
        ),
      )
    : 0;

  const timelinePanel = (
    <div className="surface-card shrink-0 space-y-2 p-4 max-lg:landscape:space-y-1 max-lg:landscape:p-2">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{formatDuration(playbackTime)}</span>
        <span>{formatDuration(playbackDuration)}</span>
      </div>
      <div
        ref={timelineRef}
        role="slider"
        aria-label="Game timeline"
        aria-valuemin={0}
        aria-valuemax={playbackDuration}
        aria-valuenow={playbackTime}
        tabIndex={0}
        className="relative h-10 max-lg:landscape:h-9 sm:h-11 cursor-pointer touch-none overflow-hidden rounded-xl border border-border/80 bg-muted/40 select-none"
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
        {playSegments.map((segment) => {
          const left =
            playbackDuration > 0
              ? (segment.playbackStart / playbackDuration) * 100
              : 0;
          const width =
            playbackDuration > 0
              ? (segment.duration / playbackDuration) * 100
              : 0;

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
              {shouldShowTimelinePlayNumber(
                width,
                timelineWidth,
                segment.playNumber,
                isActive,
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
        Drag the timeline or playhead to scrub
      </p>
    </div>
  );

  return (
    <PlayerStage>
      {timelinePanel}

      <div className={playerMainGridClass}>
      <div className={playerVideoColumnClass}>
        <div className={playerVideoShellClass}>
          <div
            ref={videoFrameRef}
            className={cn(
              playerVideoFrameClass,
              isPseudoFullscreen &&
                "fixed inset-0 z-[100] flex-none rounded-none bg-black max-lg:portrait:aspect-auto",
            )}
          >
            <video
              ref={videoRef}
              className={cn(
                playerVideoClass,
                isPseudoFullscreen && "!aspect-auto !h-full !w-full",
              )}
              playsInline
              preload="auto"
              controls={false}
              muted={viewerAudioMuted}
              onClick={togglePlay}
            />
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2 max-lg:landscape:top-2 max-lg:landscape:right-2">
              <FullscreenButton
                isFullscreen={isFullscreen}
                onToggle={toggleFullscreen}
              />
              <PlayerLoopToggle enabled={loopPlay} onChange={setLoopPlay} />
            </div>
            <PlayerVideoOverlay
              playNumber={currentPlayNumber}
              playPosition={playPosition}
              playDuration={currentSegment?.duration ?? 0}
              gamePosition={playbackTime}
              gameDuration={playbackDuration}
              trailing={
                currentPlay?.offenseTeam ? (
                  <Badge className="border-0 bg-white/20 text-white backdrop-blur-sm">
                    {currentPlay.offenseTeam}
                  </Badge>
                ) : null
              }
              footer={
                currentPlay?.notes ? (
                  <p className="mt-1 line-clamp-1 text-sm text-white/85 max-lg:landscape:text-xs">
                    {currentPlay.notes}
                  </p>
                ) : null
              }
            />
          </div>
        </div>

        <div className="surface-card flex shrink-0 items-center justify-between gap-3 p-4 max-lg:landscape:px-3 max-lg:landscape:py-2">
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
          <p className="text-sm font-medium text-muted-foreground max-lg:landscape:hidden">
            {playSegments.findIndex((s) => s.playIndex === currentIndex) + 1}{" "}
            of {playSegments.length}
          </p>
        </div>

        <div className="hidden shrink-0 max-lg:portrait:block">
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
                <div className="flex items-center justify-between gap-3">
                  <SheetTitle className="font-heading">
                    {awayTeam} @ {homeTeam}
                  </SheetTitle>
                  {cacheButton}
                </div>
              </SheetHeader>
              <div className="mt-4">{renderPlayList(true)}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card className={cn(playerPlayListCardClass, "hidden max-lg:landscape:flex lg:flex")}>
        <CardHeader className="shrink-0 border-b border-border/60 pb-4 max-lg:landscape:py-2 max-lg:landscape:pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-heading text-lg max-lg:landscape:text-sm">
              Play list
            </CardTitle>
            {cacheButton}
          </div>
        </CardHeader>
        <CardContent className={cn(playerPlayListContentClass, "p-4 max-lg:landscape:p-2")}>
          {renderPlayList()}
        </CardContent>
      </Card>
      </div>
    </PlayerStage>
  );
}
