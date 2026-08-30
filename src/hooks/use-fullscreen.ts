"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSupportsFullscreen?: boolean;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/**
 * Toggle fullscreen for a container element, with an iOS Safari fallback that
 * uses the native `<video>` fullscreen (the only thing iOS allows). Tracks
 * fullscreen state for the standard and WebKit-prefixed APIs.
 */
export function useFullscreen(
  containerRef: RefObject<HTMLElement | null>,
  videoRef?: RefObject<HTMLVideoElement | null>,
) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const doc = document as FullscreenDocument;
    const sync = () =>
      setIsFullscreen(
        Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement),
      );

    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);

    const video = videoRef?.current;
    video?.addEventListener("webkitbeginfullscreen", () => setIsFullscreen(true));
    video?.addEventListener("webkitendfullscreen", () => setIsFullscreen(false));

    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [videoRef]);

  const toggle = useCallback(async () => {
    const doc = document as FullscreenDocument;
    const container = containerRef.current as FullscreenElement | null;
    const video = videoRef?.current as FullscreenVideo | null;

    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
      try {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      } catch {
        // ignore — nothing else we can do to exit
      }
      return;
    }

    // Prefer fullscreening the frame so custom overlays stay visible; if that's
    // blocked/unsupported (e.g. iOS, or an iframe without the permission), fall
    // back to the native <video> fullscreen.
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
      // fall through to the video-element fallback below
    }
    video?.webkitEnterFullscreen?.();
  }, [containerRef, videoRef]);

  return { isFullscreen, toggle };
}
