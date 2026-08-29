"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TIME_PARAM = "t";
const LEGACY_CLIP_PARAM = "clip";

export type PersistedPlayhead = {
  gameTime: number;
};

export function parsePersistedPlayhead(
  params: URLSearchParams,
): PersistedPlayhead | null {
  const timeRaw = params.get(TIME_PARAM);
  if (!timeRaw) return null;

  const gameTime = Number(timeRaw);
  if (!Number.isFinite(gameTime) || gameTime < 0) return null;

  return { gameTime };
}

export function usePersistedPlayhead() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenRef = useRef<string | null>(null);

  const persisted = parsePersistedPlayhead(searchParams);
  const hasLegacyClipParam = searchParams.has(LEGACY_CLIP_PARAM);

  const persistPlayhead = useCallback(
    (gameTime: number) => {
      const rounded = Math.round(gameTime * 10) / 10;
      const key = String(rounded);
      if (key === lastWrittenRef.current) return;

      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = setTimeout(() => {
        const next = new URLSearchParams(searchParams.toString());
        next.delete(LEGACY_CLIP_PARAM);
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

  return { persisted, hasLegacyClipParam, persistPlayhead };
}
