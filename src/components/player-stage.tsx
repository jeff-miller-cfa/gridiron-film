"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSiteHeaderOffsetPx } from "@/hooks/use-site-header-offset";

type PlayerStageProps = {
  children: React.ReactNode;
  className?: string;
};

const STAGE_INSET_Y_PX = 12;

/** Fills the viewport below the site header once the page is scrolled into the player. */
export function PlayerStage({ children, className }: PlayerStageProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const headerOffset = useSiteHeaderOffsetPx();
  const stageTop = headerOffset + STAGE_INSET_Y_PX;
  const stageHeight = `calc(100dvh - ${headerOffset}px - ${STAGE_INSET_Y_PX * 2}px)`;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setPinned(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: `-${headerOffset}px 0px 0px 0px`,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [headerOffset]);

  return (
    <>
      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
      <div
        className={cn(
          "flex min-h-0 flex-col gap-3 bg-background sm:gap-4 max-lg:landscape:gap-2",
          pinned
            ? "fixed inset-x-0 z-30 px-4 sm:px-6"
            : "relative my-3 w-full",
          className,
        )}
        style={{
          top: pinned ? stageTop : undefined,
          height: stageHeight,
        }}
      >
        {children}
      </div>
      {pinned ? (
        <div aria-hidden className="w-full shrink-0" style={{ height: stageHeight }} />
      ) : null}
    </>
  );
}

export const playerMainGridClass =
  "grid min-h-0 flex-1 gap-4 max-lg:portrait:grid-cols-1 max-lg:portrait:grid-rows-[auto_minmax(0,1fr)] max-lg:landscape:grid-cols-[minmax(0,1fr)_minmax(11rem,38%)] max-lg:landscape:gap-2 lg:grid-cols-[1fr_minmax(320px,28rem)] lg:gap-6";

export const playerVideoColumnClass =
  "flex min-h-0 flex-col gap-3 max-lg:landscape:gap-2";

export const playerVideoShellClass =
  "surface-elevated min-h-0 overflow-hidden p-1 max-lg:portrait:shrink-0 lg:flex-1 max-lg:landscape:flex-1";

export const playerVideoFrameClass =
  "relative min-h-0 overflow-hidden rounded-xl bg-slate-900 max-lg:portrait:aspect-video lg:h-full max-lg:landscape:h-full";

export const playerVideoClass =
  "w-full max-lg:portrait:aspect-video max-lg:portrait:h-auto lg:h-full lg:object-contain max-lg:landscape:h-full max-lg:landscape:object-contain";

export const playerPlayListCardClass =
  "surface-card flex min-h-0 flex-col overflow-hidden";

export const playerPlayListContentClass =
  "min-h-0 flex-1 overflow-y-auto";
