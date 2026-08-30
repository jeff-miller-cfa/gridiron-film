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

function toneStyles(tone: OffenseTimelineTone) {
  switch (tone) {
    case "home":
      return {
        solid: "bg-primary text-primary-foreground",
        tint: "bg-primary/50 text-white hover:bg-primary/70",
        buttonSolid:
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        buttonTint:
          "border-primary/35 bg-primary/50 text-white hover:bg-primary/70",
      };
    case "away":
      return {
        solid: "bg-chart-3 text-white",
        tint: "bg-chart-3/55 text-white hover:bg-chart-3/75",
        buttonSolid: "border-chart-3 bg-chart-3 text-white hover:bg-chart-3/90",
        buttonTint:
          "border-chart-3/35 bg-chart-3/55 text-white hover:bg-chart-3/75",
      };
    case "unknown":
      return {
        solid: "bg-muted-foreground text-white",
        tint: "bg-muted-foreground/45 text-white hover:bg-muted-foreground/60",
        buttonSolid:
          "border-muted-foreground bg-muted-foreground text-white hover:bg-muted-foreground/90",
        buttonTint:
          "border-muted-foreground/35 bg-muted-foreground/45 text-white hover:bg-muted-foreground/60",
      };
  }
}

export function playTimelineSegmentClass(
  tone: OffenseTimelineTone,
  isSelected: boolean,
): string {
  const base =
    "absolute top-0 flex h-full items-center justify-center border-r border-white/40 text-[10px] font-bold transition-colors sm:text-xs";
  const palette = toneStyles(tone);

  return cn(base, isSelected ? palette.solid : palette.tint);
}

export function teamTimelineTone(
  team: string,
  homeTeam: string,
  awayTeam: string,
): OffenseTimelineTone {
  if (team === homeTeam) return "home";
  if (team === awayTeam) return "away";
  return "unknown";
}

export function playListTeamButtonClass(
  team: string,
  homeTeam: string,
  awayTeam: string,
  selectedOffenseTeam: string | null | undefined,
): string {
  const tone = teamTimelineTone(team, homeTeam, awayTeam);
  const palette = toneStyles(tone);
  const base =
    "max-w-[5.5rem] truncate border px-1.5 shadow-none hover:opacity-100";

  return cn(
    base,
    selectedOffenseTeam === team ? palette.buttonSolid : palette.buttonTint,
  );
}
