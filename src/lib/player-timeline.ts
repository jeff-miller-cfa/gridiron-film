import type { PlayWithClip } from "@/types";

export type TimelineSegment = {
  playIndex: number;
  play: PlayWithClip;
  globalStart: number;
  globalEnd: number;
  duration: number;
  deleted: boolean;
  playbackStart: number | null;
  playbackEnd: number | null;
};

export function buildTimelines(plays: PlayWithClip[]): {
  segments: TimelineSegment[];
  fullDuration: number;
  playbackDuration: number;
  activeSegments: TimelineSegment[];
} {
  const sorted = [...plays]
    .map((play, playIndex) => ({ play, playIndex }))
    .filter(({ play }) => play.videoClip)
    .sort((a, b) => a.play.sortOrder - b.play.sortOrder);

  let fullOffset = 0;
  let playbackOffset = 0;
  const segments: TimelineSegment[] = [];

  for (const { play, playIndex } of sorted) {
    const duration = Math.max(0, play.endTime - play.startTime);
    if (duration <= 0) continue;

    const deleted = Boolean(play.deletedAt);
    const segment: TimelineSegment = {
      playIndex,
      play,
      globalStart: fullOffset,
      globalEnd: fullOffset + duration,
      duration,
      deleted,
      playbackStart: deleted ? null : playbackOffset,
      playbackEnd: deleted ? null : playbackOffset + duration,
    };

    if (!deleted) playbackOffset += duration;
    fullOffset += duration;
    segments.push(segment);
  }

  const activeSegments = segments.filter((s) => !s.deleted);

  return {
    segments,
    fullDuration: fullOffset,
    playbackDuration: playbackOffset,
    activeSegments,
  };
}

export function globalTimeToSegment(
  globalTime: number,
  segments: TimelineSegment[],
  usePlayback = false,
): TimelineSegment | null {
  if (segments.length === 0) return null;

  const maxTime = usePlayback
    ? segments.filter((s) => !s.deleted).at(-1)?.playbackEnd ?? 0
    : segments.at(-1)!.globalEnd;

  const clamped = Math.max(0, Math.min(globalTime, maxTime - 0.001));

  for (const segment of segments) {
    if (segment.deleted) continue;
    const start = usePlayback ? segment.playbackStart! : segment.globalStart;
    const end = usePlayback ? segment.playbackEnd! : segment.globalEnd;
    if (clamped >= start && clamped < end) {
      return segment;
    }
  }

  return segments.filter((s) => !s.deleted).at(-1) ?? null;
}

export function fullPositionToSegment(
  fullPosition: number,
  segments: TimelineSegment[],
): TimelineSegment | null {
  if (segments.length === 0) return null;
  const clamped = Math.max(
    0,
    Math.min(fullPosition, segments.at(-1)!.globalEnd - 0.001),
  );

  for (const segment of segments) {
    if (clamped >= segment.globalStart && clamped < segment.globalEnd) {
      return segment;
    }
  }

  return segments.at(-1) ?? null;
}

export function segmentLocalTime(
  playbackTime: number,
  segment: TimelineSegment,
): number {
  const offset = playbackTime - (segment.playbackStart ?? 0);
  return segment.play.startTime + offset;
}

export function playIndexToPlaybackTime(
  playIndex: number,
  segments: TimelineSegment[],
): number | null {
  const segment = segments.find((s) => s.playIndex === playIndex && !s.deleted);
  return segment?.playbackStart ?? null;
}

export function playIndexToFullPosition(
  playIndex: number,
  segments: TimelineSegment[],
): number | null {
  const segment = segments.find((s) => s.playIndex === playIndex);
  return segment?.globalStart ?? null;
}

export function playbackToFullPosition(
  playbackTime: number,
  segments: TimelineSegment[],
): number {
  const segment = globalTimeToSegment(playbackTime, segments, true);
  if (!segment || segment.playbackStart === null) return 0;

  const offset = playbackTime - segment.playbackStart;
  return segment.globalStart + offset;
}

export function fullPositionToPlaybackTime(
  fullPosition: number,
  segments: TimelineSegment[],
): number | null {
  const segment = fullPositionToSegment(fullPosition, segments);
  if (!segment) return null;
  if (segment.deleted) return null;

  const offset = fullPosition - segment.globalStart;
  return (segment.playbackStart ?? 0) + offset;
}

export function clipTimeToPlaybackTime(
  clipId: string,
  localTime: number,
  segments: TimelineSegment[],
): number | null {
  const activeSegments = segments.filter((s) => !s.deleted);
  return localClipTimeToPlaybackTime(clipId, localTime, activeSegments);
}

export function playbackTimeToClipTime(
  playbackTime: number,
  segments: TimelineSegment[],
): { clipId: string; time: number } | null {
  const segment = segments.find(
    (s) =>
      !s.deleted &&
      s.playbackStart !== null &&
      playbackTime >= s.playbackStart &&
      playbackTime < s.playbackEnd!,
  );
  if (!segment) return null;

  return {
    clipId: segment.play.videoClipId,
    time: segmentLocalTime(playbackTime, segment),
  };
}

export function resolveClipIdFromVideo(
  video: HTMLVideoElement,
  clips: Array<{ id: string; blobUrl: string }>,
): string | null {
  const src = video.currentSrc || video.src;
  if (!src) return null;

  for (const clip of clips) {
    if (src === clip.blobUrl) return clip.id;

    try {
      const srcUrl = new URL(src, "http://localhost");
      const blobUrl = new URL(clip.blobUrl, "http://localhost");
      if (srcUrl.pathname === blobUrl.pathname) return clip.id;
    } catch {
      if (src.includes(clip.blobUrl) || clip.blobUrl.includes(src)) {
        return clip.id;
      }
    }
  }

  return null;
}

export function findActiveSegmentAtClipTime(
  clipId: string,
  localTime: number,
  activeSegments: TimelineSegment[],
): TimelineSegment | null {
  const matches = activeSegments.filter(
    (s) =>
      s.play.videoClipId === clipId &&
      localTime >= s.play.startTime - 0.05 &&
      localTime < s.play.endTime + 0.001,
  );

  if (matches.length === 0) return null;
  return matches.sort((a, b) => a.play.sortOrder - b.play.sortOrder)[0];
}

export function localClipTimeToPlaybackTime(
  clipId: string,
  localTime: number,
  activeSegments: TimelineSegment[],
): number | null {
  const segment = findActiveSegmentAtClipTime(
    clipId,
    localTime,
    activeSegments,
  );
  if (!segment || segment.playbackStart === null) return null;

  return segment.playbackStart + (localTime - segment.play.startTime);
}
