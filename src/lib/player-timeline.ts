import { playIdentityKey, sortPlays } from "@/lib/plays";
import type { PlayWithClip, VideoClipRecord } from "@/types";

export type GapPart = {
  videoClipId: string;
  clipStart: number;
  clipEnd: number;
};

export type TimelineGap = {
  kind: "gap";
  parts: GapPart[];
  globalStart: number;
  globalEnd: number;
  duration: number;
};

export type TimelinePlaySegment = {
  kind: "play";
  playIndex: number;
  playNumber: number;
  play: PlayWithClip;
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

function mergeAdjacentGaps(segments: TimelineSegment[]): TimelineSegment[] {
  const merged: TimelineSegment[] = [];

  for (const segment of segments) {
    const previous = merged.at(-1);
    if (
      previous &&
      isGapSegment(previous) &&
      isGapSegment(segment) &&
      Math.abs(previous.globalEnd - segment.globalStart) <= GAP_EPSILON
    ) {
      merged[merged.length - 1] = {
        kind: "gap",
        parts: [...previous.parts, ...segment.parts],
        globalStart: previous.globalStart,
        globalEnd: segment.globalEnd,
        duration: segment.globalEnd - previous.globalStart,
      };
      continue;
    }

    merged.push(segment);
  }

  return merged;
}

export function gapToPlayGaps(gap: TimelineGap): Array<{
  videoClipId: string;
  startTime: number;
  endTime: number;
}> {
  return gap.parts.map((part) => ({
    videoClipId: part.videoClipId,
    startTime: part.clipStart,
    endTime: part.clipEnd,
  }));
}

export function buildTimelines(
  clips: VideoClipRecord[],
  plays: PlayWithClip[],
): {
  segments: TimelineSegment[];
  playSegments: TimelinePlaySegment[];
  gapSegments: TimelineGap[];
  fullDuration: number;
  playbackDuration: number;
} {
  const orderedClips = [...clips].sort((a, b) => a.sortOrder - b.sortOrder);
  const orderedClipIds = orderedClips.map((clip) => clip.id);
  const sortedPlays = sortPlays(
    plays.filter((play) => play.videoClip),
    orderedClipIds,
  );

  const playIndexByKey = new Map(
    sortedPlays.map((play, index) => [playIdentityKey(play), index]),
  );

  const segments: TimelineSegment[] = [];
  const playSegments: TimelinePlaySegment[] = [];
  const gapSegments: TimelineGap[] = [];
  let fullOffset = 0;
  let playbackOffset = 0;

  for (const clip of orderedClips) {
    const clipPlays = sortedPlays.filter((play) => play.videoClipId === clip.id);
    let cursor = 0;

    const pushGap = (start: number, end: number) => {
      const duration = end - start;
      if (duration <= GAP_EPSILON) return;

      const gap: TimelineGap = {
        kind: "gap",
        parts: [{ videoClipId: clip.id, clipStart: start, clipEnd: end }],
        globalStart: fullOffset + start,
        globalEnd: fullOffset + end,
        duration,
      };
      gapSegments.push(gap);
      segments.push(gap);
    };

    for (const play of clipPlays) {
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
        globalStart: fullOffset + play.startTime,
        globalEnd: fullOffset + play.endTime,
        duration,
        playbackStart: playbackOffset,
        playbackEnd: playbackOffset + duration,
      };

      playSegments.push(segment);
      segments.push(segment);
      playbackOffset += duration;
      cursor = Math.max(cursor, play.endTime);
    }

    if (cursor < clip.duration - GAP_EPSILON) {
      pushGap(cursor, clip.duration);
    }

    fullOffset += clip.duration;
  }

  const mergedSegments = mergeAdjacentGaps(segments);
  const mergedGapSegments = mergedSegments.filter(isGapSegment);

  return {
    segments: mergedSegments,
    playSegments,
    gapSegments: mergedGapSegments,
    fullDuration: fullOffset,
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

export function segmentLocalTime(
  playbackTime: number,
  segment: TimelinePlaySegment,
): number {
  const offset = playbackTime - segment.playbackStart;
  return segment.play.startTime + offset;
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

export function clipTimeToPlaybackTime(
  clipId: string,
  localTime: number,
  playSegments: TimelinePlaySegment[],
): number | null {
  return localClipTimeToPlaybackTime(clipId, localTime, playSegments);
}

export function playbackTimeToClipTime(
  playbackTime: number,
  playSegments: TimelinePlaySegment[],
): { clipId: string; time: number } | null {
  const segment = playSegments.find(
    (s) => playbackTime >= s.playbackStart && playbackTime < s.playbackEnd,
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
  playSegments: TimelinePlaySegment[],
): TimelinePlaySegment | null {
  const matches = playSegments.filter(
    (s) =>
      s.play.videoClipId === clipId &&
      localTime >= s.play.startTime - 0.05 &&
      localTime < s.play.endTime + 0.001,
  );

  if (matches.length === 0) return null;
  return matches.sort((a, b) => a.play.startTime - b.play.startTime)[0];
}

export function localClipTimeToPlaybackTime(
  clipId: string,
  localTime: number,
  playSegments: TimelinePlaySegment[],
): number | null {
  const segment = findActiveSegmentAtClipTime(
    clipId,
    localTime,
    playSegments,
  );
  if (!segment) return null;

  return segment.playbackStart + (localTime - segment.play.startTime);
}
