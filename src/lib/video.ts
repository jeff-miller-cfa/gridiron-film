import { createFile, MP4BoxBuffer } from "mp4box";

const EPOCH_1904 = new Date("1904-01-01T00:00:00Z").getTime();

function mp4EpochToDate(seconds: number): Date {
  return new Date(EPOCH_1904 + seconds * 1000);
}

/**
 * Thrown when a clip has no embedded capture time. We intentionally do NOT fall
 * back to `file.lastModified` — that is the file's copy/transfer time, not when
 * the footage was recorded, and using it silently corrupts clip ordering.
 */
export class MissingCaptureTimeError extends Error {
  constructor(filename?: string) {
    super(
      filename
        ? `"${filename}" has no capture time in its metadata`
        : "Video has no capture time in its metadata",
    );
    this.name = "MissingCaptureTimeError";
  }
}

/**
 * Reads the recording time from the video's container metadata (mp4/mov moov
 * creation time). Returns null when the file carries no valid capture time.
 */
export async function readVideoCaptureTime(file: File): Promise<Date | null> {
  try {
    const buffer = await file.arrayBuffer();
    return await new Promise<Date | null>((resolve) => {
      const mp4boxfile = createFile();
      let resolved = false;

      const finish = (date: Date | null) => {
        if (resolved) return;
        resolved = true;
        resolve(date);
      };

      mp4boxfile.onReady = (info) => {
        const creation = info.created;
        if (creation instanceof Date && !Number.isNaN(creation.getTime())) {
          // mp4box maps the 1904 epoch to 1970 for us; guard against the
          // "zero" moov time (epoch 1904 -> 1970) that some encoders write.
          if (creation.getTime() > 0) {
            finish(creation);
            return;
          }
        }
        if (typeof creation === "number" && creation > 0) {
          finish(mp4EpochToDate(creation));
          return;
        }
        finish(null);
      };

      mp4boxfile.onError = () => finish(null);

      const ab = MP4BoxBuffer.fromArrayBuffer(buffer, 0);
      mp4boxfile.appendBuffer(ab);
      mp4boxfile.flush();
      setTimeout(() => finish(null), 3000);
    });
  } catch {
    return null;
  }
}

/**
 * Returns the clip's recording time, or throws {@link MissingCaptureTimeError}
 * when the file has none. Callers must reject the upload on that error.
 */
export async function extractVideoCaptureTime(file: File): Promise<Date> {
  const captureTime = await readVideoCaptureTime(file);
  if (!captureTime) {
    throw new MissingCaptureTimeError(file.name);
  }
  return captureTime;
}

export async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration"));
    };
    video.src = url;
  });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatGameDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

const CAPTURE_TIME_TOLERANCE_MS = 1000;

export function captureTimeKey(date: Date | string): string {
  return String(Math.round(new Date(date).getTime() / CAPTURE_TIME_TOLERANCE_MS));
}

export function captureTimesMatch(
  a: Date | string,
  b: Date | string,
): boolean {
  return captureTimeKey(a) === captureTimeKey(b);
}

export function hasMatchingCaptureTime(
  capturedAt: Date | string,
  existing: Array<{ capturedAt: Date | string }>,
): boolean {
  const key = captureTimeKey(capturedAt);
  return existing.some((clip) => captureTimeKey(clip.capturedAt) === key);
}
