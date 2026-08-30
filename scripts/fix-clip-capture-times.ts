/**
 * Repair corrupted clip `capturedAt` values from the original camera files,
 * reorder clips by their true capture time, and remap plays so every play
 * stays anchored to the exact footage it was marked on.
 *
 * Background: clips whose original MP4/MOV metadata was unreadable at upload
 * fell back to `file.lastModified` (the transfer time), which scrambled clip
 * order. The originals still carry the real `creation_time`, so we read it back
 * from disk (ffprobe), rewrite `capturedAt`, and re-sort.
 *
 * Plays are stored in game-time (the concatenation of clips in sortOrder), so
 * reordering clips WOULD misalign them — we remap each play by resolving it to
 * its clip + local offset under the OLD layout and re-projecting it into the
 * NEW layout, preserving its duration and clip association.
 *
 * DRY RUN BY DEFAULT — pass --apply to write. A JSON backup of the affected
 * clips and plays is written before any changes.
 *
 * Requires: ffprobe on PATH, DATABASE_URL in .env.local.
 *
 * Usage:
 *   npm run fix-clip-capture-times -- <gameId> --source <dir>            # dry run
 *   npm run fix-clip-capture-times -- <gameId> --source <dir> --apply    # write
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { plays as playsTable, videoClips } from "../src/db/schema";

const execFileAsync = promisify(execFile);

const VIDEO_EXTS = new Set([".mov", ".mp4", ".m4v", ".avi", ".mts", ".m2ts"]);
const DURATION_TOLERANCE_S = 1.0;

type ClipRow = typeof videoClips.$inferSelect;
type PlayRow = typeof playsTable.$inferSelect;

function snap(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/** Camera base stem, e.g. "MVI_0280.mp4" -> "MVI_0280". */
function baseStem(filename: string): string {
  return basename(filename, extname(filename)).toUpperCase();
}

async function readCreationTime(path: string): Promise<Date | null> {
  const entries = ["format_tags=creation_time", "stream_tags=creation_time"];
  for (const show of entries) {
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        show,
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
      ]);
      const raw = stdout.trim().split("\n")[0]?.trim();
      if (raw) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > 0) {
          return parsed;
        }
      }
    } catch {
      // try next entry / fall through
    }
  }
  return null;
}

async function readDuration(path: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    const value = Number(stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Cumulative game-time offsets for clips laid out in the given order. */
function buildOffsets(orderedClips: ClipRow[]) {
  const offsets = new Map<string, { gameStart: number; gameEnd: number }>();
  let offset = 0;
  for (const clip of orderedClips) {
    const gameStart = snap(offset);
    offset += clip.duration;
    offsets.set(clip.id, { gameStart, gameEnd: snap(offset) });
  }
  return { offsets, fullDuration: snap(offset) };
}

/** Resolve a game-time to its clip + local offset under a given layout. */
function resolveClip(
  gameTime: number,
  orderedClips: ClipRow[],
  offsets: Map<string, { gameStart: number; gameEnd: number }>,
  fullDuration: number,
) {
  const clamped = snap(Math.max(0, Math.min(gameTime, fullDuration)));
  for (const clip of orderedClips) {
    const o = offsets.get(clip.id)!;
    if (clamped >= o.gameStart && clamped < o.gameEnd) {
      return { clip, local: snap(clamped - o.gameStart) };
    }
  }
  const last = orderedClips[orderedClips.length - 1]!;
  const o = offsets.get(last.id)!;
  return { clip: last, local: snap(Math.max(0, clamped - o.gameStart)) };
}

function fmt(d: Date): string {
  return d.toISOString();
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const gameId = args.find((a) => !a.startsWith("--"));
  const sourceIdx = args.indexOf("--source");
  const sourceDir = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;

  if (!gameId || !sourceDir) {
    throw new Error(
      "Usage: npm run fix-clip-capture-times -- <gameId> --source <dir> [--apply]",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  await execFileAsync("ffprobe", ["-version"]);

  const db = getDb();

  const clips = await db.query.videoClips.findMany({
    where: eq(videoClips.gameId, gameId),
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  });
  if (clips.length === 0) throw new Error(`No clips found for game ${gameId}`);

  const plays = await db.query.plays.findMany({
    where: eq(playsTable.gameId, gameId),
  });

  console.log(`\n${apply ? "APPLY" : "DRY RUN"} — game ${gameId}`);
  console.log(`Clips: ${clips.length} | Plays: ${plays.length}`);
  console.log(`Source: ${sourceDir}\n`);

  // ---- Index original files by base stem ----------------------------------
  const dirEntries = await readdir(sourceDir);
  const originalsByStem = new Map<string, string>();
  for (const name of dirEntries) {
    if (!VIDEO_EXTS.has(extname(name).toLowerCase())) continue;
    originalsByStem.set(baseStem(name), join(sourceDir, name));
  }

  // ---- Resolve true capture time for every clip ---------------------------
  const problems: string[] = [];
  const resolved: {
    clip: ClipRow;
    original: string;
    trueCapturedAt: Date;
    origDuration: number;
  }[] = [];

  for (const clip of clips) {
    const stem = baseStem(clip.filename);
    const original = originalsByStem.get(stem);
    if (!original) {
      problems.push(`No original file found for "${clip.filename}" (stem ${stem})`);
      continue;
    }
    const [trueCapturedAt, origDuration] = await Promise.all([
      readCreationTime(original),
      readDuration(original),
    ]);
    if (!trueCapturedAt) {
      problems.push(`"${clip.filename}" — original ${basename(original)} has no creation_time`);
      continue;
    }
    if (origDuration == null) {
      problems.push(`"${clip.filename}" — could not read duration of ${basename(original)}`);
      continue;
    }
    if (Math.abs(origDuration - clip.duration) > DURATION_TOLERANCE_S) {
      problems.push(
        `"${clip.filename}" — duration mismatch: db ${clip.duration.toFixed(2)}s vs original ${origDuration.toFixed(2)}s (possible wrong file match)`,
      );
      continue;
    }
    resolved.push({ clip, original, trueCapturedAt, origDuration });
  }

  if (problems.length > 0) {
    console.error("ABORT — could not safely resolve every clip:\n");
    problems.forEach((p) => console.error(`  • ${p}`));
    console.error(
      `\nResolved ${resolved.length}/${clips.length}. No changes made. Fix the above and re-run.`,
    );
    process.exit(1);
  }

  // ---- Build OLD and NEW layouts ------------------------------------------
  const oldOrdered = [...clips].sort((a, b) => a.sortOrder - b.sortOrder);
  const oldLayout = buildOffsets(oldOrdered);

  const newOrdered = [...resolved]
    .sort((a, b) => a.trueCapturedAt.getTime() - b.trueCapturedAt.getTime())
    .map((r) => ({ ...r.clip, capturedAt: r.trueCapturedAt }) as ClipRow);
  const newLayout = buildOffsets(newOrdered);
  const newSortById = new Map(newOrdered.map((c, i) => [c.id, i]));
  const trueTimeById = new Map(resolved.map((r) => [r.clip.id, r.trueCapturedAt]));

  // ---- Clip change report --------------------------------------------------
  const clipUpdates: { id: string; capturedAt: Date; sortOrder: number }[] = [];
  let clipCapturedChanged = 0;
  let clipMoved = 0;

  console.log("== CLIP CHANGES ==");
  console.log("newSort | file        | old capturedAt        -> new capturedAt       | oldSort->newSort");
  for (const c of newOrdered) {
    const newSort = newSortById.get(c.id)!;
    const trueTime = trueTimeById.get(c.id)!;
    const origClip = clips.find((x) => x.id === c.id)!;
    const capChanged = new Date(origClip.capturedAt).getTime() !== trueTime.getTime();
    const moved = origClip.sortOrder !== newSort;
    if (capChanged) clipCapturedChanged++;
    if (moved) clipMoved++;
    clipUpdates.push({ id: c.id, capturedAt: trueTime, sortOrder: newSort });
    if (capChanged || moved) {
      console.log(
        `${String(newSort).padStart(4)}   | ${origClip.filename.padEnd(11)} | ${fmt(new Date(origClip.capturedAt))} -> ${fmt(trueTime)} | ${origClip.sortOrder}->${newSort}`,
      );
    }
  }
  console.log(
    `\n${clipCapturedChanged} capturedAt corrected, ${clipMoved} reordered, ${clips.length - clipMoved} unchanged position.`,
  );

  // ---- Play remap ----------------------------------------------------------
  const playUpdates: { id: string; startTime: number; endTime: number }[] = [];
  let playsChanged = 0;
  let boundaryCrossers = 0;
  const samples: string[] = [];

  for (const play of plays as PlayRow[]) {
    const startRes = resolveClip(
      play.startTime,
      oldOrdered,
      oldLayout.offsets,
      oldLayout.fullDuration,
    );
    // Detect (report only) plays that spanned more than one clip in the old layout.
    const endResForCheck = resolveClip(
      Math.max(play.startTime, play.endTime - 0.001),
      oldOrdered,
      oldLayout.offsets,
      oldLayout.fullDuration,
    );
    if (endResForCheck.clip.id !== startRes.clip.id) boundaryCrossers++;

    const duration = snap(play.endTime - play.startTime);
    const newClipStart = newLayout.offsets.get(startRes.clip.id)!.gameStart;
    const newStart = snap(newClipStart + startRes.local);
    const newEnd = snap(newStart + duration);

    if (newStart !== play.startTime || newEnd !== play.endTime) playsChanged++;
    playUpdates.push({ id: play.id, startTime: newStart, endTime: newEnd });

    if (samples.length < 8 && (newStart !== play.startTime)) {
      samples.push(
        `  ${startRes.clip.filename} @+${startRes.local.toFixed(1)}s  game ${mmss(play.startTime)}–${mmss(play.endTime)} -> ${mmss(newStart)}–${mmss(newEnd)}  (dur ${duration.toFixed(1)}s kept)`,
      );
    }
  }

  console.log("\n== PLAY REMAP ==");
  console.log(
    `${playsChanged}/${plays.length} plays move to new game-time (duration + clip association preserved).`,
  );
  console.log(
    boundaryCrossers === 0
      ? "  ✓ 0 plays span more than one clip — every play is fully contained in a single clip."
      : `  ⚠ ${boundaryCrossers} play(s) spanned a clip boundary in the old layout; each is anchored to its START clip and keeps its duration (see below).`,
  );
  if (samples.length) {
    console.log("Sample remaps:");
    samples.forEach((s) => console.log(s));
  }

  // ---- Post-change validation ---------------------------------------------
  const errors: string[] = [];
  // Spanning plays can't be remapped unambiguously (their end would land in a
  // different clip after reordering). Refuse rather than risk the layout.
  if (boundaryCrossers > 0) {
    errors.push(
      `${boundaryCrossers} play(s) span more than one clip — resolve these manually before migrating`,
    );
  }
  // clip sortOrder strictly follows capturedAt
  const check = [...clipUpdates].sort((a, b) => a.sortOrder - b.sortOrder);
  for (let i = 1; i < check.length; i++) {
    if (check[i]!.capturedAt.getTime() < check[i - 1]!.capturedAt.getTime()) {
      errors.push("sortOrder not monotonic with capturedAt");
      break;
    }
  }
  const sortSet = new Set(clipUpdates.map((c) => c.sortOrder));
  if (sortSet.size !== clips.length) errors.push("duplicate/missing sortOrder");
  if (playUpdates.length !== plays.length) errors.push("play count changed");
  // durations preserved per play
  for (let i = 0; i < plays.length; i++) {
    const oldDur = snap((plays[i] as PlayRow).endTime - (plays[i] as PlayRow).startTime);
    const newDur = snap(playUpdates[i]!.endTime - playUpdates[i]!.startTime);
    if (Math.abs(oldDur - newDur) > 0.002) {
      errors.push(`play ${plays[i]!.id} duration changed ${oldDur}->${newDur}`);
    }
  }

  console.log("\n== VALIDATION ==");
  if (errors.length) {
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    console.error("\nValidation failed — no changes written.");
    process.exit(1);
  }
  console.log("  ✓ clip sortOrder strictly increases with capturedAt");
  console.log("  ✓ sortOrder values unique and complete");
  console.log("  ✓ play count unchanged and every play duration preserved");

  if (!apply) {
    console.log("\nDRY RUN complete — no changes written. Re-run with --apply to commit.");
    return;
  }

  // ---- Backup then write atomically (neon-http batch) ----------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(process.cwd(), `clip-capture-backup-${gameId}-${stamp}.json`);
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        gameId,
        takenAt: new Date().toISOString(),
        clips: clips.map((c) => ({
          id: c.id,
          filename: c.filename,
          capturedAt: c.capturedAt,
          sortOrder: c.sortOrder,
        })),
        plays: plays.map((p) => ({
          id: p.id,
          startTime: p.startTime,
          endTime: p.endTime,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nBackup written: ${backupPath}`);

  const now = new Date();
  const statements = [
    ...clipUpdates.map((u) =>
      db
        .update(videoClips)
        .set({ capturedAt: u.capturedAt, sortOrder: u.sortOrder })
        .where(eq(videoClips.id, u.id)),
    ),
    ...playUpdates.map((u) =>
      db
        .update(playsTable)
        .set({ startTime: u.startTime, endTime: u.endTime, updatedAt: now })
        .where(eq(playsTable.id, u.id)),
    ),
  ] as const;

  // neon-http batch runs all statements in a single transaction.
  await db.batch(statements as unknown as [(typeof statements)[number]]);

  console.log(
    `APPLIED — updated ${clipUpdates.length} clips and ${playUpdates.length} plays.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
