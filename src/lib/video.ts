import { createFile, MP4BoxBuffer } from "mp4box";

const EPOCH_1904 = new Date("1904-01-01T00:00:00Z").getTime();

function mp4EpochToDate(seconds: number): Date {
  return new Date(EPOCH_1904 + seconds * 1000);
}

export async function extractVideoCaptureTime(file: File): Promise<Date> {
  try {
    const buffer = await file.arrayBuffer();
    const captureTime = await new Promise<Date | null>((resolve) => {
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
          finish(creation);
          return;
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

    if (captureTime) return captureTime;
  } catch {
    // fall through to lastModified
  }

  return new Date(file.lastModified);
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
