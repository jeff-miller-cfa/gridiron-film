export function playIdentityKey(play: {
  id?: string;
  clientKey?: string;
  startTime: number;
  endTime: number;
}): string {
  if (play.id) return play.id;
  if (play.clientKey) return `client:${play.clientKey}`;
  return `draft:${play.startTime}:${play.endTime}`;
}

export function sortPlays<T extends { startTime: number }>(plays: T[]): T[] {
  return [...plays].sort((a, b) => a.startTime - b.startTime);
}

export function orderedClipIdsFromClips(
  clips: Array<{ id: string; sortOrder: number }>,
): string[] {
  return [...clips]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((clip) => clip.id);
}
