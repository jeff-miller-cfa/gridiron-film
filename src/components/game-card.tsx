import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatGameDate } from "@/lib/video";
import { Calendar, MapPin, Play } from "lucide-react";

type GameCardProps = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  gameDateTime: Date | string;
  playCount: number;
  clipCount?: number;
  href: string;
};

export function GameCard({
  homeTeam,
  awayTeam,
  stadium,
  gameDateTime,
  playCount,
  clipCount,
  href,
}: GameCardProps) {
  return (
    <Link href={href} className="group block h-full">
      <Card className="h-full overflow-hidden border-border/80 bg-card/90 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
        <div className="h-1.5 bg-gradient-to-r from-primary via-primary to-accent" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Matchup
              </p>
              <h3 className="font-heading text-xl font-bold leading-tight text-foreground group-hover:text-primary">
                <span className="text-muted-foreground">{awayTeam}</span>
                <span className="mx-2 font-normal text-border">@</span>
                {homeTeam}
              </h3>
            </div>
            <Badge className="shrink-0 bg-accent/10 text-accent hover:bg-accent/15">
              <Play className="mr-1 h-3 w-3" />
              {playCount} plays
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-primary/60" />
            {stadium}
          </p>
          <p className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-primary/60" />
            {formatGameDate(gameDateTime)}
          </p>
          {clipCount !== undefined && clipCount > 0 && (
            <p className="pt-1 text-xs text-muted-foreground/80">
              {clipCount} video clip{clipCount === 1 ? "" : "s"}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
