"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";

type UseTimelineScrubOptions = {
  timelineRef: RefObject<HTMLDivElement | null>;
  fullDuration: number;
  fullPosition: number;
  onSeek: (position: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
};

export function useTimelineScrub({
  timelineRef,
  fullDuration,
  fullPosition,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: UseTimelineScrubOptions) {
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const scrubbingRef = useRef(false);
  const lastSeekRef = useRef(0);

  const positionFromClientX = useCallback(
    (clientX: number) => {
      const el = timelineRef.current;
      if (!el || fullDuration <= 0) return 0;

      const rect = el.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      return ratio * fullDuration;
    },
    [timelineRef, fullDuration],
  );

  const beginScrub = useCallback(
    (clientX: number) => {
      scrubbingRef.current = true;
      const position = positionFromClientX(clientX);
      setScrubPosition(position);
      onScrubStart?.();
      onSeek(position);
      lastSeekRef.current = Date.now();
    },
    [onScrubStart, onSeek, positionFromClientX],
  );

  useEffect(() => {
    const handleMove = (event: globalThis.PointerEvent) => {
      if (!scrubbingRef.current) return;

      const position = positionFromClientX(event.clientX);
      setScrubPosition(position);

      const now = Date.now();
      if (now - lastSeekRef.current >= 75) {
        onSeek(position);
        lastSeekRef.current = now;
      }
    };

    const handleEnd = (event: globalThis.PointerEvent) => {
      if (!scrubbingRef.current) return;

      scrubbingRef.current = false;
      const position = positionFromClientX(event.clientX);
      setScrubPosition(null);
      onSeek(position);
      onScrubEnd?.();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [onScrubEnd, onSeek, positionFromClientX]);

  const displayPosition = scrubPosition ?? fullPosition;
  const playheadPercent =
    fullDuration > 0 ? (displayPosition / fullDuration) * 100 : 0;

  const onTimelinePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginScrub(event.clientX);
  };

  const onPlayheadPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginScrub(event.clientX);
  };

  return {
    playheadPercent,
    isScrubbing: scrubPosition !== null,
    onTimelinePointerDown,
    onPlayheadPointerDown,
  };
}
