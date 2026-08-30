"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSiteHeaderOffsetPx } from "@/hooks/use-site-header-offset";

type PlayerStageProps = {
  children: React.ReactNode;
  className?: string;
};

const STAGE_INSET_Y_PX = 12;
const MOBILE_LANDSCAPE_QUERY = "(max-width: 1023px) and (orientation: landscape)";
const PIN_STATE_DEBOUNCE_MS = 75;

function useMobileLandscape() {
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_LANDSCAPE_QUERY);
    const sync = () => setIsMobileLandscape(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  return isMobileLandscape;
}

/** Fills the viewport below the site header once the page is scrolled into the player. */
export function PlayerStage({ children, className }: PlayerStageProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const isMobileLandscape = useMobileLandscape();
  const headerOffset = useSiteHeaderOffsetPx();

  const stageInsetsY = isMobileLandscape ? 0 : STAGE_INSET_Y_PX * 2;
  const stageTop = isMobileLandscape
    ? "var(--site-header-height, 2.75rem)"
    : `${headerOffset + STAGE_INSET_Y_PX}px`;

  const stageHeight = useMemo(() => {
    if (isMobileLandscape) {
      return `calc(100svh - var(--site-header-height, 2.75rem)${stageInsetsY ? ` - ${stageInsetsY}px` : ""})`;
    }

    return `calc(100svh - ${headerOffset}px - ${stageInsetsY}px)`;
  }, [headerOffset, isMobileLandscape, stageInsetsY]);

  useEffect(() => {
    if (isMobileLandscape) {
      setPinned(false);
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let pinTimeout: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        if (pinTimeout) {
          clearTimeout(pinTimeout);
        }

        pinTimeout = setTimeout(() => {
          setPinned((current) => {
            const next = !entry.isIntersecting;
            return current === next ? current : next;
          });
        }, PIN_STATE_DEBOUNCE_MS);
      },
      {
        threshold: 0,
        rootMargin: `-${headerOffset}px 0px 0px 0px`,
      },
    );

    observer.observe(sentinel);
    return () => {
      if (pinTimeout) {
        clearTimeout(pinTimeout);
      }
      observer.disconnect();
    };
  }, [headerOffset, isMobileLandscape]);

  const isFixed = isMobileLandscape || pinned;

  return (
    <>
      {!isMobileLandscape ? (
        <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
      ) : null}
      <div
        className={cn(
          "flex min-h-0 flex-col gap-3 bg-background sm:gap-4 max-lg:landscape:gap-1",
          isFixed
            ? cn(
                "fixed inset-x-0 z-30",
                isMobileLandscape ? "px-2" : "px-4 sm:px-6",
              )
            : "relative my-3 w-full",
          className,
        )}
        style={{
          top: isFixed ? stageTop : undefined,
          height: stageHeight,
        }}
      >
        {children}
      </div>
      {pinned && !isMobileLandscape ? (
        <div aria-hidden className="w-full shrink-0" style={{ height: stageHeight }} />
      ) : null}
    </>
  );
}

export const playerMainGridClass =
  "grid min-h-0 flex-1 gap-4 max-lg:portrait:grid-cols-1 max-lg:portrait:grid-rows-[auto_minmax(0,1fr)] max-lg:landscape:h-full max-lg:landscape:min-h-0 max-lg:landscape:grid-cols-[minmax(0,1fr)_minmax(11rem,38%)] max-lg:landscape:grid-rows-[minmax(0,1fr)] max-lg:landscape:gap-2 lg:h-full lg:min-h-0 lg:grid-cols-[1fr_minmax(320px,28rem)] lg:grid-rows-[minmax(0,1fr)] lg:gap-6";

export const playerVideoColumnClass =
  "flex min-h-0 flex-col gap-3 max-lg:landscape:h-full max-lg:landscape:min-h-0 max-lg:landscape:gap-2";

export const playerVideoShellClass =
  "surface-elevated flex min-h-0 flex-1 overflow-hidden p-1 max-lg:portrait:shrink-0";

export const playerVideoFrameClass =
  "relative flex min-h-0 flex-1 overflow-hidden rounded-xl bg-slate-900 max-lg:portrait:aspect-video max-lg:portrait:flex-none";

export const playerVideoClass =
  "h-full w-full max-lg:portrait:aspect-video max-lg:portrait:h-auto object-contain";

export const playerPlayListCardClass =
  "surface-card flex h-full min-h-0 flex-col overflow-hidden";

export const playerPlayListContentClass =
  "min-h-0 flex-1 overflow-y-auto";
