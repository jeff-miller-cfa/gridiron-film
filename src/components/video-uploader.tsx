"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  compressVideoForWeb,
  shouldCompressVideo,
} from "@/lib/compress-video";
import { getUploadFfmpegPool } from "@/lib/ffmpeg-client";
import { extractVideoCaptureTime, getVideoDuration } from "@/lib/video";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleAlert, Loader2, Upload } from "lucide-react";

type UploadedClip = {
  blobUrl: string;
  filename: string;
  capturedAt: string;
  duration: number;
};

type UploadItemStatus =
  | "queued"
  | "compressing"
  | "preparing"
  | "uploading"
  | "done"
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

  const hasActiveUpload =
    isBusy ||
    uploadItems.some(
      (item) => item.status !== "done" && item.status !== "error",
    );

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setUploadItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const processClip = async (
    file: File,
    itemId: string,
  ): Promise<UploadedClip> => {
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

    const [capturedAt, duration] = await Promise.all([
      extractVideoCaptureTime(file),
      getVideoDuration(uploadFile),
    ]);

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
      blobUrl: blob.url,
      filename: uploadFile.name,
      capturedAt: capturedAt.toISOString(),
      duration,
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
    setBatchStatus("");
    setIsBusy(true);

    try {
      const results = await Promise.allSettled(
        fileArray.map((file, index) => processClip(file, items[index]!.id)),
      );

      const clips: UploadedClip[] = [];
      const failures: string[] = [];

      results.forEach((result, index) => {
        const filename = fileArray[index]!.name;
        if (result.status === "fulfilled") {
          clips.push(result.value);
          return;
        }

        failures.push(filename);
        updateItem(items[index]!.id, {
          status: "error",
          message: errorMessage(result.reason),
        });
      });

      if (clips.length === 0) {
        setBatchStatus("All uploads failed.");
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

      if (failures.length > 0) {
        setBatchStatus(
          `Saved ${clips.length} clip${clips.length === 1 ? "" : "s"}. ${failures.length} failed.`,
        );
      } else {
        setBatchStatus("Upload complete!");
      }

      onUploaded();
    } finally {
      setIsBusy(false);
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
          capture time. Large or iPhone MOV files are compressed to web-friendly
          MP4 before upload for smoother playback.
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
        <div className="space-y-2">
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
