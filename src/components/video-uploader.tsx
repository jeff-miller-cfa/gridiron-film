"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

export function VideoUploader({ gameId, onUploaded }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    setUploading(true);
    setProgress(0);
    setStatus("Preparing uploads...");

    try {
      const clips: UploadedClip[] = [];
      const fileArray = Array.from(files);
      const total = fileArray.length;

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setStatus(`Uploading ${file.name} (${i + 1}/${total})...`);

        const [capturedAt, duration] = await Promise.all([
          extractVideoCaptureTime(file),
          getVideoDuration(file),
        ]);

        const blob = await upload(
          `games/${gameId}/${file.name}`,
          file,
          {
            access: "public",
            handleUploadUrl: "/api/upload",
            onUploadProgress: (p) => {
              const fileProgress = (p.percentage ?? 0) / 100;
              setProgress(((i + fileProgress) / total) * 100);
            },
          },
        );

        clips.push({
          blobUrl: blob.url,
          filename: file.name,
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
          Select multiple clips — they&apos;ll be ordered by capture time from
          video metadata.
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
