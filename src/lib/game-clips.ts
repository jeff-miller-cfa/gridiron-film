import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plays, videoClips } from "@/db/schema";
import { resetGamePlays } from "@/lib/reset-game-plays";
import { captureTimesMatch } from "@/lib/video";

export type ClipInput = {
  blobUrl: string;
  filename: string;
  capturedAt: string | Date;
  duration: number;
};

export function normalizeClipFilename(filename: string): string {
  const withoutSuffix = filename.replace(/-[A-Za-z0-9]+\.mp4$/i, ".mp4");
  const match = withoutSuffix.match(/^(MVI_\d+)\.mp4$/i);
  if (match) return `${match[1]!.toUpperCase()}.mp4`;
  return withoutSuffix;
}

function clipAlreadyStored(
  clip: ClipInput,
  existing: Array<{
    blobUrl: string;
    filename: string;
    capturedAt: Date;
  }>,
): boolean {
  const normalized = normalizeClipFilename(clip.filename);

  return existing.some(
    (row) =>
      row.blobUrl === clip.blobUrl ||
      captureTimesMatch(clip.capturedAt, row.capturedAt) ||
      normalizeClipFilename(row.filename) === normalized,
  );
}

export async function reorderGameClipsByCaptureTime(gameId: string) {
  const db = getDb();
  const clips = await db.query.videoClips.findMany({
    where: eq(videoClips.gameId, gameId),
    orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
  });

  const sorted = [...clips].sort(
    (a, b) =>
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );

  for (let index = 0; index < sorted.length; index++) {
    const clip = sorted[index]!;
    if (clip.sortOrder === index) continue;

    await db
      .update(videoClips)
      .set({ sortOrder: index })
      .where(eq(videoClips.id, clip.id));
  }

  return sorted.length;
}

export async function insertGameClips(gameId: string, clips: ClipInput[]) {
  const db = getDb();
  const existing = await db.query.videoClips.findMany({
    where: eq(videoClips.gameId, gameId),
  });

  const sorted = [...clips].sort(
    (a, b) =>
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );

  const newClips = sorted.filter((clip) => !clipAlreadyStored(clip, existing));

  if (newClips.length === 0) {
    return {
      clips: [] as (typeof videoClips.$inferSelect)[],
      skippedCount: sorted.length,
    };
  }

  const startOrder = existing.length;
  const insertedClips = await db
    .insert(videoClips)
    .values(
      newClips.map((clip, index) => ({
        gameId,
        blobUrl: clip.blobUrl,
        filename: normalizeClipFilename(clip.filename),
        capturedAt: new Date(clip.capturedAt),
        duration: clip.duration,
        sortOrder: startOrder + index,
      })),
    )
    .returning();

  await reorderGameClipsByCaptureTime(gameId);

  return {
    clips: insertedClips,
    skippedCount: sorted.length - newClips.length,
  };
}

export async function finalizeGameClips(
  gameId: string,
  options?: { createPlays?: boolean },
) {
  const clipCount = await reorderGameClipsByCaptureTime(gameId);

  if (!options?.createPlays) {
    return {
      clipCount,
      plays: [] as (typeof plays.$inferSelect)[],
      deletedPlayCount: 0,
    };
  }

  const reset = await resetGamePlays(gameId);
  return {
    clipCount,
    plays: reset?.plays ?? [],
    deletedPlayCount: reset?.deletedCount ?? 0,
  };
}
