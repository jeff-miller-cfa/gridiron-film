"use client";

import { useState } from "react";
import { fetchFile } from "@ffmpeg/util";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { slicesForGameRange } from "@/lib/clip-layout";
import { sortPlays } from "@/lib/plays";
import { getClipPlaybackUrl } from "@/lib/clip-cache";
import { getFfmpeg } from "@/lib/ffmpeg-client";
import type { PlayRecord, VideoClipRecord } from "@/types";
import { Download } from "lucide-react";

type ExportVideoButtonProps = {
  plays: PlayRecord[];
  clips: VideoClipRecord[];
  gameTitle: string;
};

export function ExportVideoButton({
  plays,
  clips,
  gameTitle,
}: ExportVideoButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const exportVideo = async () => {
    const sortedPlays = sortPlays(plays);
    if (!sortedPlays.length || !clips.length) return;

    setExporting(true);
    setProgress(0);
    setStatus("Loading video processor...");

    const clipsById = new Map(clips.map((clip) => [clip.id, clip]));

    try {
      const ffmpeg = await getFfmpeg();
      ffmpeg.on("progress", ({ progress: ratio }) => {
        setProgress(Math.round(ratio * 100));
      });

      const segmentFiles: string[] = [];
      let segmentIndex = 0;

      for (let i = 0; i < sortedPlays.length; i++) {
        const play = sortedPlays[i]!;
        const slices = slicesForGameRange(play.startTime, play.endTime, clips);
        if (slices.length === 0) continue;

        setStatus(`Processing play ${i + 1} (${i + 1}/${sortedPlays.length})...`);

        const playPartFiles: string[] = [];

        for (const slice of slices) {
          const inputName = `input_${segmentIndex}.mp4`;
          const outputName = `segment_${segmentIndex}.mp4`;

          const clip = clipsById.get(slice.clipId);
          const sourceUrl = clip
            ? await getClipPlaybackUrl(clip)
            : slice.blobUrl;

          await ffmpeg.writeFile(inputName, await fetchFile(sourceUrl));
          await ffmpeg.exec([
            "-ss",
            String(slice.localStart),
            "-i",
            inputName,
            "-t",
            String(slice.duration),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-y",
            outputName,
          ]);

          playPartFiles.push(outputName);
          segmentIndex += 1;
          await ffmpeg.deleteFile(inputName);
        }

        if (playPartFiles.length === 1) {
          const labeledName = `play_${i}.mp4`;
          await ffmpeg.exec([
            "-i",
            playPartFiles[0]!,
            "-vf",
            `drawtext=text='Play ${i + 1}':fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8:x=(w-text_w)/2:y=h-th-20`,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-y",
            labeledName,
          ]);
          segmentFiles.push(labeledName);
          await ffmpeg.deleteFile(playPartFiles[0]!);
        } else if (playPartFiles.length > 1) {
          const listName = `play_${i}_parts.txt`;
          await ffmpeg.writeFile(
            listName,
            playPartFiles.map((file) => `file '${file}'`).join("\n"),
          );
          const joinedName = `play_${i}_joined.mp4`;
          await ffmpeg.exec([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            listName,
            "-c",
            "copy",
            "-y",
            joinedName,
          ]);
          const labeledName = `play_${i}.mp4`;
          await ffmpeg.exec([
            "-i",
            joinedName,
            "-vf",
            `drawtext=text='Play ${i + 1}':fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8:x=(w-text_w)/2:y=h-th-20`,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-y",
            labeledName,
          ]);
          segmentFiles.push(labeledName);
          await ffmpeg.deleteFile(listName);
          await ffmpeg.deleteFile(joinedName);
          for (const file of playPartFiles) {
            await ffmpeg.deleteFile(file);
          }
        }
      }

      if (segmentFiles.length === 0) {
        throw new Error("No segments to export");
      }

      setStatus("Stitching final video...");

      if (segmentFiles.length === 1) {
        const data = await ffmpeg.readFile(segmentFiles[0]!);
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

      for (const file of segmentFiles) {
        await ffmpeg.deleteFile(file);
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
      <Button
        onClick={() => void exportVideo()}
        disabled={exporting || !plays.length || !clips.length}
      >
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
