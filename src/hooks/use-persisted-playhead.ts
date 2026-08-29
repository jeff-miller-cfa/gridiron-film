"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const CLIP_PARAM = "clip";
const TIME_PARAM = "t";

export type PersistedPlayhead = {
  clipId: string;
  time: number;
};

export function parsePersistedPlayhead(
  params: URLSearchParams,
): PersistedPlayhead | null {
  const clipId = params.get(CLIP_PARAM);
  const timeRaw = params.get(TIME_PARAM);
  if (!clipId || !timeRaw) return null;

  const time = Number(timeRaw);
  if (!Number.isFinite(time) || time < 0) return null;

  return { clipId, time };
}

export function usePersistedPlayhead() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenRef = useRef<string | null>(null);

  const persisted = parsePersistedPlayhead(searchParams);

  const persistPlayhead = useCallback(
    (clipId: string, time: number) => {
      const rounded = Math.round(time * 10) / 10;
      const key = `${clipId}:${rounded}`;
      if (key === lastWrittenRef.current) return;

      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = setTimeout(() => {
        const next = new URLSearchParams(searchParams.toString());
        next.set(CLIP_PARAM, clipId);
        next.set(TIME_PARAM, String(rounded));
        lastWrittenRef.current = key;
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }, 400);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, []);

  return { persisted, persistPlayhead };
}
