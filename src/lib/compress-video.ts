import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { getFfmpeg } from "@/lib/ffmpeg-client";

function outputNameFor(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, "") || "clip";
  return `${base}.mp4`;
}

export async function compressVideoForWeb(
  file: File,
  options?: {
    ffmpeg?: FFmpeg;
    jobId?: string;
    onProgress?: (ratio: number) => void;
  },
): Promise<File> {
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
      // Carry the source container metadata (notably the moov creation_time,
      // which is our capturedAt) through the re-encode instead of dropping it.
      "-map_metadata",
      "0",
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
      "+faststart+use_metadata_tags",
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
