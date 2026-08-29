import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plays, videoClips } from "@/db/schema";
import { isAdminAuthenticated } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId } = await context.params;
  const body = await request.json();
  const { clips } = body as {
    clips: Array<{
      blobUrl: string;
      filename: string;
      capturedAt: string;
      duration: number;
    }>;
  };

  if (!clips?.length) {
    return NextResponse.json({ error: "No clips provided" }, { status: 400 });
  }

  const db = getDb();
  const existing = await db.query.videoClips.findMany({
    where: eq(videoClips.gameId, gameId),
  });
  const startOrder = existing.length;

  const sorted = [...clips].sort(
    (a, b) =>
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );

  const insertedClips = await db
    .insert(videoClips)
    .values(
      sorted.map((clip, index) => ({
        gameId,
        blobUrl: clip.blobUrl,
        filename: clip.filename,
        capturedAt: new Date(clip.capturedAt),
        duration: clip.duration,
        sortOrder: startOrder + index,
      })),
    )
    .returning();

  const existingPlays = await db.query.plays.findMany({
    where: eq(plays.gameId, gameId),
  });
  let playNumber = existingPlays.length;

  const newPlays = insertedClips.map((clip, index) => ({
    gameId,
    videoClipId: clip.id,
    startTime: 0,
    endTime: clip.duration,
    playNumber: playNumber + index + 1,
    sortOrder: playNumber + index,
  }));

  const insertedPlays = await db.insert(plays).values(newPlays).returning();

  return NextResponse.json({ clips: insertedClips, plays: insertedPlays });
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
