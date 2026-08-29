/**
 * One-off script to recompress existing Vercel Blob clips to web-friendly MP4.
 *
 * Usage:
 *   npm run recompress-clips              # all clips
 *   npm run recompress-clips -- <gameId>  # one game
 *   npm run recompress-clips -- --dry-run
 *
 * Requires: ffmpeg + ffprobe on PATH, DATABASE_URL and BLOB_READ_WRITE_TOKEN in .env.local
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";
import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";

const execFileAsync = promisify(execFile);

function outputFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "") || "clip";
  return `${base}.mp4`;
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }

  await writeFile(dest, Buffer.from(await response.arrayBuffer()));
}

async function getDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read duration for ${filePath}`);
  }
  return duration;
}

async function compressVideo(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ]);
}

async function assertFfmpegAvailable(): Promise<void> {
  await execFileAsync("ffmpeg", ["-version"]);
  await execFileAsync("ffprobe", ["-version"]);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const gameId = args.find((arg) => arg !== "--dry-run");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required");
  }

  await assertFfmpegAvailable();

  const db = drizzle(neon(process.env.DATABASE_URL), { schema });
  const clips = gameId
    ? await db.query.videoClips.findMany({
        where: eq(schema.videoClips.gameId, gameId),
        orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
      })
    : await db.query.videoClips.findMany({
        orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
      });

  if (clips.length === 0) {
    console.log("No clips found.");
    return;
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Processing ${clips.length} clip(s)${
      gameId ? ` for game ${gameId}` : ""
    }...`,
  );

  let updated = 0;
  let skipped = 0;

  for (const clip of clips) {
    const workDir = await mkdtemp(join(tmpdir(), "gridiron-recompress-"));
    const inputPath = join(workDir, clip.filename);
    const outputPath = join(workDir, outputFilename(clip.filename));

    try {
      console.log(`\n→ ${clip.filename}`);
      await downloadFile(clip.blobUrl, inputPath);
      const inputStats = await stat(inputPath);

      if (dryRun) {
        console.log(
          `  would compress ${formatSize(inputStats.size)} → MP4 and replace blob`,
        );
        updated += 1;
        continue;
      }

      console.log(`  compressing ${formatSize(inputStats.size)}...`);
      await compressVideo(inputPath, outputPath);

      const outputStats = await stat(outputPath);
      const duration = await getDurationSeconds(outputPath);
      const nextFilename = outputFilename(clip.filename);
      const fileBuffer = await readFile(outputPath);

      console.log(`  uploading ${formatSize(outputStats.size)}...`);
      const blob = await put(`games/${clip.gameId}/${nextFilename}`, fileBuffer, {
        access: "public",
        addRandomSuffix: true,
        contentType: "video/mp4",
      });

      const oldDuration = clip.duration;

      await db
        .update(schema.videoClips)
        .set({
          blobUrl: blob.url,
          filename: nextFilename,
          duration,
        })
        .where(eq(schema.videoClips.id, clip.id));

      const gameClips = await db.query.videoClips.findMany({
        where: eq(schema.videoClips.gameId, clip.gameId),
        orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
      });

      let gameStart = 0;
      for (const row of gameClips) {
        if (row.id === clip.id) break;
        gameStart += row.duration;
      }

      const oldClipEnd = gameStart + oldDuration;
      const newClipEnd = gameStart + duration;
      const delta = duration - oldDuration;

      const gamePlays = await db.query.plays.findMany({
        where: eq(schema.plays.gameId, clip.gameId),
      });

      for (const play of gamePlays) {
        let nextStart = play.startTime;
        let nextEnd = play.endTime;

        if (nextEnd <= gameStart) {
          continue;
        }

        if (nextStart >= oldClipEnd) {
          nextStart += delta;
          nextEnd += delta;
        } else if (nextStart >= gameStart && nextEnd <= oldClipEnd) {
          nextEnd = Math.min(nextEnd, newClipEnd);
        } else if (nextStart < gameStart && nextEnd > oldClipEnd) {
          nextEnd += delta;
        } else if (nextStart >= gameStart && nextStart < oldClipEnd && nextEnd > oldClipEnd) {
          nextEnd += delta;
        } else if (nextStart < gameStart && nextEnd > gameStart) {
          nextEnd = Math.min(nextEnd, newClipEnd);
        }

        nextEnd = Math.max(nextStart, nextEnd);

        if (nextStart !== play.startTime || nextEnd !== play.endTime) {
          await db
            .update(schema.plays)
            .set({
              startTime: nextStart,
              endTime: nextEnd,
              updatedAt: new Date(),
            })
            .where(eq(schema.plays.id, play.id));
        }
      }

      if (clip.blobUrl !== blob.url) {
        try {
          await del(clip.blobUrl);
        } catch {
          console.log("  warning: could not delete old blob");
        }
      }

      console.log(
        `  done: ${formatSize(inputStats.size)} → ${formatSize(outputStats.size)}`,
      );
      updated += 1;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  console.log(
    `\nFinished. ${updated} processed, ${skipped} skipped, ${clips.length} total.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
