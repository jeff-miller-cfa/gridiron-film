import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { GamePlayer } from "@/components/game-player";
import { Badge } from "@/components/ui/badge";
import { formatGameDate } from "@/lib/video";
import { getGameById } from "@/lib/games";
import { Calendar, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function GameWatchPage({ params }: PageProps) {
  const { id } = await params;
  const game = await getGameById(id);

  if (!game) notFound();

  const plays = game.plays ?? [];

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-8 surface-card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Now watching
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="text-muted-foreground">{game.awayTeam}</span>
            <span className="mx-3 font-normal text-border">@</span>
            {game.homeTeam}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="gap-1.5 bg-primary/10 text-primary">
              <MapPin className="h-3 w-3" />
              {game.stadium}
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <Calendar className="h-3 w-3" />
              {formatGameDate(game.gameDateTime)}
            </Badge>
            <Badge className="bg-accent/10 text-accent hover:bg-accent/15">
              {plays.length} plays
            </Badge>
          </div>
        </div>

        <GamePlayer
          plays={plays}
          clips={game.videoClips ?? []}
          homeTeam={game.homeTeam}
          awayTeam={game.awayTeam}
        />
      </main>
    </PageShell>
  );
}
