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
  findActiveSegmentAtClipTime,
  fullPositionToPlaybackTime,
  fullPositionToSegment,
  gapToPlayGaps,
  isGapSegment,
  isPlaySegment,
  localClipTimeToPlaybackTime,
  playbackToFullPosition,
  playbackTimeToClipTime,
  resolveClipIdFromVideo,
  segmentLocalTime,
} from "@/lib/player-timeline";
import { usePersistedPlayhead } from "@/hooks/use-persisted-playhead";
import { useTimelineScrub } from "@/hooks/use-timeline-scrub";
import { playIdentityKey, sortPlays } from "@/lib/plays";
import {
  offenseTimelineTone,
  playTimelineSegmentClass,
} from "@/lib/play-timeline-colors";
import type { PlayDraft, PlayGap, PlayWithClip, VideoClipRecord } from "@/types";
import { Eye, EyeOff, Pause, Pencil, Play, RotateCcw, Scissors, StickyNote, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PlayEditorProps = {
  clips: VideoClipRecord[];
  plays: PlayDraft[];
  homeTeam: string;
  awayTeam: string;
  gameId: string;
  onChange: (plays: PlayDraft[]) => void;
  onRestoreGap: (gaps: PlayGap[]) => void;
};

function parseShowGaps(value: string | null): boolean {
  return value === "true" || value === "1";
}

export function PlayEditor({
  clips,
  plays,
  homeTeam,
  awayTeam,
  gameId,
  onChange,
  onRestoreGap,
}: PlayEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showGapsOnTimeline = parseShowGaps(searchParams.get("gaps"));

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
  const playListRef = useRef<HTMLDivElement>(null);
  const playItemRefs = useRef(new Map<string, HTMLDivElement>());
  const seekingRef = useRef(false);
  const currentPlayIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const loadedClipIdRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const seekTokenRef = useRef(0);
  const { persisted, persistPlayhead } = usePersistedPlayhead();

  const [playbackTime, setPlaybackTime] = useState(0);
  const [clipLocalTime, setClipLocalTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  isPlayingRef.current = isPlaying;
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  const [notesEditorPlayId, setNotesEditorPlayId] = useState<string | null>(null);

  const orderedClipIds = useMemo(
    () =>
      [...clips]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((clip) => clip.id),
    [clips],
  );

  const playsWithClips: PlayWithClip[] = useMemo(
    () =>
      plays.map((p) => ({
        ...p,
        id: p.id ?? `pending-${playIdentityKey(p)}`,
        gameId,
        offenseTeam: p.offenseTeam ?? null,
        notes: p.notes ?? null,
        createdAt: "",
        updatedAt: "",
        videoClip: clips.find((c) => c.id === p.videoClipId),
      })),
    [plays, clips, gameId],
  );

  const {
    segments,
    playSegments,
    gapSegments,
    fullDuration,
    playbackDuration,
  } = useMemo(
    () => buildTimelines(clips, playsWithClips),
    [clips, playsWithClips],
  );

  const sortedPlays = useMemo(
    () => sortPlays(plays, orderedClipIds),
    [plays, orderedClipIds],
  );

  const fullPosition = playbackToFullPosition(playbackTime, playSegments);
  const timelineDuration = showGapsOnTimeline ? fullDuration : playbackDuration;
  const timelinePosition = showGapsOnTimeline ? fullPosition : playbackTime;

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
      setClipLocalTime(localTime);
      const playId = playIdentityKey(segment.play);
      setSelectedPlayId(playId);
      currentPlayIdRef.current = playId;
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
      void seekToPlaybackTime(segment.playbackStart);
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
      const restored = clipTimeToPlaybackTime(
        persisted.clipId,
        persisted.time,
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
      const clipId =
        loadedClipIdRef.current ?? resolveClipIdFromVideo(video, clips);
      if (!clipId) return;

      loadedClipIdRef.current = clipId;

      let segment = findActiveSegmentAtClipTime(clipId, local, playSegments);

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
      setClipLocalTime(local);
      persistPlayhead(clipId, local);

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
    if (!selectedPlayId) return;
    const item = playItemRefs.current.get(selectedPlayId);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPlayId]);

  const updatePlays = (updated: PlayDraft[]) => {
    onChange(updated);
  };

  const splitAtCurrentTime = () => {
    const video = videoRef.current;
    const clipId = loadedClipIdRef.current;
    if (!video || !clipId) return;

    const time = video.currentTime;
    const playIndex = plays.findIndex(
      (p) =>
        p.videoClipId === clipId &&
        time > p.startTime + 0.1 &&
        time < p.endTime - 0.1,
    );

    if (playIndex === -1) return;

    const play = plays[playIndex];
    const newPlay: PlayDraft = {
      clientKey: crypto.randomUUID(),
      videoClipId: play.videoClipId,
      startTime: time,
      endTime: play.endTime,
      offenseTeam: play.offenseTeam,
      notes: "",
    };

    const updated = plays.map((p, i) =>
      i === playIndex ? { ...p, endTime: time } : p,
    );
    updated.push(newPlay);
    updatePlays(updated);
  };

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

  if (playSegments.length === 0) {
    return (
      <Card className="surface-card border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          No plays yet. Restore a gap from the timeline or upload footage.
        </CardContent>
      </Card>
    );
  }

  const currentSegment =
    playSegments.find((s) => playIdentityKey(s.play) === selectedPlayId) ??
    playSegments[0];
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

  const timelineSegments = showGapsOnTimeline ? segments : playSegments;

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
                  Play {currentSegment?.playNumber ?? 1}
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
            className="relative h-12 cursor-pointer touch-none overflow-hidden rounded-xl border border-border/80 bg-muted/40 select-none"
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
            Drag the timeline or playhead to scrub — click a play to jump
            {showGapsOnTimeline && gapSegments.length > 0
              ? ", gray segments can be restored"
              : ""}
          </p>
        </div>
      </div>

      <Card className="surface-card">
        <CardHeader className="border-b border-border/60 py-3">
          <CardTitle className="font-heading text-sm">All plays</CardTitle>
        </CardHeader>
        <CardContent
          ref={playListRef}
          className="max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto p-3"
        >
          {sortedPlays.length === 0 && (
            <p className="text-sm text-muted-foreground">No plays yet.</p>
          )}
          {sortedPlays.map((play) => {
            const playId = playIdentityKey(play);
            const playNumber = playSegments.find(
              (s) => playIdentityKey(s.play) === playId,
            )?.playNumber;
            const segment = playSegments.find(
              (s) => playIdentityKey(s.play) === playId,
            );
            const duration = segment
              ? segment.duration
              : play.endTime - play.startTime;
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
                        variant={
                          play.offenseTeam === team ? "default" : "outline"
                        }
                        className="max-w-[5.5rem] truncate px-1.5"
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
  );
}
