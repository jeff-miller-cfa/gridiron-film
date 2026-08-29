"use client";

import { useState } from "react";
import { fetchFile } from "@ffmpeg/util";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getFfmpeg } from "@/lib/ffmpeg-client";
import type { PlayWithClip } from "@/types";
import { Download } from "lucide-react";

type ExportVideoButtonProps = {
  plays: PlayWithClip[];
  gameTitle: string;
};

export function ExportVideoButton({ plays, gameTitle }: ExportVideoButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const exportVideo = async () => {
    if (!plays.length) return;

    setExporting(true);
    setProgress(0);
    setStatus("Loading video processor...");

    try {
      const ffmpeg = await getFfmpeg();
      ffmpeg.on("progress", ({ progress: p }) => {
        setProgress(Math.round(p * 100));
      });

      const segmentFiles: string[] = [];

      for (let i = 0; i < plays.length; i++) {
        const play = plays[i];
        if (!play.videoClip) continue;

        setStatus(`Processing play ${i + 1} (${i + 1}/${plays.length})...`);
        const inputName = `input_${i}.mp4`;
        const outputName = `segment_${i}.mp4`;

        await ffmpeg.writeFile(
          inputName,
          await fetchFile(play.videoClip.blobUrl),
        );

        const duration = play.endTime - play.startTime;
        await ffmpeg.exec([
          "-ss",
          String(play.startTime),
          "-i",
          inputName,
          "-t",
          String(duration),
          "-vf",
          `drawtext=text='Play ${i + 1}':fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8:x=(w-text_w)/2:y=h-th-20`,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-y",
          outputName,
        ]);

        segmentFiles.push(outputName);
        await ffmpeg.deleteFile(inputName);
      }

      if (segmentFiles.length === 0) {
        throw new Error("No segments to export");
      }

      setStatus("Stitching final video...");

      if (segmentFiles.length === 1) {
        const data = await ffmpeg.readFile(segmentFiles[0]);
        const blob = new Blob([Uint8Array.from(data as Uint8Array)], {
          type: "video/mp4",
        });
        downloadBlob(blob, `${gameTitle}.mp4`);
      } else {
        const listContent = segmentFiles.map((f) => `file '${f}'`).join("\n");
        await ffmpeg.writeFile("concat.txt", listContent);

        await ffmpeg.exec([
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "concat.txt",
          "-c",
          "copy",
          "-y",
          "output.mp4",
        ]);

        const data = await ffmpeg.readFile("output.mp4");
        const blob = new Blob([Uint8Array.from(data as Uint8Array)], {
          type: "video/mp4",
        });
        downloadBlob(blob, `${gameTitle}.mp4`);

        await ffmpeg.deleteFile("concat.txt");
        await ffmpeg.deleteFile("output.mp4");
      }

      for (const f of segmentFiles) {
        await ffmpeg.deleteFile(f);
      }

      setStatus("Export complete!");
      setProgress(100);
    } catch (error) {
      setStatus(`Export failed: ${(error as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button onClick={() => void exportVideo()} disabled={exporting || !plays.length}>
        <Download className="mr-2 h-4 w-4" />
        {exporting ? "Exporting..." : "Download stitched video"}
      </Button>
      {exporting && (
        <>
          <Progress value={progress} />
          <p className="text-sm text-muted-foreground">{status}</p>
        </>
      )}
      {!exporting && status && (
        <p className="text-sm text-muted-foreground">{status}</p>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
