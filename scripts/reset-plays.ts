/**
 * Reset plays for a game to one full-length play per clip.
 *
 * Usage:
 *   npm run reset-plays -- <gameId>
 *   npm run reset-plays              # only game in database
 */

import { resetGamePlays } from "../src/lib/reset-game-plays";
import { getDb } from "../src/db";

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

  for (const play of plays) {
    const clip = game.videoClips.find((c) => c.id === play.videoClipId);
    console.log(
      `  ${clip?.filename ?? play.videoClipId} (0:00 - ${clip?.duration ?? play.endTime}s)`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
