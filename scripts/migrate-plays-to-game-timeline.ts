/**
 * Migrate plays from clip-local timestamps to game-timeline offsets.
 *
 * Run once before `npm run db:push` after removing video_clip_id from schema.
 *
 * Usage:
 *   npm run migrate-plays -- [gameId]
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { plays, videoClips } from "../src/db/schema";

type LegacyPlayRow = {
  id: string;
  game_id: string;
  video_clip_id: string | null;
  start_time: number;
  end_time: number;
};

async function main() {
  const gameIdArg = process.argv[2];

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const db = getDb();

  const columnCheck = await db.execute<{ column_name: string }>(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'plays' AND column_name = 'video_clip_id'
  `);

  const hasLegacyColumn =
    Array.isArray(columnCheck.rows) && columnCheck.rows.length > 0;

  if (!hasLegacyColumn) {
    console.log("No video_clip_id column — nothing to migrate.");
    return;
  }

  const allPlays = gameIdArg
    ? await db.query.plays.findMany({ where: eq(plays.gameId, gameIdArg) })
    : await db.query.plays.findMany();

  if (allPlays.length === 0) {
    console.log("No plays to migrate.");
    return;
  }

  const gameIds = gameIdArg
    ? [gameIdArg]
    : [...new Set(allPlays.map((play) => play.gameId))];

  let migrated = 0;

  for (const gameId of gameIds) {
    const clips = await db.query.videoClips.findMany({
      where: eq(videoClips.gameId, gameId),
      orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
    });

    const clipOffsets = new Map<string, number>();
    let offset = 0;
    for (const clip of clips) {
      clipOffsets.set(clip.id, offset);
      offset += clip.duration;
    }

    const legacyRows = await db.execute<LegacyPlayRow>(sql`
      SELECT id, game_id, video_clip_id, start_time, end_time
      FROM plays
      WHERE game_id = ${gameId}
    `);

    const rows = Array.isArray(legacyRows.rows) ? legacyRows.rows : [];

    for (const row of rows) {
      if (!row.video_clip_id) continue;

      const clipOffset = clipOffsets.get(row.video_clip_id);
      if (clipOffset === undefined) {
        console.warn(
          `  skip play ${row.id}: unknown clip ${row.video_clip_id}`,
        );
        continue;
      }

      const startTime = clipOffset + row.start_time;
      const endTime = clipOffset + row.end_time;

      await db.execute(sql`
        UPDATE plays
        SET start_time = ${startTime},
            end_time = ${endTime},
            updated_at = NOW()
        WHERE id = ${row.id}
      `);
      migrated += 1;
    }

    console.log(`Migrated ${rows.length} plays for game ${gameId}`);
  }

  console.log(`Done. Updated ${migrated} plays to game-timeline offsets.`);
  console.log("Run `npm run db:push` to drop video_clip_id.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
