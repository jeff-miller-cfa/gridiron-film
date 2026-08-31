import { FFmpeg } from "@ffmpeg/ffmpeg";

const FFMPEG_CORE_BASE = "/ffmpeg";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message) {
      return maybe.message;
    }
  }
  return "Failed to load video processor";
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
      return createFfmpegInstance();
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
    exportFfmpegPool = new FfmpegPool();
  }
  return exportFfmpegPool;
}
