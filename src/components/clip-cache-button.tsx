"use client";

import { Button } from "@/components/ui/button";
import { HardDriveDownload } from "lucide-react";

type ClipCacheButtonProps = {
  supported: boolean;
  cachingAll: boolean;
  loadAllProgress: { done: number; total: number };
  allCached: boolean;
  cachedCount: number;
  clipCount: number;
  onCacheAll: () => void;
};

export function ClipCacheButton({
  supported,
  cachingAll,
  loadAllProgress,
  allCached,
  cachedCount,
  clipCount,
  onCacheAll,
}: ClipCacheButtonProps) {
  if (!supported) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 rounded-lg px-2 text-xs"
      disabled={cachingAll || allCached || clipCount === 0}
      onClick={() => void onCacheAll()}
    >
      <HardDriveDownload className="mr-1.5 h-3.5 w-3.5" />
      {cachingAll
        ? `Caching ${loadAllProgress.done}/${loadAllProgress.total}`
        : allCached
          ? "All cached"
          : `Cache all (${cachedCount}/${clipCount})`}
    </Button>
  );
}
