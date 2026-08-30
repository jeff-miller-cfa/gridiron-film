import {
  buildClipLayout,
  CLIP_MATCH_EPSILON,
  isFullClipWrapperPlay,
} from "@/lib/clip-layout";
import { playIdentityKey, sortPlays } from "@/lib/plays";
import type { PlayDraft, VideoClipRecord } from "@/types";

type PlayTimeRange = {
  startTime: number;
  endTime: number;
};

/** Millisecond precision keeps adjacent play boundaries aligned after save/load. */
export function snapGameTime(time: number): number {
  return Math.round(time * 1000) / 1000;
}

const BOUNDARY_SEAL_EPSILON = 0.05;
export const MIN_PLAY_DURATION = 0.1;

function isValidPlayDuration(startTime: number, endTime: number): boolean {
  return endTime > startTime + MIN_PLAY_DURATION;
}

function clonePlayFragment<T extends PlayTimeRange>(play: T): T {
  const fragment = { ...play } as T & { id?: string; clientKey?: string };
  delete fragment.id;
  fragment.clientKey = crypto.randomUUID();
  return fragment as T;
}

/**
 * Drops full-clip placeholder plays when real plays already exist in that clip.
 */
export function removeRedundantClipWrappers<T extends PlayTimeRange>(
  plays: T[],
  clips: VideoClipRecord[],
): T[] {
  if (clips.length === 0) return plays;

  const { entries } = buildClipLayout(clips);
  const wrappersToRemove = new Set<T>();

  for (const entry of entries) {
    const inClip = plays.filter(
      (play) =>
        play.endTime > entry.gameStart + CLIP_MATCH_EPSILON &&
        play.startTime < entry.gameEnd - CLIP_MATCH_EPSILON,
    );
    const hasRealPlays = inClip.some(
      (play) => !isFullClipWrapperPlay(play, entry),
    );
    if (!hasRealPlays) continue;

    for (const play of inClip) {
      if (isFullClipWrapperPlay(play, entry)) {
        wrappersToRemove.add(play);
      }
    }
  }

  return plays.filter((play) => !wrappersToRemove.has(play));
}

/**
 * Ensures plays are sorted, non-overlapping, and long enough to keep.
 * When a later play starts inside an earlier one, the earlier play is split
 * around it instead of silently dropping the later play.
 */
export function resolvePlayOverlaps<T extends PlayTimeRange>(plays: T[]): T[] {
  const sorted = sortPlays(plays)
    .map((play) => ({
      ...play,
      startTime: snapGameTime(play.startTime),
      endTime: snapGameTime(play.endTime),
    }))
    .filter((play) => isValidPlayDuration(play.startTime, play.endTime));

  const resolved: T[] = [];
  const pending: T[] = [...sorted];

  while (pending.length > 0) {
    const current = pending.shift()!;
    let startTime = current.startTime;
    let endTime = current.endTime;

    if (!isValidPlayDuration(startTime, endTime)) continue;

    const previous = resolved.at(-1);
    if (previous && startTime < previous.endTime - BOUNDARY_SEAL_EPSILON) {
      if (startTime > previous.startTime + MIN_PLAY_DURATION) {
        const trailingStart = endTime;
        const trailingEnd = previous.endTime;
        const splitSource = previous;
        previous.endTime = startTime;

        if (!isValidPlayDuration(previous.startTime, previous.endTime)) {
          resolved.pop();
        } else if (
          isValidPlayDuration(trailingStart, trailingEnd) &&
          trailingStart < trailingEnd - BOUNDARY_SEAL_EPSILON
        ) {
          pending.unshift(
            clonePlayFragment({
              ...splitSource,
              startTime: trailingStart,
              endTime: trailingEnd,
            }),
          );
        }
      }

      const latestPrevious = resolved.at(-1);
      if (latestPrevious && startTime < latestPrevious.endTime) {
        startTime = latestPrevious.endTime;
      }
    }

    if (!isValidPlayDuration(startTime, endTime)) continue;

    resolved.push({ ...current, startTime, endTime });
  }

  return resolved;
}

/**
 * Closes tiny gaps between consecutive plays caused by float drift.
 * Intentional gaps from deleted plays are left unchanged.
 */
export function sealAdjacentPlayBoundaries<T extends PlayTimeRange>(
  plays: T[],
): T[] {
  if (plays.length < 2) {
    return plays.map((play) => ({
      ...play,
      startTime: snapGameTime(play.startTime),
      endTime: snapGameTime(play.endTime),
    }));
  }

  const sorted = sortPlays(plays).map((play) => ({
    ...play,
    startTime: snapGameTime(play.startTime),
    endTime: snapGameTime(play.endTime),
  }));
  const sealed: T[] = [];

  for (const play of sorted) {
    const previous = sealed.at(-1);

    if (previous) {
      const delta = snapGameTime(play.startTime - previous.endTime);
      if (delta > 0 && delta <= BOUNDARY_SEAL_EPSILON) {
        play.startTime = previous.endTime;
      }
    }

    if (!isValidPlayDuration(play.startTime, play.endTime)) continue;

    sealed.push(play);
  }

  return sealed;
}

export function hasPlayOverlaps(plays: PlayTimeRange[]): boolean {
  const sorted = sortPlays(plays);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.startTime < sorted[i - 1]!.endTime - BOUNDARY_SEAL_EPSILON) {
      return true;
    }
  }
  return false;
}

export function normalizePlaysForSave<T extends PlayDraft>(plays: T[]): T[] {
  return sealAdjacentPlayBoundaries(resolvePlayOverlaps(plays));
}

export function normalizeGamePlays<T extends PlayDraft>(
  plays: T[],
  clips: VideoClipRecord[] = [],
): T[] {
  const withoutWrappers =
    clips.length > 0 ? removeRedundantClipWrappers(plays, clips) : plays;
  const aligned =
    clips.length > 0
      ? alignPlayStartsToClipBoundaries(withoutWrappers, clips)
      : withoutWrappers;
  return normalizePlaysForSave(aligned);
}

/** Nudge play starts up to a clip boundary when float drift left them in the prior clip. */
function alignPlayStartsToClipBoundaries<T extends PlayTimeRange>(
  plays: T[],
  clips: VideoClipRecord[],
): T[] {
  const { entries } = buildClipLayout(clips);
  const boundaries = entries.slice(1).map((entry) => entry.gameStart);

  return plays.map((play) => {
    let startTime = snapGameTime(play.startTime);

    for (const boundary of boundaries) {
      const delta = boundary - startTime;
      if (delta > 0 && delta <= BOUNDARY_SEAL_EPSILON) {
        startTime = boundary;
        break;
      }
    }

    return {
      ...play,
      startTime,
      endTime: snapGameTime(play.endTime),
    };
  });
}

export function findPlayDraftByKey(
  plays: PlayDraft[],
  key: string,
): PlayDraft | undefined {
  return plays.find((play) => playIdentityKey(play) === key);
}
