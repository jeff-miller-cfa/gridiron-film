import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games, plays } from "@/db/schema";

export async function resetGamePlays(gameId: string) {
  const db = getDb();

  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: {
      videoClips: {
        orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
      },
    },
  });

  if (!game) return null;

  const deleted = await db
    .delete(plays)
    .where(eq(plays.gameId, gameId))
    .returning({ id: plays.id });

  const newPlays = game.videoClips.map((clip) => ({
    gameId,
    videoClipId: clip.id,
    startTime: 0,
    endTime: clip.duration,
  }));

  const inserted =
    newPlays.length > 0
      ? await db.insert(plays).values(newPlays).returning()
      : [];

  return {
    game,
    deletedCount: deleted.length,
    plays: inserted,
  };
}
