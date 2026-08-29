import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { GamePlayer } from "@/components/game-player";
import { formatGameDate } from "@/lib/video";
import { getGameById } from "@/lib/games";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function GameWatchPage({ params }: PageProps) {
  const { id } = await params;
  const game = await getGameById(id);

  if (!game) notFound();

  const plays = [...(game.plays ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            {game.awayTeam} @ {game.homeTeam}
          </h1>
          <p className="text-sm text-muted-foreground">
            {game.stadium} · {formatGameDate(game.gameDateTime)}
          </p>
        </div>

        <GamePlayer
          plays={plays}
          homeTeam={game.homeTeam}
          awayTeam={game.awayTeam}
        />
      </main>
    </div>
  );
}
