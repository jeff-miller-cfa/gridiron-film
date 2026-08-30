"use client";

import { formatDuration } from "@/lib/video";
import { cn } from "@/lib/utils";

type PlayerVideoOverlayProps = {
  playNumber: number;
  playPosition: number;
  playDuration: number;
  gamePosition: number;
  gameDuration: number;
  overlayClassName?: string;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
};

function progressPercent(position: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(100, (position / duration) * 100));
}

export function PlayerVideoOverlay({
  playNumber,
  playPosition,
  playDuration,
  gamePosition,
  gameDuration,
  overlayClassName,
  trailing,
  footer,
}: PlayerVideoOverlayProps) {
  const playPercent = progressPercent(playPosition, playDuration);
  const gamePercent = progressPercent(gamePosition, gameDuration);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0">
      <div
        className={cn(
          "bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-8 max-lg:landscape:px-3 max-lg:landscape:pb-2 max-lg:landscape:pt-6",
          overlayClassName,
        )}
      >
        <div className="flex items-end justify-between gap-3 text-xs text-white/90 sm:text-sm max-lg:landscape:text-xs">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-heading text-lg font-bold text-white max-lg:landscape:text-base">
              Play {playNumber}
            </span>
            <span className="tabular-nums text-sm text-white/85 max-lg:landscape:text-xs">
              {formatDuration(playPosition)} / {formatDuration(playDuration)}
            </span>
          </div>
          {trailing}
        </div>
        {footer}
      </div>
      <div className="flex flex-col">
        <div className="h-1.5 w-full bg-black/60">
          <div
            className="h-full bg-amber-400 transition-[width] duration-75 ease-linear"
            style={{ width: `${playPercent}%` }}
          />
        </div>
        <div className="h-1.5 w-full bg-black/60">
          <div
            className="h-full bg-white transition-[width] duration-75 ease-linear"
            style={{ width: `${gamePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
