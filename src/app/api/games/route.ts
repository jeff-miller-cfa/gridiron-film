import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { isAdminAuthenticated } from "@/lib/auth";

export async function GET() {
  const db = getDb();
  const allGames = await db.query.games.findMany({
    orderBy: [desc(games.gameDateTime)],
    with: {
      plays: {
        orderBy: (plays, { asc: a }) => [a(plays.sortOrder)],
      },
      videoClips: {
        orderBy: (videoClips, { asc: a }) => [a(videoClips.sortOrder)],
      },
    },
  });

  return NextResponse.json(allGames);
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { stadium, homeTeam, awayTeam, gameDateTime } = body;

  if (!stadium || !homeTeam || !awayTeam || !gameDateTime) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = getDb();
  const [game] = await db
    .insert(games)
    .values({
      stadium,
      homeTeam,
      awayTeam,
      gameDateTime: new Date(gameDateTime),
    })
    .returning();

  return NextResponse.json(game, { status: 201 });
}
