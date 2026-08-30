import { MIN_PLAY_DURATION, normalizeGamePlays, snapGameTime } from "@/lib/play-boundaries";
import { DEFAULT_PLAY_LOOKBACK_SECONDS } from "@/lib/game-settings";
import {
  CLIP_MATCH_EPSILON,
  isFullClipWrapperPlay,
  removeClipWrapperPlays,
  type ClipLayoutEntry,
} from "@/lib/clip-layout";
import { playIdentityKey, sortPlays } from "@/lib/plays";
import type { PlayDraft, VideoClipRecord } from "@/types";

export {
  CLIP_MATCH_EPSILON,
  isFullClipWrapperPlay,
  removeClipWrapperPlays,
} from "@/lib/clip-layout";

/** @deprecated Use game.playLookbackSeconds or DEFAULT_PLAY_LOOKBACK_SECONDS */
export const CLIP_PLAY_LOOKBACK_SECONDS = DEFAULT_PLAY_LOOKBACK_SECONDS;

export function clipLocalToGameTime(
  entry: ClipLayoutEntry,
  localTime: number,
): number {
  const clamped = Math.max(
    0,
    Math.min(localTime, Math.max(0, entry.clip.duration - 0.001)),
  );
  return snapGameTime(entry.gameStart + clamped);
}

export function gameTimeToClipLocal(
  entry: ClipLayoutEntry,
  gameTime: number,
): number {
  return snapGameTime(gameTime - entry.gameStart);
}

function playsOverlappingClip<T extends { startTime: number; endTime: number }>(
  plays: T[],
  entry: ClipLayoutEntry,
): T[] {
  return sortPlays(plays).filter(
    (play) =>
      play.endTime > entry.gameStart + CLIP_MATCH_EPSILON &&
      play.startTime < entry.gameEnd - CLIP_MATCH_EPSILON,
  );
}

export function playsInClip(
  plays: PlayDraft[],
  entry: ClipLayoutEntry,
  { includeWrappers = false } = {},
): PlayDraft[] {
  const overlapping = playsOverlappingClip(plays, entry);

  if (includeWrappers) return overlapping;
  return overlapping.filter((play) => !isFullClipWrapperPlay(play, entry));
}

export type ClipTimelineSegment = {
  play: PlayDraft;
  localStart: number;
  localEnd: number;
  duration: number;
};

export function clipTimelineSegments(
  plays: PlayDraft[],
  entry: ClipLayoutEntry,
): ClipTimelineSegment[] {
  return playsInClip(plays, entry).map((play) => {
    const localStart = Math.max(0, play.startTime - entry.gameStart);
    const localEnd = Math.min(entry.clip.duration, play.endTime - entry.gameStart);
    return {
      play,
      localStart,
      localEnd,
      duration: Math.max(0, localEnd - localStart),
    };
  });
}

export function insertPlayInClip(
  plays: PlayDraft[],
  entry: ClipLayoutEntry,
  startGame: number,
  endGame: number,
  newPlay: PlayDraft,
  clips: VideoClipRecord[] = [],
): PlayDraft[] {
  const start = snapGameTime(startGame);
  const end = snapGameTime(endGame);

  if (end <= start + MIN_PLAY_DURATION) {
    return plays;
  }

  const overlapping = playsOverlappingClip(plays, entry);
  const outsideClip = plays.filter((play) => !overlapping.includes(play));
  const keptInClip = overlapping.filter(
    (play) => !isFullClipWrapperPlay(play, entry),
  );

  return normalizeGamePlays(
    [
      ...outsideClip,
      ...keptInClip,
      { ...newPlay, startTime: start, endTime: end },
    ],
    clips,
  );
}

export function clipHasWrapperPlay(
  plays: PlayDraft[],
  entry: ClipLayoutEntry,
): boolean {
  return plays.some((play) => isFullClipWrapperPlay(play, entry));
}

export function playNumberInGame(
  plays: PlayDraft[],
  play: PlayDraft,
): number {
  const sorted = sortPlays(plays);
  const index = sorted.findIndex(
    (candidate) => playIdentityKey(candidate) === playIdentityKey(play),
  );
  return index >= 0 ? index + 1 : 0;
}
