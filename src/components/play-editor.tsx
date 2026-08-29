"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/video";
import {
  buildTimelines,
  clipTimeToPlaybackTime,
  findActiveSegmentAtClipTime,
  fullPositionToPlaybackTime,
  fullPositionToSegment,
  localClipTimeToPlaybackTime,
  playbackToFullPosition,
  playIndexToPlaybackTime,
  playbackTimeToClipTime,
  resolveClipIdFromVideo,
  segmentLocalTime,
} from "@/lib/player-timeline";
import { usePersistedPlayhead } from "@/hooks/use-persisted-playhead";
import type { PlayDraft, PlayWithClip, VideoClipRecord } from "@/types";
import { Pause, Play, RotateCcw, Scissors, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PlayEditorProps = {
  clips: VideoClipRecord[];
  plays: PlayDraft[];
  homeTeam: string;
  awayTeam: string;
  gameId: string;
  onChange: (plays: PlayDraft[]) => void;
  onRecoverPlay: (playId: string) => void;
};

export function PlayEditor({
  clips,
  plays,
  homeTeam,
  awayTeam,
  gameId,
  onChange,
  onRecoverPlay,
}: PlayEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const seekingRef = useRef(false);
  const currentIndexRef = useRef(0);
  const initializedRef = useRef(false);
  const loadedClipIdRef = useRef<string | null>(null);
  const { persisted, persistPlayhead } = usePersistedPlayhead();

  const [playbackTime, setPlaybackTime] = useState(0);
  const [clipLocalTime, setClipLocalTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedPlayIndex, setSelectedPlayIndex] = useState<number | null>(
    null,
  );
  const [loadedClipUrl, setLoadedClipUrl] = useState<string | null>(null);

  const playsWithClips: PlayWithClip[] = useMemo(
    () =>
      plays.map((p, playIndex) => ({
        ...p,
        id: p.id ?? "",
        gameId,
        offenseTeam: p.offenseTeam ?? null,
        notes: p.notes ?? null,
        deletedAt: p.deletedAt ?? null,
        createdAt: "",
        updatedAt: "",
        videoClip: clips.find((c) => c.id === p.videoClipId),
        playIndex,
      })),
    [plays, clips, gameId],
  );

  const { segments, fullDuration, playbackDuration, activeSegments } = useMemo(
    () => buildTimelines(playsWithClips),
    [playsWithClips],
  );

  const fullPosition = playbackToFullPosition(playbackTime, segments);

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
      const clipId = segment.play.videoClipId;

      seekingRef.current = true;
      setPlaybackTime(clamped);
      setClipLocalTime(localTime);
      setSelectedPlayIndex(segment.playIndex);
      currentIndexRef.current = segment.playIndex;
      loadedClipIdRef.current = clipId;
      setLoadedClipUrl(clipUrl);

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
    (playIndex: number) => {
      const playback = playIndexToPlaybackTime(playIndex, segments);
      if (playback === null) return;
      void seekToPlaybackTime(playback);
    },
    [segments, seekToPlaybackTime],
  );

  const seekToFullPosition = useCallback(
    (position: number) => {
      const segment = fullPositionToSegment(position, segments);
      if (!segment) return;

      if (segment.deleted && segment.play.id) {
        onRecoverPlay(segment.play.id);
        return;
      }

      const playback = fullPositionToPlaybackTime(position, segments);
      if (playback !== null) void seekToPlaybackTime(playback);
    },
    [segments, onRecoverPlay, seekToPlaybackTime],
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

    void seekToPlaybackTime(targetPlayback);
  }, [activeSegments.length, persisted, segments, seekToPlaybackTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeSegments.length === 0) return;

    const syncFromVideo = () => {
      if (seekingRef.current) return;

      const local = video.currentTime;
      const clipId =
        loadedClipIdRef.current ?? resolveClipIdFromVideo(video, clips);
      if (!clipId) return;

      loadedClipIdRef.current = clipId;

      let segment = findActiveSegmentAtClipTime(
        clipId,
        local,
        activeSegments,
      );

      if (!segment) {
        const playback = localClipTimeToPlaybackTime(
          clipId,
          local,
          activeSegments,
        );
        if (playback === null) return;
        segment =
          activeSegments.find(
            (s) =>
              s.playbackStart !== null &&
              playback >= s.playbackStart &&
              playback < s.playbackEnd!,
          ) ?? null;
      }

      if (!segment || segment.playbackStart === null) return;

      if (local >= segment.play.endTime - 0.08) {
        const segIdx = activeSegments.indexOf(segment);
        const next = activeSegments[segIdx + 1];
        if (next) {
          void seekToPlaybackTime(next.playbackStart!, !video.paused);
          return;
        }
      }

      const newPlayback =
        segment.playbackStart + (local - segment.play.startTime);
      setPlaybackTime(newPlayback);
      setClipLocalTime(local);
      persistPlayhead(clipId, local);
      if (segment.playIndex !== currentIndexRef.current) {
        currentIndexRef.current = segment.playIndex;
        setSelectedPlayIndex(segment.playIndex);
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
  }, [activeSegments, clips, persistPlayhead, seekToPlaybackTime]);

  const renumberActivePlays = (updated: PlayDraft[]) => {
    let n = 0;
    return [...updated]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => {
        if (p.deletedAt) return p;
        n += 1;
        return { ...p, playNumber: n };
      });
  };

  const updatePlays = (updated: PlayDraft[]) => {
    onChange(renumberActivePlays(updated));
  };

  const splitAtCurrentTime = () => {
    const video = videoRef.current;
    const clipId = loadedClipIdRef.current;
    if (!video || !clipId) return;

    const time = video.currentTime;
    const playIndex = plays.findIndex(
      (p) =>
        !p.deletedAt &&
        p.videoClipId === clipId &&
        time > p.startTime + 0.1 &&
        time < p.endTime - 0.1,
    );

    if (playIndex === -1) return;

    const play = plays[playIndex];
    const newPlay: PlayDraft = {
      videoClipId: play.videoClipId,
      startTime: time,
      endTime: play.endTime,
      playNumber: play.playNumber + 1,
      offenseTeam: play.offenseTeam,
      notes: "",
      sortOrder: play.sortOrder + 0.5,
      deletedAt: null,
    };

    const updated = plays.map((p, i) =>
      i === playIndex ? { ...p, endTime: time } : p,
    );
    updated.push(newPlay);
    updatePlays(updated);
  };

  const removePlay = (index: number) => {
    const updated = plays.map((p, i) =>
      i === index ? { ...p, deletedAt: new Date().toISOString() } : p,
    );
    updatePlays(updated);
    setSelectedPlayIndex(null);
  };

  const updatePlayField = (
    index: number,
    field: keyof PlayDraft,
    value: string | number,
  ) => {
    onChange(
      plays.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  };

  const allPlaysActive = plays
    .map((p, index) => ({ ...p, index }))
    .filter((p) => !p.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!clips.length) {
    return (
      <Card className="surface-card border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          Upload videos to start defining plays.
        </CardContent>
      </Card>
    );
  }

  if (activeSegments.length === 0) {
    return (
      <Card className="surface-card border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          No active plays. Restore a removed play from the timeline or upload
          footage.
        </CardContent>
      </Card>
    );
  }

  const playheadPercent =
    fullDuration > 0 ? (fullPosition / fullDuration) * 100 : 0;

  const currentSegment =
    activeSegments.find((s) => s.playIndex === selectedPlayIndex) ??
    activeSegments[0];
  const currentClip = currentSegment?.play.videoClip;

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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="surface-elevated overflow-hidden p-1">
          <div className="relative overflow-hidden rounded-xl bg-slate-900">
            <video
              ref={videoRef}
              className="aspect-video w-full"
              playsInline
              preload="auto"
              controls={false}
              onClick={() => void togglePlay()}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-xs text-white/90 sm:text-sm">
                <span className="font-medium">
                  Play {currentSegment?.play.playNumber ?? 1}
                  {currentClip ? ` · ${currentClip.filename}` : ""}
                </span>
                <span className="tabular-nums">
                  {formatDuration(playbackTime)} / {formatDuration(playbackDuration)}
                </span>
              </div>
              {currentClip && (
                <p className="mt-1 text-[11px] text-white/70 sm:text-xs">
                  Clip {formatDuration(clipLocalTime)} /{" "}
                  {formatDuration(currentClip.duration)}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
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
          <Button className="rounded-xl" onClick={splitAtCurrentTime}>
            <Scissors className="mr-2 h-4 w-4" />
            Split at playhead
          </Button>
        </div>

        <div className="surface-card space-y-2 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{formatDuration(playbackTime)}</span>
            <span>{formatDuration(playbackDuration)} total</span>
          </div>
          <div
            ref={timelineRef}
            role="slider"
            aria-label="Stitched game timeline"
            tabIndex={0}
            className="relative h-12 cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-muted/40"
            onClick={(e) => {
              const el = timelineRef.current;
              if (!el || fullDuration <= 0) return;
              const rect = el.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width),
              );
              seekToFullPosition(ratio * fullDuration);
            }}
          >
            {segments.map((segment) => {
              const left = (segment.globalStart / fullDuration) * 100;
              const width = (segment.duration / fullDuration) * 100;
              const isSelected = segment.playIndex === selectedPlayIndex;

              return (
                <button
                  key={segment.play.id || `${segment.playIndex}-${segment.globalStart}`}
                  type="button"
                  title={
                    segment.deleted
                      ? `Restore play ${segment.play.playNumber}`
                      : `Play ${segment.play.playNumber}`
                  }
                  className={cn(
                    "absolute top-0 flex h-full items-center justify-center border-r border-white/40 text-[10px] font-bold transition-colors sm:text-xs",
                    segment.deleted
                      ? "bg-muted-foreground/30 text-muted-foreground hover:bg-accent/40"
                      : isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/50 text-white hover:bg-primary/70",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (segment.deleted && segment.play.id) {
                      onRecoverPlay(segment.play.id);
                    } else {
                      seekToPlay(segment.playIndex);
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
            All clips stitched — click a play to jump, gray segments can be
            restored
          </p>
        </div>
      </div>

      <Card className="surface-card">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="font-heading text-base">All plays</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pt-4">
          {allPlaysActive.length === 0 && (
            <p className="text-sm text-muted-foreground">No active plays.</p>
          )}
          {allPlaysActive.map((play) => {
            const segment = segments.find((s) => s.playIndex === play.index);
            return (
              <div
                key={`${play.videoClipId}-${play.startTime}-${play.index}`}
                className={cn(
                  "cursor-pointer rounded-xl border p-4 transition-colors",
                  selectedPlayIndex === play.index
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/80 bg-card hover:border-primary/20 hover:bg-muted/30",
                )}
                onClick={() => seekToPlay(play.index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    seekToPlay(play.index);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="mb-2 flex items-center justify-between">
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                    Play {play.playNumber}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePlay(play.index);
                    }}
                    title="Remove play (recoverable from timeline)"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  {segment
                    ? formatDuration(segment.duration)
                    : formatDuration(play.endTime - play.startTime)}
                </p>
                <div
                  className="space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div>
                    <Label className="text-xs">Offense</Label>
                    <div className="mt-1 flex gap-1">
                      {[homeTeam, awayTeam].map((team) => (
                        <Button
                          key={team}
                          type="button"
                          size="sm"
                          variant={
                            play.offenseTeam === team ? "default" : "outline"
                          }
                          onClick={() =>
                            updatePlayField(play.index, "offenseTeam", team)
                          }
                        >
                          {team}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      className="mt-1 min-h-[72px] rounded-xl text-sm"
                      value={play.notes ?? ""}
                      onChange={(e) =>
                        updatePlayField(play.index, "notes", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
