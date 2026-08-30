"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clipIdsForGameRange } from "@/lib/clip-layout";
import {
  cacheClip,
  getCachedClipIds,
  getClipPlaybackUrl,
  isClipCacheSupported,
  releaseClipPlaybackUrls,
} from "@/lib/clip-cache";
import type { VideoClipRecord } from "@/types";

export type ClipCacheApi = ReturnType<typeof useClipCache>;

export function useClipCache(clips: VideoClipRecord[]) {
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadAllProgress, setLoadAllProgress] = useState({ done: 0, total: 0 });
  const supported = isClipCacheSupported();

  const refreshCachedIds = useCallback(async () => {
    if (!supported) {
      setCachedIds(new Set());
      return new Set<string>();
    }

    const ids = await getCachedClipIds(clips);
    setCachedIds(ids);
    return ids;
  }, [clips, supported]);

  useEffect(() => {
    void refreshCachedIds();
  }, [refreshCachedIds]);

  useEffect(() => () => releaseClipPlaybackUrls(), []);

  const warmClip = useCallback(
    async (clip: VideoClipRecord) => {
      if (!supported) return false;
      const cached = await cacheClip(clip);
      if (cached) {
        setCachedIds((current) => new Set(current).add(clip.id));
      }
      return cached;
    },
    [supported],
  );

  const resolvePlaybackUrl = useCallback(
    async (clip: VideoClipRecord) => getClipPlaybackUrl(clip),
    [],
  );

  const cacheAll = useCallback(async () => {
    if (!supported || clips.length === 0 || loadingAll) return;

    setLoadingAll(true);
    setLoadAllProgress({ done: 0, total: clips.length });

    try {
      for (let index = 0; index < clips.length; index++) {
        const clip = clips[index]!;
        await warmClip(clip);
        setLoadAllProgress({ done: index + 1, total: clips.length });
      }
    } finally {
      setLoadingAll(false);
    }
  }, [clips, loadingAll, supported, warmClip]);

  const isPlayCached = useCallback(
    (startTime: number, endTime: number) => {
      const ids = clipIdsForGameRange(startTime, endTime, clips);
      if (ids.length === 0) return false;
      return ids.every((id) => cachedIds.has(id));
    },
    [cachedIds, clips],
  );

  const allCached = useMemo(
    () => clips.length > 0 && clips.every((clip) => cachedIds.has(clip.id)),
    [cachedIds, clips],
  );

  return {
    supported,
    cachedIds,
    cachedCount: cachedIds.size,
    loadingAll,
    loadAllProgress,
    allCached,
    warmClip,
    resolvePlaybackUrl,
    cacheAll,
    isPlayCached,
    refreshCachedIds,
  };
}
