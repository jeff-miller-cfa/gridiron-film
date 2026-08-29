import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";

export async function getAllGames() {
  const db = getDb();
  return db.query.games.findMany({
    orderBy: [desc(games.gameDateTime)],
    with: {
      plays: {
        orderBy: (plays, { asc }) => [asc(plays.sortOrder)],
      },
      videoClips: {
        orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
      },
    },
  });
}

export async function getGameById(id: string) {
  const db = getDb();
  return db.query.games.findFirst({
    where: eq(games.id, id),
    with: {
      videoClips: {
        orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
      },
      plays: {
        orderBy: (plays, { asc }) => [asc(plays.sortOrder)],
        with: { videoClip: true },
      },
    },
  });
}
