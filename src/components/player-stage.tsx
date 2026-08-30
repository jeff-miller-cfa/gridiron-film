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
  const pinningEnabled = !isMobileLandscape;

  const stageTop = headerOffset + STAGE_INSET_Y_PX;
  const stageHeight = useMemo(() => {
    const insets = STAGE_INSET_Y_PX * 2;

    if (isMobileLandscape) {
      return `calc(100svh - var(--site-header-height, 2.75rem) - ${insets}px)`;
    }

    return `calc(100svh - ${headerOffset}px - ${insets}px)`;
  }, [headerOffset, isMobileLandscape]);

  useEffect(() => {
    if (!pinningEnabled) {
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
  }, [headerOffset, pinningEnabled]);

  const isPinned = pinningEnabled && pinned;

  return (
    <>
      {pinningEnabled ? (
        <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
      ) : null}
      <div
        className={cn(
          "flex min-h-0 flex-col gap-3 bg-background sm:gap-4 max-lg:landscape:gap-2",
          isPinned
            ? "fixed inset-x-0 z-30 px-4 sm:px-6"
            : "relative my-3 w-full max-lg:landscape:my-2",
          className,
        )}
        style={{
          top: isPinned ? stageTop : undefined,
          height: stageHeight,
        }}
      >
        {children}
      </div>
      {isPinned ? (
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
