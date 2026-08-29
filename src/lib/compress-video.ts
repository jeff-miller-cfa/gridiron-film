import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { getFfmpeg } from "@/lib/ffmpeg-client";

const COMPRESS_ABOVE_BYTES = 25 * 1024 * 1024;

export function shouldCompressVideo(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".mov") || file.type === "video/quicktime") {
    return true;
  }
  return file.size > COMPRESS_ABOVE_BYTES;
}

function outputNameFor(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, "") || "clip";
  return `${base}.mp4`;
}

export function clipLikelyNeedsCompression(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(".mov") ||
    lower.endsWith(".m4v") ||
    lower.endsWith(".hevc") ||
    !lower.endsWith(".mp4")
  );
}

export async function compressVideoForWeb(
  file: File,
  options?: {
    ffmpeg?: FFmpeg;
    jobId?: string;
    onProgress?: (ratio: number) => void;
    force?: boolean;
  },
): Promise<File> {
  if (!options?.force && !shouldCompressVideo(file)) return file;

  const ffmpeg = options?.ffmpeg ?? (await getFfmpeg());
  const progressHandler = ({ progress }: { progress: number }) => {
    options?.onProgress?.(progress);
  };

  ffmpeg.on("progress", progressHandler);

  const inputExt = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "mov";
  const jobId = options?.jobId ?? crypto.randomUUID();
  const inputName = `upload-input-${jobId}.${inputExt}`;
  const outputName = `upload-output-${jobId}.mp4`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    await ffmpeg.exec([
      "-i",
      inputName,
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
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    return new File([new Uint8Array(data as Uint8Array)], outputNameFor(file), {
      type: "video/mp4",
      lastModified: file.lastModified,
    });
  } finally {
    ffmpeg.off("progress", progressHandler);
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}
