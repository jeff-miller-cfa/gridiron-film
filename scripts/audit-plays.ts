/**
 * Audit play data for overlaps, wrapper conflicts, and clip mapping issues.
 *
 * Usage: npx dotenv -e .env.local -- npx tsx scripts/audit-plays.ts [gameId]
 */

import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { games } from "../src/db/schema";
import {
  buildClipLayout,
  gameTimeToClipTime,
  isFullClipWrapperPlay,
} from "../src/lib/clip-layout";
import { buildTimelines } from "../src/lib/player-timeline";
import {
  hasPlayOverlaps,
  normalizeGamePlays,
} from "../src/lib/play-boundaries";
import { sortPlays } from "../src/lib/plays";

async function main() {
  const gameIdArg = process.argv[2];
  const db = getDb();

  const gameList = gameIdArg
    ? await db.query.games.findMany({
        where: eq(games.id, gameIdArg),
        with: {
          plays: true,
          videoClips: {
            orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
          },
        },
      })
    : await db.query.games.findMany({
        with: {
          plays: true,
          videoClips: {
            orderBy: (videoClips, { asc }) => [asc(videoClips.sortOrder)],
          },
        },
      });

  for (const game of gameList) {
    const clips = game.videoClips ?? [];
    const raw = sortPlays(game.plays ?? []);
    const { entries, fullDuration } = buildClipLayout(clips);
    const normalized = normalizeGamePlays(
      raw.map((play) => ({ ...play })),
      clips,
    );
    const playRecords = normalized.map((play) => ({
      ...play,
      id: play.id!,
      gameId: game.id,
      offenseTeam: play.offenseTeam ?? null,
      notes: play.notes ?? null,
      createdAt: "",
      updatedAt: "",
    }));
    const { playSegments } = buildTimelines(clips, playRecords);

    console.log(`=== ${game.awayTeam} @ ${game.homeTeam} (${game.id}) ===`);
    console.log(
      `clips: ${clips.length}, fullDuration: ${fullDuration.toFixed(3)}`,
    );
    console.log(
      `raw plays: ${raw.length}, normalized: ${normalized.length}, overlaps raw: ${hasPlayOverlaps(raw)}, overlaps norm: ${hasPlayOverlaps(normalized)}`,
    );

    let issues = 0;

    for (const entry of entries) {
      const inClip = raw.filter(
        (play) =>
          play.endTime > entry.gameStart + 0.05 &&
          play.startTime < entry.gameEnd - 0.05,
      );
      const wrappers = inClip.filter((play) =>
        isFullClipWrapperPlay(play, entry),
      );
      const real = inClip.filter(
        (play) => !isFullClipWrapperPlay(play, entry),
      );
      if (wrappers.length > 0 && real.length > 0) {
        issues++;
        console.log(
          `CLIP CONFLICT ${entry.clip.filename}: ${wrappers.length} wrapper(s), ${real.length} real play(s)`,
        );
        for (const wrapper of wrappers) {
          console.log(
            `  wrapper ${wrapper.startTime} - ${wrapper.endTime} (${wrapper.id})`,
          );
        }
        for (const play of real) {
          console.log(
            `  real    ${play.startTime} - ${play.endTime} (${play.id})`,
          );
        }
      }
    }

    for (let i = 0; i < raw.length; i++) {
      for (let j = i + 1; j < raw.length; j++) {
        const a = raw[i]!;
        const b = raw[j]!;
        if (
          a.startTime < b.endTime - 0.05 &&
          b.startTime < a.endTime - 0.05
        ) {
          issues++;
          console.log(
            `OVERLAP play ${i + 1} (${a.startTime}-${a.endTime}) vs play ${j + 1} (${b.startTime}-${b.endTime})`,
          );
        }
      }
    }

    console.log("\nClip boundaries:");
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      console.log(
        `  Clip ${i + 1} (${entry.clip.filename}): game ${entry.gameStart.toFixed(3)}-${entry.gameEnd.toFixed(3)} (${entry.clip.duration.toFixed(3)}s)`,
      );
    }

    console.log("\nBoundary precision (plays 5-7 vs clips 5-6):");
    for (let i = 4; i <= 6; i++) {
      const play = raw[i];
      if (!play) continue;
      const located = gameTimeToClipTime(play.startTime, clips);
      const clipIdx = entries.findIndex(
        (entry) => entry.clip.id === located?.clipId,
      );
      console.log(
        `  Play ${i + 1} start=${play.startTime} (${JSON.stringify(play.startTime)}) end=${play.endTime} -> clip ${clipIdx + 1} @ ${located?.localTime}`,
      );
    }
    const clip5 = entries[4];
    const clip6 = entries[5];
    if (clip5 && clip6) {
      console.log(
        `  Clip 5 end=${clip5.gameEnd} (${JSON.stringify(clip5.gameEnd)})`,
      );
      console.log(
        `  Clip 6 start=${clip6.gameStart} (${JSON.stringify(clip6.gameStart)})`,
      );
      const play6 = raw[5];
      if (play6) {
        console.log(
          `  play6.start < clip5.end: ${play6.startTime < clip5.gameEnd}`,
        );
        console.log(
          `  play6.start >= clip6.start: ${play6.startTime >= clip6.gameStart}`,
        );
      }
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      console.log(
        `  Clip ${i + 1} (${entry.clip.filename}): game ${entry.gameStart.toFixed(3)}-${entry.gameEnd.toFixed(3)} (${entry.clip.duration.toFixed(3)}s)`,
      );
    }

    console.log("\nPlay -> clip mapping:");
    for (const segment of playSegments) {
      const located = gameTimeToClipTime(segment.globalStart, clips);
      const clipIdx = entries.findIndex(
        (entry) => entry.clip.id === located?.clipId,
      );
      const mismatch = clipIdx + 1 !== segment.playNumber;
      if (mismatch) {
        issues++;
        console.log(
          `  MISMATCH Play ${segment.playNumber}: ${segment.globalStart.toFixed(3)}-${segment.globalEnd.toFixed(3)} (${segment.duration.toFixed(3)}s) -> clip ${clipIdx + 1} @ ${located?.localTime.toFixed(3)}s`,
        );
      } else {
        console.log(
          `  Play ${segment.playNumber}: ${segment.globalStart.toFixed(3)}-${segment.globalEnd.toFixed(3)} (${segment.duration.toFixed(3)}s) -> clip ${clipIdx + 1} @ ${located?.localTime.toFixed(3)}s`,
        );
      }
    }

    if (raw.length !== normalized.length) {
      issues++;
      console.log(
        `COUNT CHANGE after normalize: ${raw.length} -> ${normalized.length}`,
      );
    }

    console.log(issues > 0 ? `Found ${issues} issue group(s)\n` : "No issues\n");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
