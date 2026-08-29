import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { resetGamePlays } from "@/lib/reset-game-plays";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId } = await context.params;
  const result = await resetGamePlays(gameId);

  if (!result) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json({
    deletedCount: result.deletedCount,
    plays: result.plays,
  });
}
