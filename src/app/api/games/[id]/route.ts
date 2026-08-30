import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { isAdminAuthenticated } from "@/lib/auth";
import { parseGameUpdateInput } from "@/lib/game-update";
import { getGameById } from "@/lib/games";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const game = await getGameById(id);

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json(game);
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { data, error } = parseGameUpdateInput(body);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db
    .update(games)
    .set({
      ...data,
      gameDateTime: data.gameDateTime ? new Date(data.gameDateTime) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(games.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const game = await getGameById(id);
  return NextResponse.json(game ?? updated);
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getDb();
  await db.delete(games).where(eq(games.id, id));
  return NextResponse.json({ ok: true });
}
