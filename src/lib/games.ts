import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { sortPlays } from "@/lib/plays";

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
    ...game,
    plays: sortPlays(game.plays),
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
    ...game,
    plays: sortPlays(game.plays),
  };
}
