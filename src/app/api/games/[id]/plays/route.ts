import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plays } from "@/db/schema";
import { isAdminAuthenticated } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

type PlayUpdate = {
  id?: string;
  videoClipId: string;
  startTime: number;
  endTime: number;
  playNumber: number;
  offenseTeam?: string | null;
  notes?: string | null;
  sortOrder: number;
  deletedAt?: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id: gameId } = await context.params;
  const db = getDb();

  const gamePlays = await db.query.plays.findMany({
    where: eq(plays.gameId, gameId),
    orderBy: (plays, { asc }) => [asc(plays.sortOrder)],
    with: { videoClip: true },
  });

  return NextResponse.json(gamePlays);
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

  const results = [];

  for (const p of playUpdates) {
    const values = {
      videoClipId: p.videoClipId,
      startTime: p.startTime,
      endTime: p.endTime,
      playNumber: p.playNumber,
      offenseTeam: p.offenseTeam ?? null,
      notes: p.notes ?? null,
      sortOrder: p.sortOrder,
      deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
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

  return NextResponse.json(results);
}
