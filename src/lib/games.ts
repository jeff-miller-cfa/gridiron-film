import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { normalizePlayLookbackSeconds } from "@/lib/game-settings";
import { normalizeGamePlays } from "@/lib/play-boundaries";
import { sortPlays } from "@/lib/plays";

function normalizeGameRecord<T extends {
  playLookbackSeconds?: number | null;
  viewerAudioMuted?: boolean | null;
}>(game: T) {
  return {
    ...game,
    playLookbackSeconds: normalizePlayLookbackSeconds(
      game.playLookbackSeconds ?? undefined,
    ),
    viewerAudioMuted: Boolean(game.viewerAudioMuted),
  };
}

export async function getAllGames() {
  const db = getDb();
  const results = await db.query.games.findMany({
    orderBy: [desc(games.gameDateTime)],
    with: {
      plays: true,
      videoClips: {
        orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
      },
    },
  });

  return results.map((game) => ({
    ...normalizeGameRecord(game),
    plays: normalizeGamePlays(sortPlays(game.plays), game.videoClips ?? []),
  }));
}

export async function getGameById(id: string) {
  const db = getDb();
  const game = await db.query.games.findFirst({
    where: eq(games.id, id),
    with: {
      videoClips: {
        orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
      },
      plays: true,
    },
  });

  if (!game) return null;

  return {
    ...normalizeGameRecord(game),
    plays: normalizeGamePlays(sortPlays(game.plays), game.videoClips ?? []),
  };
}
