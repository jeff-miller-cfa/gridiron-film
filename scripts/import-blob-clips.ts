/**
 * Import orphaned Vercel Blob clips into video_clips for a game.
 *
 * Usage:
 *   npm run import-blob-clips -- <gameId>
 *   npm run import-blob-clips -- <gameId> --reset-plays
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { list } from "@vercel/blob";
import { getDb } from "../src/db";
import {
  finalizeGameClips,
  insertGameClips,
  normalizeClipFilename,
} from "../src/lib/game-clips";

const execFileAsync = promisify(execFile);

type BlobRow = {
  pathname: string;
  url: string;
  uploadedAt: Date;
};

async function getDurationSeconds(url: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    url,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read duration for ${url}`);
  }
  return duration;
}

async function getCaptureTime(url: string, uploadedAt: Date): Promise<Date> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format_tags=creation_time",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      url,
    ]);
    const raw = stdout.trim();
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  } catch {
    // fall through
  }

  return uploadedAt;
}

function pickLatestBlobs(blobs: BlobRow[]): BlobRow[] {
  const byBase = new Map<string, BlobRow>();

  for (const blob of blobs) {
    const filename = blob.pathname.split("/").pop() ?? blob.pathname;
    const base = normalizeClipFilename(filename);
    const existing = byBase.get(base);
    if (!existing || blob.uploadedAt > existing.uploadedAt) {
      byBase.set(base, blob);
    }
  }

  return [...byBase.values()].sort((a, b) => a.pathname.localeCompare(b.pathname));
}

async function main() {
  const args = process.argv.slice(2);
  const gameId = args.find((arg) => !arg.startsWith("--"));
  const resetPlays = args.includes("--reset-plays");

  if (!gameId) {
    throw new Error("Usage: npm run import-blob-clips -- <gameId> [--reset-plays]");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required");
  }

  await execFileAsync("ffprobe", ["-version"]);

  const db = getDb();
  const game = await db.query.games.findFirst({
    where: (games, { eq }) => eq(games.id, gameId),
    with: { videoClips: true },
  });

  if (!game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const listed: BlobRow[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({
      prefix: `games/${gameId}/`,
      cursor,
      limit: 1000,
    });
    listed.push(
      ...page.blobs.map((blob) => ({
        pathname: blob.pathname,
        url: blob.url,
        uploadedAt: blob.uploadedAt,
      })),
    );
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const candidates = pickLatestBlobs(listed);
  const existingKeys = new Set(
    game.videoClips.map((clip) => normalizeClipFilename(clip.filename)),
  );
  const existingUrls = new Set(game.videoClips.map((clip) => clip.blobUrl));

  const missing = candidates.filter((blob) => {
    const filename = blob.pathname.split("/").pop() ?? blob.pathname;
    const base = normalizeClipFilename(filename);
    return !existingKeys.has(base) && !existingUrls.has(blob.url);
  });

  console.log(
    `Found ${listed.length} blob(s), ${candidates.length} unique clip name(s), ${missing.length} missing from database.`,
  );

  if (missing.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  const clips = [];

  for (const blob of missing) {
    const filename = blob.pathname.split("/").pop() ?? blob.pathname;
    const normalized = normalizeClipFilename(filename);
    process.stdout.write(`→ ${normalized} ... `);

    const duration = await getDurationSeconds(blob.url);
    const capturedAt = await getCaptureTime(blob.url, blob.uploadedAt);

    clips.push({
      blobUrl: blob.url,
      filename: normalized,
      capturedAt: capturedAt.toISOString(),
      duration,
    });

    console.log(`${duration.toFixed(1)}s`);
  }

  const inserted = await insertGameClips(gameId, clips);
  console.log(
    `Imported ${inserted.clips.length} clip record(s), skipped ${inserted.skippedCount}.`,
  );

  if (resetPlays) {
    const finalized = await finalizeGameClips(gameId, { createPlays: true });
    console.log(
      `Reset plays: removed ${finalized.deletedPlayCount}, created ${finalized.plays.length}.`,
    );
  } else {
    await finalizeGameClips(gameId, { createPlays: false });
    console.log("Reordered clips by capture time. Run with --reset-plays to rebuild plays.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
