import { cn } from "@/lib/utils";

export type OffenseTimelineTone = "home" | "away" | "unknown";

export function offenseTimelineTone(
  offenseTeam: string | null | undefined,
  homeTeam: string,
  awayTeam: string,
): OffenseTimelineTone {
  if (!offenseTeam) return "unknown";
  if (offenseTeam === homeTeam) return "home";
  if (offenseTeam === awayTeam) return "away";
  return "unknown";
}

export function playTimelineSegmentClass(
  tone: OffenseTimelineTone,
  isSelected: boolean,
): string {
  const base =
    "absolute top-0 flex h-full items-center justify-center border-r border-white/40 text-[10px] font-bold transition-colors sm:text-xs";

  if (isSelected) {
    switch (tone) {
      case "home":
        return cn(base, "bg-primary text-primary-foreground");
      case "away":
        return cn(base, "bg-accent text-accent-foreground");
      case "unknown":
        return cn(base, "bg-chart-3 text-white");
    }
  }

  switch (tone) {
    case "home":
      return cn(base, "bg-primary/50 text-white hover:bg-primary/70");
    case "away":
      return cn(base, "bg-accent/55 text-white hover:bg-accent/75");
    case "unknown":
      return cn(base, "bg-chart-3/50 text-white hover:bg-chart-3/70");
  }
}
