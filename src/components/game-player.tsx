"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDuration } from "@/lib/video";
import type { PlayWithClip } from "@/types";
import { List, SkipBack, SkipForward } from "lucide-react";

type GamePlayerProps = {
  plays: PlayWithClip[];
  homeTeam: string;
  awayTeam: string;
};

export function GamePlayer({ plays, homeTeam, awayTeam }: GamePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentPlay = plays[currentIndex];

  const loadPlay = useCallback(
    (index: number, autoplay = false) => {
      const play = plays[index];
      if (!play?.videoClip) return;

      const video = videoRef.current;
      if (!video) return;

      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        if (autoplay) void video.play();
      };

      if (video.src !== play.videoClip.blobUrl) {
        video.src = play.videoClip.blobUrl;
        video.load();
        video.addEventListener("loadedmetadata", () => {
          video.currentTime = play.startTime;
        }, { once: true });
        video.addEventListener("seeked", onSeeked);
      } else {
        video.currentTime = play.startTime;
        video.addEventListener("seeked", onSeeked);
      }

      setCurrentIndex(index);
    },
    [plays],
  );

  useEffect(() => {
    loadPlay(0);
  }, [loadPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentPlay) return;

    const onTimeUpdate = () => {
      if (video.currentTime >= currentPlay.endTime - 0.05) {
        if (currentIndex < plays.length - 1) {
          loadPlay(currentIndex + 1, isPlaying);
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [currentIndex, currentPlay, isPlaying, loadPlay, plays.length]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const playList = (
    <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto md:max-h-none">
      {plays.map((play, index) => (
        <button
          key={play.id}
          type="button"
          onClick={() => loadPlay(index, true)}
          className={`rounded-lg border p-3 text-left transition-colors ${
            index === currentIndex
              ? "border-primary bg-primary/10"
              : "border-border hover:bg-muted/50"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Play {play.playNumber}</span>
            <span className="text-xs text-muted-foreground">
              {formatDuration(play.endTime - play.startTime)}
            </span>
          </div>
          {play.offenseTeam && (
            <p className="mt-1 text-xs text-muted-foreground">
              Offense: {play.offenseTeam}
            </p>
          )}
          {play.notes && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {play.notes}
            </p>
          )}
        </button>
      ))}
    </div>
  );

  if (!currentPlay?.videoClip) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No plays have been processed for this game yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            className="aspect-video w-full"
            playsInline
            controls={false}
            onClick={togglePlay}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
            <div className="flex items-center justify-between text-sm text-white">
              <span className="font-semibold">Play {currentPlay.playNumber}</span>
              {currentPlay.offenseTeam && (
                <Badge variant="secondary" className="bg-white/20 text-white">
                  {currentPlay.offenseTeam}
                </Badge>
              )}
            </div>
            {currentPlay.notes && (
              <p className="mt-1 text-xs text-white/80">{currentPlay.notes}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={currentIndex === 0}
              onClick={() => loadPlay(currentIndex - 1, true)}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button onClick={togglePlay}>
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentIndex >= plays.length - 1}
              onClick={() => loadPlay(currentIndex + 1, true)}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {currentIndex + 1} / {plays.length}
          </p>
        </div>

        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger
              className={buttonVariants({ variant: "outline", className: "w-full" })}
            >
              <List className="mr-2 h-4 w-4" />
              All Plays ({plays.length})
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[70vh]">
              <SheetHeader>
                <SheetTitle>
                  {awayTeam} @ {homeTeam}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4">{playList}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card className="hidden lg:block">
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold">Plays</h2>
          {playList}
        </CardContent>
      </Card>
    </div>
  );
}
