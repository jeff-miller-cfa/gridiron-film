export function playIdentityKey(play: {
  id?: string;
  clientKey?: string;
  videoClipId: string;
  startTime: number;
  endTime: number;
}): string {
  if (play.id) return play.id;
  if (play.clientKey) return `client:${play.clientKey}`;
  return `draft:${play.videoClipId}:${play.startTime}:${play.endTime}`;
}

export function comparePlaysByClipAndTime(
  a: { videoClipId: string; startTime: number },
  b: { videoClipId: string; startTime: number },
  orderedClipIds: string[],
): number {
  const clipRank = new Map(orderedClipIds.map((id, index) => [id, index]));
  const rankA = clipRank.get(a.videoClipId) ?? Number.MAX_SAFE_INTEGER;
  const rankB = clipRank.get(b.videoClipId) ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;
  if (a.startTime !== b.startTime) return a.startTime - b.startTime;
  return 0;
}

export function sortPlays<T extends { videoClipId: string; startTime: number }>(
  plays: T[],
  orderedClipIds: string[],
): T[] {
  return [...plays].sort((a, b) =>
    comparePlaysByClipAndTime(a, b, orderedClipIds),
  );
}

export function orderedClipIdsFromClips(
  clips: Array<{ id: string; sortOrder: number }>,
): string[] {
  return [...clips]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((clip) => clip.id);
}
