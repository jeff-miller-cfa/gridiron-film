import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { videoClips } from "@/db/schema";
import { isAdminAuthenticated } from "@/lib/auth";
import { deleteAllGameClips } from "@/lib/delete-game-clips";
import {
  finalizeGameClips,
  insertGameClips,
  type ClipInput,
} from "@/lib/game-clips";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId } = await context.params;
  const body = await request.json();
  const { clips, createPlays, finalize } = body as {
    clips?: ClipInput[];
    createPlays?: boolean;
    finalize?: boolean;
  };

  if (finalize) {
    const result = await finalizeGameClips(gameId, {
      createPlays: Boolean(createPlays),
    });

    return NextResponse.json({
      finalized: true,
      clipCount: result.clipCount,
      plays: result.plays,
      deletedPlayCount: "deletedPlayCount" in result ? result.deletedPlayCount : 0,
    });
  }

  if (!clips?.length) {
    return NextResponse.json({ error: "No clips provided" }, { status: 400 });
  }

  const result = await insertGameClips(gameId, clips);

  return NextResponse.json({
    clips: result.clips,
    plays: [],
    skippedCount: result.skippedCount,
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: gameId } = await context.params;
  const db = getDb();

  const clips = await db.query.videoClips.findMany({
    where: eq(videoClips.gameId, gameId),
    orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
  });

  return NextResponse.json(clips);
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId } = await context.params;
  const result = await deleteAllGameClips(gameId);

  if (!result) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json({
    deletedCount: result.deletedCount,
  });
}
