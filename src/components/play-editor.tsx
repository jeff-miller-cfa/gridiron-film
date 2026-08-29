"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/video";
import type { PlayDraft, VideoClipRecord } from "@/types";
import { Scissors, Trash2, Plus } from "lucide-react";

type PlayEditorProps = {
  clips: VideoClipRecord[];
  plays: PlayDraft[];
  homeTeam: string;
  awayTeam: string;
  onChange: (plays: PlayDraft[]) => void;
};

export function PlayEditor({
  clips,
  plays,
  homeTeam,
  awayTeam,
  onChange,
}: PlayEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    clips[0]?.id ?? null,
  );
  const [selectedPlayIndex, setSelectedPlayIndex] = useState<number | null>(null);

  const selectedClip = clips.find((c) => c.id === selectedClipId);
  const clipPlays = plays
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.videoClipId === selectedClipId)
    .sort((a, b) => a.startTime - b.startTime);

  useEffect(() => {
    if (selectedClip && videoRef.current) {
      videoRef.current.src = selectedClip.blobUrl;
    }
  }, [selectedClip]);

  const renumberPlays = (updated: PlayDraft[]) =>
    updated
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p, i) => ({ ...p, playNumber: i + 1, sortOrder: i }));

  const updatePlays = (updated: PlayDraft[]) => {
    onChange(renumberPlays(updated));
  };

  const splitAtCurrentTime = () => {
    const video = videoRef.current;
    if (!video || !selectedClipId || !selectedClip) return;

    const time = video.currentTime;
    const playIndex = plays.findIndex(
      (p) =>
        p.videoClipId === selectedClipId &&
        time > p.startTime + 0.1 &&
        time < p.endTime - 0.1,
    );

    if (playIndex === -1) return;

    const play = plays[playIndex];
    const newPlay: PlayDraft = {
      videoClipId: selectedClipId,
      startTime: time,
      endTime: play.endTime,
      playNumber: play.playNumber + 1,
      offenseTeam: play.offenseTeam,
      notes: "",
      sortOrder: play.sortOrder + 0.5,
    };

    const updated = plays.map((p, i) =>
      i === playIndex ? { ...p, endTime: time } : p,
    );
    updated.push(newPlay);
    updatePlays(updated);
  };

  const removePlay = (index: number) => {
    updatePlays(plays.filter((_, i) => i !== index));
    setSelectedPlayIndex(null);
  };

  const updatePlayField = (
    index: number,
    field: keyof PlayDraft,
    value: string | number,
  ) => {
    const updated = plays.map((p, i) =>
      i === index ? { ...p, [field]: value } : p,
    );
    onChange(updated);
  };

  const seekToPlay = (play: PlayDraft, index: number) => {
    setSelectedPlayIndex(index);
    if (videoRef.current) {
      videoRef.current.currentTime = play.startTime;
    }
  };

  if (!clips.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Upload videos to start defining plays.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {clips.map((clip) => (
            <Button
              key={clip.id}
              variant={selectedClipId === clip.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedClipId(clip.id)}
            >
              {clip.filename}
            </Button>
          ))}
        </div>

        {selectedClip && (
          <>
            <video
              ref={videoRef}
              className="aspect-video w-full rounded-xl bg-black"
              controls
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={splitAtCurrentTime}>
                <Scissors className="mr-2 h-4 w-4" />
                Split at playhead
              </Button>
            </div>

            <div className="relative h-8 overflow-hidden rounded-lg bg-muted">
              {clipPlays.map((play) => {
                const left = (play.startTime / selectedClip.duration) * 100;
                const width =
                  ((play.endTime - play.startTime) / selectedClip.duration) *
                  100;
                return (
                  <button
                    key={`${play.videoClipId}-${play.startTime}-${play.index}`}
                    type="button"
                    className="absolute top-0 h-full border-r border-background/30 bg-primary/60 text-[10px] text-primary-foreground hover:bg-primary/80"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onClick={() => seekToPlay(play, play.index)}
                    title={`Play ${play.playNumber}`}
                  >
                    {play.playNumber}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plays in this clip</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {clipPlays.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No plays for this clip.
            </p>
          )}
          {clipPlays.map((play) => (
            <div
              key={`${play.videoClipId}-${play.startTime}-${play.index}`}
              className={`rounded-lg border p-3 ${
                selectedPlayIndex === play.index ? "border-primary" : ""
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <Badge>Play {play.playNumber}</Badge>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removePlay(play.index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {formatDuration(play.startTime)} – {formatDuration(play.endTime)}
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Offense</Label>
                  <div className="mt-1 flex gap-1">
                    {[homeTeam, awayTeam].map((team) => (
                      <Button
                        key={team}
                        type="button"
                        size="sm"
                        variant={play.offenseTeam === team ? "default" : "outline"}
                        onClick={() =>
                          updatePlayField(play.index, "offenseTeam", team)
                        }
                      >
                        {team}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    className="mt-1 min-h-[60px] text-sm"
                    value={play.notes ?? ""}
                    onChange={(e) =>
                      updatePlayField(play.index, "notes", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
