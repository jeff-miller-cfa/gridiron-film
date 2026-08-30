/**
 * Re-normalize and persist play boundaries for a game.
 *
 * Usage: npx dotenv -e .env.local -- npx tsx scripts/repair-plays.ts [gameId]
 */

import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { games, plays } from "../src/db/schema";
import { buildClipLayout, gameTimeToClipTime } from "../src/lib/clip-layout";
import { normalizeGamePlays } from "../src/lib/play-boundaries";
import { sortPlays } from "../src/lib/plays";

async function main() {
  const gameIdArg = process.argv[2];
  const db = getDb();

  const gameList = gameIdArg
    ? await db.query.games.findMany({
        where: eq(games.id, gameIdArg),
        with: {
          plays: true,
          videoClips: {
            orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
          },
        },
      })
    : await db.query.games.findMany({
        with: {
          plays: true,
          videoClips: {
            orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
          },
        },
      });

  for (const game of gameList) {
    const clips = game.videoClips ?? [];
    const raw = sortPlays(game.plays ?? []);
    const normalized = normalizeGamePlays(
      raw.map((play) => ({ ...play })),
      clips,
    );

    const { entries } = buildClipLayout(clips);
    let mismatches = 0;

    for (let i = 0; i < normalized.length; i++) {
      const play = normalized[i]!;
      const located = gameTimeToClipTime(play.startTime, clips);
      const clipIdx = entries.findIndex(
        (entry) => entry.clip.id === located?.clipId,
      );
      if (clipIdx !== i && clips.length === normalized.length) {
        mismatches++;
      }
    }

    const updates = normalized.filter((play, index) => {
      const original = raw[index];
      return (
        original &&
        (original.startTime !== play.startTime ||
          original.endTime !== play.endTime)
      );
    });

    console.log(
      `=== ${game.awayTeam} @ ${game.homeTeam} (${game.id}) ===`,
    );
    console.log(
      `plays: ${raw.length}, clip/play index mismatches after fix: ${mismatches}, rows to update: ${updates.length}`,
    );

    for (const play of updates) {
      await db
        .update(plays)
        .set({
          startTime: play.startTime,
          endTime: play.endTime,
        })
        .where(eq(plays.id, play.id!));
      console.log(
        `  updated play ${play.id}: ${play.startTime} - ${play.endTime}`,
      );
    }

    if (updates.length === 0) {
      console.log("  no database changes needed");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
