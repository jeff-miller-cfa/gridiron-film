import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games, videoClips } from "@/db/schema";

export async function deleteAllGameClips(gameId: string) {
  const db = getDb();

  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: {
      videoClips: true,
    },
  });

  if (!game) return null;

  const blobUrls = game.videoClips.map((clip) => clip.blobUrl);

  const deleted = await db
    .delete(videoClips)
    .where(eq(videoClips.gameId, gameId))
    .returning({ id: videoClips.id });

  for (const blobUrl of blobUrls) {
    try {
      await del(blobUrl);
    } catch {
      // Blob may already be gone; DB rows are already removed.
    }
  }

  return {
    game,
    deletedCount: deleted.length,
  };
}
