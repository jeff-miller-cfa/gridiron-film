import type { VideoClipRecord } from "@/types";

export type ClipLayoutEntry = {
  clip: VideoClipRecord;
  gameStart: number;
  gameEnd: number;
};

export const CLIP_MATCH_EPSILON = 0.05;

/** Match play-boundaries snap so clip edges align with stored play times. */
function snapGameTime(time: number): number {
  return Math.round(time * 1000) / 1000;
}

export function isFullClipWrapperPlay(
  play: { startTime: number; endTime: number },
  entry: ClipLayoutEntry,
): boolean {
  const clipDuration = entry.gameEnd - entry.gameStart;
  const playDuration = play.endTime - play.startTime;

  return (
    play.startTime <= entry.gameStart + CLIP_MATCH_EPSILON &&
    play.endTime >= entry.gameEnd - CLIP_MATCH_EPSILON &&
    Math.abs(playDuration - clipDuration) <= CLIP_MATCH_EPSILON
  );
}

export function removeClipWrapperPlays<T extends { startTime: number; endTime: number }>(
  plays: T[],
  entry: ClipLayoutEntry,
): T[] {
  return plays.filter((play) => !isFullClipWrapperPlay(play, entry));
}

export function buildClipLayout(clips: VideoClipRecord[]): {
  entries: ClipLayoutEntry[];
  fullDuration: number;
} {
  const ordered = [...clips].sort((a, b) => a.sortOrder - b.sortOrder);
  let offset = 0;
  const entries: ClipLayoutEntry[] = [];

  for (const clip of ordered) {
    const gameStart = snapGameTime(offset);
    offset += clip.duration;
    const gameEnd = snapGameTime(offset);
    entries.push({
      clip,
      gameStart,
      gameEnd,
    });
  }

  return { entries, fullDuration: snapGameTime(offset) };
}

export function gameTimeToClipTime(
  gameTime: number,
  clips: VideoClipRecord[],
): { clipId: string; clip: VideoClipRecord; localTime: number } | null {
  const { entries } = buildClipLayout(clips);
  if (entries.length === 0) return null;

  const clamped = snapGameTime(
    Math.max(0, Math.min(gameTime, entries.at(-1)!.gameEnd - 0.001)),
  );

  for (const entry of entries) {
    if (clamped >= entry.gameStart && clamped < entry.gameEnd) {
      return {
        clipId: entry.clip.id,
        clip: entry.clip,
        localTime: clamped - entry.gameStart,
      };
    }
  }

  const last = entries.at(-1)!;
  return {
    clipId: last.clip.id,
    clip: last.clip,
    localTime: Math.max(0, last.clip.duration - 0.001),
  };
}

export function clipIndexForGameTime(
  gameTime: number,
  clips: VideoClipRecord[],
): number {
  const located = gameTimeToClipTime(gameTime, clips);
  if (!located) return 0;

  const { entries } = buildClipLayout(clips);
  const index = entries.findIndex((entry) => entry.clip.id === located.clipId);
  return index >= 0 ? index : 0;
}

export function clipTimeToGameTime(
  clipId: string,
  localTime: number,
  clips: VideoClipRecord[],
): number | null {
  const { entries } = buildClipLayout(clips);
  const entry = entries.find((row) => row.clip.id === clipId);
  if (!entry) return null;

  const clamped = Math.max(
    0,
    Math.min(localTime, Math.max(0, entry.clip.duration - 0.001)),
  );
  return entry.gameStart + clamped;
}

export type PlayClipSlice = {
  blobUrl: string;
  localStart: number;
  duration: number;
};

export function slicesForGameRange(
  rangeStart: number,
  rangeEnd: number,
  clips: VideoClipRecord[],
): PlayClipSlice[] {
  const { entries } = buildClipLayout(clips);
  const slices: PlayClipSlice[] = [];

  for (const entry of entries) {
    const overlapStart = Math.max(rangeStart, entry.gameStart);
    const overlapEnd = Math.min(rangeEnd, entry.gameEnd);
    const duration = overlapEnd - overlapStart;
    if (duration <= 0.05) continue;

    slices.push({
      blobUrl: entry.clip.blobUrl,
      localStart: overlapStart - entry.gameStart,
      duration,
    });
  }

  return slices;
}
