import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { plays } from "@/db/schema";
import { isAdminAuthenticated } from "@/lib/auth";
import { sortPlays } from "@/lib/plays";

type RouteContext = { params: Promise<{ id: string }> };

type PlayUpdate = {
  id?: string;
  startTime: number;
  endTime: number;
  offenseTeam?: string | null;
  notes?: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id: gameId } = await context.params;
  const db = getDb();

  const game = await db.query.games.findFirst({
    where: (games, { eq: equals }) => equals(games.id, gameId),
    with: { plays: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json(sortPlays(game.plays));
}

export async function PUT(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId } = await context.params;
  const body = await request.json();
  const { plays: playUpdates } = body as { plays: PlayUpdate[] };

  if (!playUpdates) {
    return NextResponse.json({ error: "No plays provided" }, { status: 400 });
  }

  const db = getDb();
  const existing = await db.query.plays.findMany({
    where: eq(plays.gameId, gameId),
  });
  const existingById = new Map(existing.map((p) => [p.id, p]));

  const submittedIds = new Set(
    playUpdates.map((p) => p.id).filter((id): id is string => Boolean(id)),
  );
  const idsToDelete = existing
    .map((p) => p.id)
    .filter((id) => !submittedIds.has(id));

  if (idsToDelete.length > 0) {
    await db.delete(plays).where(inArray(plays.id, idsToDelete));
  }

  const results = [];

  for (const p of playUpdates) {
    const values = {
      startTime: p.startTime,
      endTime: p.endTime,
      offenseTeam: p.offenseTeam ?? null,
      notes: p.notes ?? null,
      updatedAt: new Date(),
    };

    if (p.id && existingById.has(p.id)) {
      const [updated] = await db
        .update(plays)
        .set(values)
        .where(eq(plays.id, p.id))
        .returning();
      results.push(updated);
    } else {
      const [inserted] = await db
        .insert(plays)
        .values({ ...values, gameId })
        .returning();
      results.push(inserted);
    }
  }

  return NextResponse.json(sortPlays(results));
}
