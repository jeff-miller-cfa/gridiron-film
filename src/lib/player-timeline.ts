import {
  buildClipLayout,
  clipTimeToGameTime,
  gameTimeToClipTime,
} from "@/lib/clip-layout";
import { playIdentityKey, sortPlays } from "@/lib/plays";
import type { PlayRecord, VideoClipRecord } from "@/types";

export type TimelineGap = {
  kind: "gap";
  globalStart: number;
  globalEnd: number;
  duration: number;
};

export type TimelinePlaySegment = {
  kind: "play";
  playIndex: number;
  playNumber: number;
  play: PlayRecord;
  globalStart: number;
  globalEnd: number;
  duration: number;
  playbackStart: number;
  playbackEnd: number;
};

export type TimelineSegment = TimelineGap | TimelinePlaySegment;

export function isPlaySegment(
  segment: TimelineSegment,
): segment is TimelinePlaySegment {
  return segment.kind === "play";
}

export function isGapSegment(segment: TimelineSegment): segment is TimelineGap {
  return segment.kind === "gap";
}

const GAP_EPSILON = 0.05;

export function gapToPlayGaps(gap: TimelineGap): Array<{
  startTime: number;
  endTime: number;
}> {
  return [{ startTime: gap.globalStart, endTime: gap.globalEnd }];
}

export function buildTimelines(
  clips: VideoClipRecord[],
  plays: PlayRecord[],
): {
  segments: TimelineSegment[];
  playSegments: TimelinePlaySegment[];
  gapSegments: TimelineGap[];
  fullDuration: number;
  playbackDuration: number;
} {
  const { fullDuration } = buildClipLayout(clips);
  const sortedPlays = sortPlays(plays);

  const playIndexByKey = new Map(
    sortedPlays.map((play, index) => [playIdentityKey(play), index]),
  );

  const segments: TimelineSegment[] = [];
  const playSegments: TimelinePlaySegment[] = [];
  const gapSegments: TimelineGap[] = [];
  let cursor = 0;
  let playbackOffset = 0;

  const pushGap = (start: number, end: number) => {
    const duration = end - start;
    if (duration <= GAP_EPSILON) return;

    const gap: TimelineGap = {
      kind: "gap",
      globalStart: start,
      globalEnd: end,
      duration,
    };
    gapSegments.push(gap);
    segments.push(gap);
  };

  for (const play of sortedPlays) {
    if (play.startTime > cursor + GAP_EPSILON) {
      pushGap(cursor, play.startTime);
    }

    const duration = Math.max(0, play.endTime - play.startTime);
    if (duration <= GAP_EPSILON) continue;

    const playIndex = playIndexByKey.get(playIdentityKey(play)) ?? 0;
    const segment: TimelinePlaySegment = {
      kind: "play",
      playIndex,
      playNumber: playIndex + 1,
      play,
      globalStart: play.startTime,
      globalEnd: play.endTime,
      duration,
      playbackStart: playbackOffset,
      playbackEnd: playbackOffset + duration,
    };

    playSegments.push(segment);
    segments.push(segment);
    playbackOffset += duration;
    cursor = Math.max(cursor, play.endTime);
  }

  if (cursor < fullDuration - GAP_EPSILON) {
    pushGap(cursor, fullDuration);
  }

  return {
    segments,
    playSegments,
    gapSegments,
    fullDuration,
    playbackDuration: playbackOffset,
  };
}

export function globalTimeToPlaySegment(
  globalTime: number,
  playSegments: TimelinePlaySegment[],
  usePlayback = false,
): TimelinePlaySegment | null {
  if (playSegments.length === 0) return null;

  const maxTime = usePlayback
    ? playSegments.at(-1)!.playbackEnd
    : playSegments.at(-1)!.globalEnd;

  const clamped = Math.max(0, Math.min(globalTime, maxTime - 0.001));

  for (const segment of playSegments) {
    const start = usePlayback ? segment.playbackStart : segment.globalStart;
    const end = usePlayback ? segment.playbackEnd : segment.globalEnd;
    if (clamped >= start && clamped < end) {
      return segment;
    }
  }

  return playSegments.at(-1) ?? null;
}

export function fullPositionToSegment(
  fullPosition: number,
  segments: TimelineSegment[],
): TimelineSegment | null {
  if (segments.length === 0) return null;

  const maxEnd = segments.at(-1)!.globalEnd;
  const clamped = Math.max(0, Math.min(fullPosition, maxEnd - 0.001));

  for (const segment of segments) {
    if (clamped >= segment.globalStart && clamped < segment.globalEnd) {
      return segment;
    }
  }

  return segments.at(-1) ?? null;
}

export function segmentGameTime(
  playbackTime: number,
  segment: TimelinePlaySegment,
): number {
  const offset = playbackTime - segment.playbackStart;
  return segment.globalStart + offset;
}

export function playIndexToPlaybackTime(
  playIndex: number,
  playSegments: TimelinePlaySegment[],
): number | null {
  const segment = playSegments.find((s) => s.playIndex === playIndex);
  return segment?.playbackStart ?? null;
}

export function playbackToFullPosition(
  playbackTime: number,
  playSegments: TimelinePlaySegment[],
): number {
  const segment = globalTimeToPlaySegment(playbackTime, playSegments, true);
  if (!segment) return 0;

  const offset = playbackTime - segment.playbackStart;
  return segment.globalStart + offset;
}

export function fullPositionToPlaybackTime(
  fullPosition: number,
  segments: TimelineSegment[],
  playSegments: TimelinePlaySegment[],
): number | null {
  const segment = fullPositionToSegment(fullPosition, segments);
  if (!segment || isGapSegment(segment)) return null;

  const offset = fullPosition - segment.globalStart;
  return segment.playbackStart + offset;
}

export function gameTimeToPlaybackTime(
  gameTime: number,
  playSegments: TimelinePlaySegment[],
): number | null {
  const segment = findActiveSegmentAtGameTime(gameTime, playSegments);
  if (!segment) return null;

  return segment.playbackStart + (gameTime - segment.globalStart);
}

export function playbackTimeToGameTime(
  playbackTime: number,
  playSegments: TimelinePlaySegment[],
): number | null {
  const segment = playSegments.find(
    (s) => playbackTime >= s.playbackStart && playbackTime < s.playbackEnd,
  );
  if (!segment) return null;

  return segmentGameTime(playbackTime, segment);
}

export function playbackTimeToClipTime(
  playbackTime: number,
  playSegments: TimelinePlaySegment[],
  clips: VideoClipRecord[],
): { clipId: string; time: number } | null {
  const gameTime = playbackTimeToGameTime(playbackTime, playSegments);
  if (gameTime === null) return null;

  const located = gameTimeToClipTime(gameTime, clips);
  if (!located) return null;

  return { clipId: located.clipId, time: located.localTime };
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

export function findActiveSegmentAtGameTime(
  gameTime: number,
  playSegments: TimelinePlaySegment[],
): TimelinePlaySegment | null {
  const matches = playSegments.filter(
    (segment) =>
      gameTime >= segment.globalStart - 0.05 &&
      gameTime < segment.globalEnd + 0.001,
  );

  if (matches.length === 0) return null;
  return matches.sort((a, b) => a.globalStart - b.globalStart)[0] ?? null;
}

/** Prefer an explicitly selected play so overlapping segments honor the shorter boundary. */
export function resolvePlaybackSegment(
  gameTime: number,
  playSegments: TimelinePlaySegment[],
  preferredPlayKey: string | null = null,
): TimelinePlaySegment | null {
  if (preferredPlayKey) {
    const preferred = playSegments.find(
      (segment) => playIdentityKey(segment.play) === preferredPlayKey,
    );
    if (preferred && gameTime >= preferred.globalStart - 0.05) {
      return preferred;
    }
  }

  return findActiveSegmentAtGameTime(gameTime, playSegments);
}

export function clipTimeToPlaybackTime(
  clipId: string,
  localTime: number,
  clips: VideoClipRecord[],
  playSegments: TimelinePlaySegment[],
): number | null {
  const gameTime = clipTimeToGameTime(clipId, localTime, clips);
  if (gameTime === null) return null;

  return gameTimeToPlaybackTime(gameTime, playSegments);
}

