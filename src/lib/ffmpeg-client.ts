import { FFmpeg } from "@ffmpeg/ffmpeg";

const FFMPEG_CORE_BASE = "/ffmpeg";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

export function toErrorMessage(
  error: unknown,
  fallback = "Failed to load video processor",
): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message) {
      return maybe.message;
    }
  }
  return fallback;
}

async function loadFfmpegInstance(ffmpeg: FFmpeg): Promise<FFmpeg> {
  await ffmpeg.load({
    coreURL: `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
    wasmURL: `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
  });
  return ffmpeg;
}

export async function createFfmpegInstance(): Promise<FFmpeg> {
  try {
    return await loadFfmpegInstance(new FFmpeg());
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
}

export async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = createFfmpegInstance().then((ffmpeg) => {
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    }).catch((error) => {
      ffmpegLoadPromise = null;
      throw error instanceof Error ? error : new Error(toErrorMessage(error));
    });
  }

  return ffmpegLoadPromise;
}

export function getUploadFfmpegPoolSize(): number {
  if (typeof navigator === "undefined") return 2;
  const cores = navigator.hardwareConcurrency ?? 2;
  return Math.min(3, Math.max(2, Math.floor(cores / 2)));
}

export function getExportFfmpegPoolSize(): number {
  if (typeof navigator === "undefined") return 2;
  const cores = navigator.hardwareConcurrency ?? 4;
  return Math.min(6, Math.max(2, cores));
}

export class FfmpegPool {
  private readonly maxWorkers: number;
  private readonly available: FFmpeg[] = [];
  private readonly waiters: Array<(ffmpeg: FFmpeg) => void> = [];
  private activeWorkers = 0;

  constructor(maxWorkers = getUploadFfmpegPoolSize()) {
    this.maxWorkers = Math.max(1, maxWorkers);
  }

  async acquire(): Promise<FFmpeg> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }

    if (this.activeWorkers < this.maxWorkers) {
      this.activeWorkers += 1;
      try {
        return await createFfmpegInstance();
      } catch (error) {
        // Free the slot so a later acquire can try again.
        this.activeWorkers -= 1;
        throw error;
      }
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(ffmpeg: FFmpeg) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(ffmpeg);
      return;
    }
    this.available.push(ffmpeg);
  }

  // Permanently drop a worker that may be corrupted (e.g. after a wasm crash):
  // terminate it and free its slot. If callers are waiting, spin up a fresh
  // replacement for one of them so the pool doesn't stall below capacity.
  discard(ffmpeg: FFmpeg) {
    try {
      ffmpeg.terminate();
    } catch {
      // best-effort termination
    }
    this.activeWorkers -= 1;

    const waiter = this.waiters.shift();
    if (waiter) {
      this.activeWorkers += 1;
      createFfmpegInstance()
        .then(waiter)
        .catch(() => {
          this.activeWorkers -= 1;
        });
    }
  }
}

let uploadFfmpegPool: FfmpegPool | null = null;

export function getUploadFfmpegPool(): FfmpegPool {
  if (!uploadFfmpegPool) {
    uploadFfmpegPool = new FfmpegPool();
  }
  return uploadFfmpegPool;
}

let exportFfmpegPool: FfmpegPool | null = null;

export function getExportFfmpegPool(): FfmpegPool {
  if (!exportFfmpegPool) {
    exportFfmpegPool = new FfmpegPool(getExportFfmpegPoolSize());
  }
  return exportFfmpegPool;
}
