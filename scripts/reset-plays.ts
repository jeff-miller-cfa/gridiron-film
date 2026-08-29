/**
 * Reset plays for a game to one full-length play per clip on the game timeline.
 *
 * Usage:
 *   npm run reset-plays -- <gameId>
 *   npm run reset-plays              # only game in database
 */

import { resetGamePlays } from "../src/lib/reset-game-plays";
import { getDb } from "../src/db";
import { formatDuration } from "../src/lib/video";

async function main() {
  const gameIdArg = process.argv[2];

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  let gameId = gameIdArg;
  if (!gameId) {
    const db = getDb();
    const games = await db.query.games.findMany();
    if (games.length !== 1) {
      throw new Error(
        `Pass a game id. Found ${games.length} games: ${games.map((g) => g.id).join(", ")}`,
      );
    }
    gameId = games[0]!.id;
  }

  const result = await resetGamePlays(gameId);

  if (!result) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const { game, deletedCount, plays } = result;

  console.log(
    `Reset ${game.awayTeam} @ ${game.homeTeam}: removed ${deletedCount} plays, created ${plays.length} plays.`,
  );

  const orderedClips = [...game.videoClips].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  for (let i = 0; i < plays.length; i++) {
    const play = plays[i]!;
    const clip = orderedClips[i];
    console.log(
      `  ${clip?.filename ?? "clip"} (${formatDuration(play.startTime)} - ${formatDuration(play.endTime)})`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
