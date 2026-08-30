"use client";

import { Button } from "@/components/ui/button";
import { Maximize, Minimize } from "lucide-react";
import { cn } from "@/lib/utils";

type FullscreenButtonProps = {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
};

export function FullscreenButton({
  isFullscreen,
  onToggle,
  className,
}: FullscreenButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "rounded-xl border-white/25 bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:border-white/35 hover:bg-black/65 hover:text-white",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      title={isFullscreen ? "Exit full screen" : "Full screen"}
      aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
    >
      {isFullscreen ? (
        <Minimize className="h-4 w-4" />
      ) : (
        <Maximize className="h-4 w-4" />
      )}
    </Button>
  );
}
