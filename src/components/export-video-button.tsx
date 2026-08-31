"use client";

import { useState } from "react";
import { fetchFile } from "@ffmpeg/util";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { slicesForGameRange } from "@/lib/clip-layout";
import { sortPlays } from "@/lib/plays";
import { getClipPlaybackUrl } from "@/lib/clip-cache";
import { getExportFfmpegPool, getFfmpeg, toErrorMessage } from "@/lib/ffmpeg-client";
import type { PlayRecord, VideoClipRecord } from "@/types";
import {
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  XCircle,
} from "lucide-react";

type ExportVideoButtonProps = {
  plays: PlayRecord[];
  clips: VideoClipRecord[];
  gameTitle: string;
};

type PlayStatus = "pending" | "processing" | "done" | "error";

type PlayProgress = {
  label: string;
  detail: string;
  status: PlayStatus;
};

// ffmpeg.wasm's exec() does not reliably return 0 on success in this build, and
// it never throws on failure — a failed command just leaves its output file
// missing, which later surfaces as a cryptic "ErrnoError: FS error" on readFile.
// So we judge success by whether the expected output file exists, and capture
// ffmpeg's log stream to report the real reason when it doesn't.
async function execChecked(
  ffmpeg: FFmpeg,
  args: string[],
  context: string,
  outputFile: string,
): Promise<void> {
  const logs: string[] = [];
  const onLog = (entry: { type: string; message: string }) => {
    logs.push(entry.message);
    if (logs.length > 60) logs.shift();
  };
  ffmpeg.on("log", onLog);
  try {
    await ffmpeg.exec(args);
  } finally {
    ffmpeg.off("log", onLog);
  }

  let exists = false;
  try {
    const entries = await ffmpeg.listDir(".");
    exists = entries.some((e) => e.name === outputFile && !e.isDir);
  } catch {
    exists = false;
  }

  if (!exists) {
    const tail = logs
      .filter((line) => line.trim())
      .slice(-8)
      .join(" ⏎ ")
      .trim();
    throw new Error(`${context} failed${tail ? `: ${tail}` : ""}`);
  }
}

// The ffmpeg.wasm core has no fonts in its virtual filesystem, so drawtext must
// be pointed at a font file we load in ourselves (served from /public).
const OVERLAY_FONT_URL = "/fonts/overlay.ttf";
const OVERLAY_FONT_FS_NAME = "overlay.ttf";

let overlayFontBytes: Promise<Uint8Array> | null = null;
// ffmpeg.writeFile transfers (detaches) the buffer it's given, so hand each
// worker a fresh copy while keeping our cached master intact.
async function getOverlayFontBytes(): Promise<Uint8Array> {
  if (!overlayFontBytes) {
    overlayFontBytes = fetchFile(OVERLAY_FONT_URL).then((data) =>
      Uint8Array.from(data as Uint8Array),
    );
  }
  return Uint8Array.from(await overlayFontBytes);
}

const fontReadyInstances = new WeakSet<FFmpeg>();
async function ensureOverlayFont(ffmpeg: FFmpeg): Promise<void> {
  if (fontReadyInstances.has(ffmpeg)) return;
  await ffmpeg.writeFile(OVERLAY_FONT_FS_NAME, await getOverlayFontBytes());
  fontReadyInstances.add(ffmpeg);
}

function drawtextFilter(playNumber: number): string {
  return `drawtext=fontfile=${OVERLAY_FONT_FS_NAME}:text='Play ${playNumber}':fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8:x=(w-text_w)/2:y=h-th-20`;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ExportVideoButton({
  plays,
  clips,
  gameTitle,
}: ExportVideoButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [muteAudio, setMuteAudio] = useState(false);
  const [playProgress, setPlayProgress] = useState<PlayProgress[]>([]);

  const setPlayStatus = (index: number, next: PlayStatus) => {
    setPlayProgress((current) =>
      current.map((row, i) => (i === index ? { ...row, status: next } : row)),
    );
  };

  const exportVideo = async () => {
    const sortedPlays = sortPlays(plays);
    if (!sortedPlays.length || !clips.length) return;

    const clipsById = new Map(clips.map((clip) => [clip.id, clip]));

    // Resolve each play's slices up front so we can build the checklist and
    // skip plays that have no overlapping footage.
    const jobs = sortedPlays
      .map((play, index) => ({
        play,
        playNumber: index + 1,
        slices: slicesForGameRange(play.startTime, play.endTime, clips),
      }))
      .filter((job) => job.slices.length > 0);

    if (jobs.length === 0) {
      setStatus("No plays have footage to export.");
      return;
    }

    setExporting(true);
    setStatus("Loading video processor...");
    setPlayProgress(
      jobs.map((job) => ({
        label: `Play ${job.playNumber}`,
        detail: [
          job.play.offenseTeam ?? undefined,
          `${formatTime(job.play.startTime)}–${formatTime(job.play.endTime)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        status: "pending" as PlayStatus,
      })),
    );

    const pool = getExportFfmpegPool();
    const mute = muteAudio;
    // Muted exports drop audio entirely; otherwise re-encode to AAC.
    const audioArgs = mute ? ["-an"] : ["-c:a", "aac"];

    // Encode one play (cut its slices, burn in the label) on the given worker
    // and return the finished MP4 bytes.
    const encodeOnce = async (
      ffmpeg: FFmpeg,
      job: (typeof jobs)[number],
      jobIndex: number,
    ): Promise<Uint8Array> => {
      await ensureOverlayFont(ffmpeg);

      const scratch: string[] = [];
      const cleanup = async () => {
        for (const file of scratch) {
          try {
            await ffmpeg.deleteFile(file);
          } catch {
            // best-effort cleanup
          }
        }
      };

      try {
        const partFiles: string[] = [];

        for (let s = 0; s < job.slices.length; s++) {
          const slice = job.slices[s]!;
          const clip = clipsById.get(slice.clipId);
          const sourceUrl = clip
            ? await getClipPlaybackUrl(clip)
            : slice.blobUrl;

          const inputName = `j${jobIndex}_in${s}.mp4`;
          await ffmpeg.writeFile(inputName, await fetchFile(sourceUrl));
          scratch.push(inputName);

          if (job.slices.length === 1) {
            // Single slice: cut and label in one encode.
            const outputName = `j${jobIndex}_play.mp4`;
            await execChecked(
              ffmpeg,
              [
                "-ss",
                String(slice.localStart),
                "-i",
                inputName,
                "-t",
                String(slice.duration),
                "-vf",
                drawtextFilter(job.playNumber),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                ...audioArgs,
                "-y",
                outputName,
              ],
              `Play ${job.playNumber} encode`,
              outputName,
            );
            partFiles.push(outputName);
            scratch.push(outputName);
          } else {
            const partName = `j${jobIndex}_part${s}.mp4`;
            await execChecked(
              ffmpeg,
              [
                "-ss",
                String(slice.localStart),
                "-i",
                inputName,
                "-t",
                String(slice.duration),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                ...audioArgs,
                "-y",
                partName,
              ],
              `Play ${job.playNumber} slice ${s + 1}`,
              partName,
            );
            partFiles.push(partName);
            scratch.push(partName);
          }
        }

        let playFile = partFiles[0]!;

        if (partFiles.length > 1) {
          // Multiple slices: concat and burn in the label in a single encode.
          const listName = `j${jobIndex}_parts.txt`;
          await ffmpeg.writeFile(
            listName,
            partFiles.map((file) => `file '${file}'`).join("\n"),
          );
          scratch.push(listName);

          playFile = `j${jobIndex}_play.mp4`;
          await execChecked(
            ffmpeg,
            [
              "-f",
              "concat",
              "-safe",
              "0",
              "-i",
              listName,
              "-vf",
              drawtextFilter(job.playNumber),
              "-c:v",
              "libx264",
              "-preset",
              "ultrafast",
              ...audioArgs,
              "-y",
              playFile,
            ],
            `Play ${job.playNumber} concat`,
            playFile,
          );
          scratch.push(playFile);
        }

        const data = await ffmpeg.readFile(playFile);
        // Copy the bytes out of the worker FS before we delete the file.
        const bytes = Uint8Array.from(data as Uint8Array);
        await cleanup();
        return bytes;
      } catch (error) {
        // Leave FS cleanup to whoever owns this instance next — on failure the
        // worker is discarded, so there's nothing to clean up.
        throw error;
      }
    };

    // Run one play, retrying on a fresh worker if the wasm instance crashes
    // (e.g. "memory access out of bounds"). A crashed instance is discarded
    // rather than returned to the pool, so it can't poison later plays.
    const processJob = async (
      job: (typeof jobs)[number],
      jobIndex: number,
      attempts: number,
    ): Promise<Uint8Array> => {
      let lastError: unknown;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        const ffmpeg = await pool.acquire();
        setPlayStatus(jobIndex, "processing");
        try {
          const bytes = await encodeOnce(ffmpeg, job, jobIndex);
          pool.release(ffmpeg);
          setPlayStatus(jobIndex, "done");
          return bytes;
        } catch (error) {
          lastError = error;
          // The instance may be corrupted after a crash — drop it entirely.
          pool.discard(ffmpeg);
        }
      }

      setPlayStatus(jobIndex, "error");
      throw lastError;
    };

    try {
      // First pass: encode every play in parallel across the worker pool.
      setStatus(`Processing ${jobs.length} plays...`);
      const results: (Uint8Array | null)[] = new Array(jobs.length).fill(null);
      const settled = await Promise.allSettled(
        jobs.map((job, index) => processJob(job, index, 2)),
      );
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") results[index] = result.value;
      });

      // Second pass: a burst of parallel encodes can transiently exhaust wasm
      // memory and drop a cluster of plays. Retry any stragglers one at a time,
      // now that the parallel pass has freed its workers — dropping plays here
      // would leave gaps in the stitched sequence.
      const stragglers = results
        .map((value, index) => (value === null ? index : -1))
        .filter((index) => index >= 0);
      if (stragglers.length > 0) {
        setStatus(
          `Retrying ${stragglers.length} play${stragglers.length === 1 ? "" : "s"}...`,
        );
        for (const index of stragglers) {
          try {
            results[index] = await processJob(jobs[index]!, index, 2);
          } catch {
            // still failed; it will be reported as skipped below
          }
        }
      }

      // Preserve play order — results is indexed by job, nulls are drops.
      const encoded = results.filter(
        (value): value is Uint8Array => value !== null,
      );
      const failedCount = jobs.length - encoded.length;

      if (encoded.length === 0) {
        throw new Error("Every play failed to export.");
      }

      setStatus("Stitching final video...");

      let output: Blob;
      if (encoded.length === 1) {
        output = bytesToBlob(encoded[0]!);
      } else {
        output = await stitchPlays(encoded);
      }

      downloadBlob(output, `${gameTitle}.mp4`);

      setStatus(
        failedCount > 0
          ? `Export complete with ${failedCount} play${failedCount === 1 ? "" : "s"} skipped.`
          : "Export complete!",
      );
    } catch (error) {
      setStatus(`Export failed: ${toErrorMessage(error, "unknown error")}`);
    } finally {
      setExporting(false);
    }
  };

  const doneCount = playProgress.filter((p) => p.status === "done").length;
  const overallPct = playProgress.length
    ? Math.round((doneCount / playProgress.length) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void exportVideo()}
          disabled={exporting || !plays.length || !clips.length}
        >
          <Download className="mr-2 h-4 w-4" />
          {exporting ? "Exporting..." : "Download stitched video"}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={muteAudio}
            disabled={exporting}
            onChange={(e) => setMuteAudio(e.target.checked)}
          />
          Mute audio
        </label>
      </div>

      {playProgress.length > 0 && (
        <div className="space-y-2">
          <Progress value={overallPct} />
          <p className="text-sm text-muted-foreground">
            {status}
            {exporting && ` (${doneCount}/${playProgress.length})`}
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {playProgress.map((play, index) => (
              <li
                key={index}
                className="flex items-center gap-2 text-sm"
              >
                <PlayStatusIcon status={play.status} />
                <span className="font-medium">{play.label}</span>
                {play.detail && (
                  <span className="text-muted-foreground">{play.detail}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!exporting && status && playProgress.length === 0 && (
        <p className="text-sm text-muted-foreground">{status}</p>
      )}
    </div>
  );
}

function PlayStatusIcon({ status }: { status: PlayStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />;
    case "processing":
      return (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
      );
    case "error":
      return <XCircle className="h-4 w-4 shrink-0 text-red-600" />;
    default:
      return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
}

async function stitchPlays(plays: Uint8Array[]): Promise<Blob> {
  const ffmpeg: FFmpeg = await getFfmpeg();
  const files: string[] = [];

  try {
    for (let i = 0; i < plays.length; i++) {
      const name = `final_${i}.mp4`;
      await ffmpeg.writeFile(name, plays[i]!);
      files.push(name);
    }

    await ffmpeg.writeFile(
      "concat.txt",
      files.map((f) => `file '${f}'`).join("\n"),
    );

    await execChecked(
      ffmpeg,
      [
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "concat.txt",
        "-c",
        "copy",
        "-y",
        "output.mp4",
      ],
      "Final stitch",
      "output.mp4",
    );

    const data = await ffmpeg.readFile("output.mp4");
    return bytesToBlob(Uint8Array.from(data as Uint8Array));
  } finally {
    for (const file of [...files, "concat.txt", "output.mp4"]) {
      try {
        await ffmpeg.deleteFile(file);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

function bytesToBlob(bytes: Uint8Array): Blob {
  // Copy into a fresh, non-shared ArrayBuffer so it's a valid BlobPart.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "video/mp4" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
