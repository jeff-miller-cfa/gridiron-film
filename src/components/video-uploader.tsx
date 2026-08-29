"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  compressVideoForWeb,
  shouldCompressVideo,
} from "@/lib/compress-video";
import { getFfmpeg } from "@/lib/ffmpeg-client";
import { extractVideoCaptureTime, getVideoDuration } from "@/lib/video";
import { Upload } from "lucide-react";

type UploadedClip = {
  blobUrl: string;
  filename: string;
  capturedAt: string;
  duration: number;
};

type VideoUploaderProps = {
  gameId: string;
  onUploaded: () => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoUploader({ gameId, onUploaded }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    setUploading(true);
    setProgress(0);
    setStatus("Preparing uploads...");

    let ffmpeg: FFmpeg | null = null;

    try {
      const clips: UploadedClip[] = [];
      const fileArray = Array.from(files);
      const total = fileArray.length;

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const fileBaseProgress = i / total;
        const fileSpan = 1 / total;

        let uploadFile = file;

        if (shouldCompressVideo(file)) {
          setStatus(
            `Compressing ${file.name} (${i + 1}/${total}) for faster streaming...`,
          );

          if (!ffmpeg) {
            setStatus("Loading video processor...");
            ffmpeg = await getFfmpeg();
          }

          uploadFile = await compressVideoForWeb(file, {
            ffmpeg,
            onProgress: (ratio) => {
              setProgress((fileBaseProgress + ratio * 0.65 * fileSpan) * 100);
            },
          });

          setStatus(
            `Compressed ${file.name}: ${formatSize(file.size)} → ${formatSize(uploadFile.size)}`,
          );
        } else {
          setStatus(`Preparing ${file.name} (${i + 1}/${total})...`);
        }

        const [capturedAt, duration] = await Promise.all([
          extractVideoCaptureTime(file),
          getVideoDuration(uploadFile),
        ]);

        setStatus(`Uploading ${uploadFile.name} (${i + 1}/${total})...`);

        const blob = await upload(`games/${gameId}/${uploadFile.name}`, uploadFile, {
          access: "public",
          handleUploadUrl: "/api/upload",
          onUploadProgress: (p) => {
            const uploadRatio = (p.percentage ?? 0) / 100;
            const compressWeight = shouldCompressVideo(file) ? 0.65 : 0;
            const combined = compressWeight + uploadRatio * (1 - compressWeight);
            setProgress((fileBaseProgress + combined * fileSpan) * 100);
          },
        });

        clips.push({
          blobUrl: blob.url,
          filename: uploadFile.name,
          capturedAt: capturedAt.toISOString(),
          duration,
        });
      }

      setStatus("Saving clips and creating plays...");
      const res = await fetch(`/api/games/${gameId}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clips }),
      });

      if (!res.ok) throw new Error("Failed to save clips");

      setProgress(100);
      setStatus("Upload complete!");
      onUploaded();
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border-2 border-dashed border-primary/20 bg-primary/[0.02] p-8 transition-colors hover:border-primary/30 hover:bg-primary/[0.04]">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Upload className="h-7 w-7" />
        </div>
        <p className="font-heading text-lg font-semibold text-foreground">
          Upload game footage
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Select multiple clips — they&apos;ll be ordered by capture time. Large
          or iPhone MOV files are compressed to web-friendly MP4 before upload
          for smoother playback.
        </p>
      </div>

      <div className="flex justify-center">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <span className={buttonVariants({ className: "h-11 rounded-xl px-6" })}>
            Choose videos
          </span>
        </label>
      </div>

      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-center text-sm text-muted-foreground">{status}</p>
        </div>
      )}

      {!uploading && status && (
        <p className="text-center text-sm text-muted-foreground">{status}</p>
      )}
    </div>
  );
}
