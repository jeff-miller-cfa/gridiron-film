"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/**
 * Fullscreen for a container element with custom overlays.
 *
 * Where the Fullscreen API works on elements (desktop, Android Chrome) we
 * fullscreen the container so the overlays stay on top. iOS Safari does NOT
 * support element fullscreen — its only option is the native <video> player,
 * which hides our overlays — so there (and anywhere a request is blocked) we
 * fall back to a CSS "pseudo fullscreen": the caller pins the container to the
 * viewport while the page stays put, keeping every overlay as normal DOM.
 */
export function useFullscreen(
  containerRef: RefObject<HTMLElement | null>,
) {
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);

  useEffect(() => {
    const doc = document as FullscreenDocument;
    const sync = () =>
      setIsNativeFullscreen(
        Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement),
      );

    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  // Pseudo fullscreen: lock background scroll and allow Escape to exit.
  useEffect(() => {
    if (!isPseudoFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPseudoFullscreen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isPseudoFullscreen]);

  const toggle = useCallback(async () => {
    const doc = document as FullscreenDocument;
    const container = containerRef.current as FullscreenElement | null;

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }

    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
      try {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      } catch {
        // ignore
      }
      return;
    }

    // Prefer real element fullscreen so overlays stay visible.
    try {
      if (container?.requestFullscreen) {
        await container.requestFullscreen();
        return;
      }
      if (container?.webkitRequestFullscreen) {
        await container.webkitRequestFullscreen();
        return;
      }
    } catch {
      // Blocked or unsupported — fall through to pseudo fullscreen.
    }

    // iOS Safari (or a blocked request): pin the frame to the viewport so the
    // overlays come along, instead of the native player that hides them.
    setIsPseudoFullscreen(true);
  }, [containerRef, isPseudoFullscreen]);

  return {
    isFullscreen: isNativeFullscreen || isPseudoFullscreen,
    isPseudoFullscreen,
    toggle,
  };
}
