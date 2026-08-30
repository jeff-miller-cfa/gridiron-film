"use client";

import { Button } from "@/components/ui/button";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

type PlayerLoopToggleProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
};

export function PlayerLoopToggle({
  enabled,
  onChange,
  className,
}: PlayerLoopToggleProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "rounded-xl backdrop-blur-sm transition-colors",
        enabled
          ? "border-amber-300 bg-amber-400 text-slate-950 shadow-[0_0_0_2px_rgba(251,191,36,0.55)] hover:border-amber-200 hover:bg-amber-300 hover:text-slate-950"
          : "border-white/25 bg-black/50 text-white/80 hover:border-white/35 hover:bg-black/65 hover:text-white",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!enabled);
      }}
      title={enabled ? "Loop play: on" : "Loop play: off"}
      aria-pressed={enabled}
      aria-label={enabled ? "Disable play loop" : "Enable play loop"}
    >
      <Repeat
        className={cn("h-4 w-4", enabled && "stroke-[2.5px]")}
      />
    </Button>
  );
}
