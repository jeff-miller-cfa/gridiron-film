"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { mapWithConcurrency } from "@/lib/async-pool";
import {
  compressVideoForWeb,
  shouldCompressVideo,
} from "@/lib/compress-video";
import { getUploadFfmpegPool } from "@/lib/ffmpeg-client";
import {
  captureTimeKey,
  extractVideoCaptureTime,
  getVideoDuration,
} from "@/lib/video";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  MinusCircle,
  Upload,
} from "lucide-react";

const MAX_UPLOAD_CONCURRENCY = 4;

type UploadedClip = {
  blobUrl: string;
  filename: string;
  capturedAt: string;
  duration: number;
};

type ExistingClip = {
  capturedAt: string;
};

type UploadItemStatus =
  | "queued"
  | "compressing"
  | "preparing"
  | "uploading"
  | "done"
  | "skipped"
  | "error";

type UploadItem = {
  id: string;
  filename: string;
  status: UploadItemStatus;
  progress: number;
  message: string;
};

type VideoUploaderProps = {
  gameId: string;
  onUploaded: () => void;
};

type ProcessClipResult =
  | { kind: "uploaded"; clip: UploadedClip }
  | { kind: "skipped" }
  | { kind: "error"; error: unknown };

class CaptureTimeRegistry {
  private readonly keys = new Set<string>();

  constructor(existing: ExistingClip[]) {
    for (const clip of existing) {
      this.keys.add(captureTimeKey(clip.capturedAt));
    }
  }

  reserve(capturedAt: Date): boolean {
    const key = captureTimeKey(capturedAt);
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function videoFilesFromList(files: FileList | File[]): File[] {
  return Array.from(files).filter(
    (file) =>
      file.type.startsWith("video/") ||
      /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message) {
      return maybe.message;
    }
  }
  return "Upload failed";
}

function statusLabel(status: UploadItemStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "compressing":
      return "Compressing";
    case "preparing":
      return "Preparing";
    case "uploading":
      return "Uploading";
    case "done":
      return "Done";
    case "skipped":
      return "Skipped";
    case "error":
      return "Failed";
  }
}

export function VideoUploader({ gameId, onUploaded }: VideoUploaderProps) {
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [batchStatus, setBatchStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const ffmpegPoolRef = useRef(getUploadFfmpegPool());
  const captureRegistryRef = useRef<CaptureTimeRegistry | null>(null);
  const registryLockRef = useRef<Promise<void>>(Promise.resolve());

  const hasActiveUpload =
    isBusy ||
    uploadItems.some(
      (item) =>
        item.status !== "done" &&
        item.status !== "skipped" &&
        item.status !== "error",
    );

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setUploadItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const reserveCaptureTime = async (capturedAt: Date): Promise<boolean> => {
    let reserved = false;

    registryLockRef.current = registryLockRef.current.then(() => {
      reserved = captureRegistryRef.current?.reserve(capturedAt) ?? false;
    });

    await registryLockRef.current;
    return reserved;
  };

  const processClip = async (
    file: File,
    itemId: string,
  ): Promise<ProcessClipResult> => {
    updateItem(itemId, {
      status: "preparing",
      progress: 2,
      message: "Checking capture time...",
    });

    const capturedAt = await extractVideoCaptureTime(file);
    const reserved = await reserveCaptureTime(capturedAt);

    if (!reserved) {
      updateItem(itemId, {
        status: "skipped",
        progress: 100,
        message: "Already uploaded (matching capture time)",
      });
      return { kind: "skipped" };
    }

    let uploadFile = file;
    const needsCompression = shouldCompressVideo(file);

    if (needsCompression) {
      updateItem(itemId, {
        status: "compressing",
        progress: 0,
        message: "Waiting for video processor...",
      });

      const ffmpeg = await ffmpegPoolRef.current.acquire();
      const jobId = crypto.randomUUID();

      try {
        updateItem(itemId, {
          message: "Compressing for faster streaming...",
        });

        uploadFile = await compressVideoForWeb(file, {
          ffmpeg,
          jobId,
          onProgress: (ratio) => {
            updateItem(itemId, {
              progress: Math.round(ratio * 70),
            });
          },
        });
      } finally {
        ffmpegPoolRef.current.release(ffmpeg);
      }

      updateItem(itemId, {
        progress: 70,
        message: `Compressed to ${formatSize(uploadFile.size)}`,
      });
    }

    updateItem(itemId, {
      status: "preparing",
      progress: needsCompression ? 72 : 5,
      message: "Reading clip metadata...",
    });

    const duration = await getVideoDuration(uploadFile);

    updateItem(itemId, {
      status: "uploading",
      progress: needsCompression ? 75 : 10,
      message: "Uploading...",
    });

    const blob = await upload(`games/${gameId}/${uploadFile.name}`, uploadFile, {
      access: "public",
      handleUploadUrl: "/api/upload",
      onUploadProgress: (progressEvent) => {
        const uploadRatio = (progressEvent.percentage ?? 0) / 100;
        const base = needsCompression ? 75 : 10;
        const span = needsCompression ? 25 : 90;
        updateItem(itemId, {
          progress: Math.round(base + uploadRatio * span),
        });
      },
    });

    updateItem(itemId, {
      status: "done",
      progress: 100,
      message: "Uploaded",
    });

    return {
      kind: "uploaded",
      clip: {
        blobUrl: blob.url,
        filename: uploadFile.name,
        capturedAt: capturedAt.toISOString(),
        duration,
      },
    };
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    const fileArray = videoFilesFromList(files ?? []);
    if (!fileArray.length) return;

    const items: UploadItem[] = fileArray.map((file) => ({
      id: crypto.randomUUID(),
      filename: file.name,
      status: "queued",
      progress: 0,
      message: "Queued",
    }));

    setUploadItems(items);
    setBatchStatus("Loading existing clips...");
    setIsBusy(true);

    try {
      const existingRes = await fetch(`/api/games/${gameId}/clips`);
      const existingClips: ExistingClip[] = existingRes.ok
        ? await existingRes.json()
        : [];
      captureRegistryRef.current = new CaptureTimeRegistry(existingClips);

      setBatchStatus(
        `Processing up to ${MAX_UPLOAD_CONCURRENCY} clips at a time...`,
      );

      const results = await mapWithConcurrency(
        fileArray,
        MAX_UPLOAD_CONCURRENCY,
        async (file, index) => {
          try {
            return await processClip(file, items[index]!.id);
          } catch (error) {
            return { kind: "error" as const, error };
          }
        },
      );

      const clips: UploadedClip[] = [];
      let skippedCount = 0;
      let failureCount = 0;

      results.forEach((result, index) => {
        if (result.kind === "uploaded") {
          clips.push(result.clip);
          return;
        }

        if (result.kind === "skipped") {
          skippedCount += 1;
          return;
        }

        failureCount += 1;
        updateItem(items[index]!.id, {
          status: "error",
          message: errorMessage(result.error),
        });
      });

      if (clips.length === 0) {
        if (skippedCount > 0 && failureCount === 0) {
          setBatchStatus(
            `Skipped ${skippedCount} clip${skippedCount === 1 ? "" : "s"} already uploaded.`,
          );
        } else if (failureCount > 0) {
          setBatchStatus("All uploads failed.");
        } else {
          setBatchStatus("No clips to upload.");
        }
        return;
      }

      setBatchStatus("Saving clips and creating plays...");

      const res = await fetch(`/api/games/${gameId}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clips }),
      });

      if (!res.ok) {
        setBatchStatus("Error: Failed to save clips.");
        return;
      }

      const saved = (await res.json()) as { skippedCount?: number };
      const serverSkipped = saved.skippedCount ?? 0;
      const totalSkipped = skippedCount + serverSkipped;

      const parts: string[] = [
        `Uploaded ${clips.length - serverSkipped} clip${clips.length - serverSkipped === 1 ? "" : "s"}.`,
      ];
      if (totalSkipped > 0) {
        parts.push(
          `Skipped ${totalSkipped} duplicate${totalSkipped === 1 ? "" : "s"}.`,
        );
      }
      if (failureCount > 0) {
        parts.push(`${failureCount} failed.`);
      }
      setBatchStatus(parts.join(" "));

      onUploaded();
    } finally {
      setIsBusy(false);
      captureRegistryRef.current = null;
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (hasActiveUpload) return;

    dragCounterRef.current += 1;
    if (event.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (hasActiveUpload) return;

    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (hasActiveUpload) return;
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (hasActiveUpload) return;

    const videos = videoFilesFromList(event.dataTransfer.files);
    if (videos.length > 0) {
      void handleFiles(videos);
      return;
    }

    if (event.dataTransfer.files.length > 0) {
      setBatchStatus("Please drop video files only.");
    }
  };

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl border-2 border-dashed p-8 transition-colors",
        isDragging
          ? "border-primary bg-primary/10"
          : "border-primary/20 bg-primary/[0.02] hover:border-primary/30 hover:bg-primary/[0.04]",
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Upload className="h-7 w-7" />
        </div>
        <p className="font-heading text-lg font-semibold text-foreground">
          Upload game footage
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Drag and drop videos here, or choose files. Clips are ordered by
          capture time and duplicates are skipped automatically. Large or iPhone
          MOV files are compressed to web-friendly MP4 before upload.
        </p>
      </div>

      <div className="flex justify-center">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            disabled={hasActiveUpload}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span
            className={buttonVariants({
              className: cn("h-11 rounded-xl px-6", hasActiveUpload && "opacity-50"),
            })}
          >
            Choose videos
          </span>
        </label>
      </div>

      {uploadItems.length > 0 && (
        <div className="max-h-[min(60vh,28rem)] space-y-2 overflow-y-auto">
          {uploadItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border/80 bg-card px-3 py-2.5"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.filename}</p>
                  <p className="text-xs text-muted-foreground">{item.message}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  {item.status === "done" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  ) : item.status === "skipped" ? (
                    <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : item.status === "error" ? (
                    <CircleAlert className="h-3.5 w-3.5 text-destructive" />
                  ) : item.status === "queued" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin opacity-50" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {statusLabel(item.status)}
                </div>
              </div>
              <Progress value={item.progress} />
            </div>
          ))}
        </div>
      )}

      {batchStatus && (
        <p className="text-center text-sm text-muted-foreground">{batchStatus}</p>
      )}
    </div>
  );
}
