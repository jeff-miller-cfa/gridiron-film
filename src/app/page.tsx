import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { GameCard } from "@/components/game-card";
import { Card, CardContent } from "@/components/ui/card";
import { getAllGames } from "@/lib/games";
import { Film } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gridiron Film — Game Library",
  description: "Watch processed football game footage play by play",
};

export default async function HomePage() {
  const games = await getAllGames();

  return (
    <PageShell>
      <main className="w-full px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          eyebrow="Film room"
          title="Game library"
          description="Browse processed game film and jump between plays instantly."
        />

        {games.length === 0 ? (
          <Card className="surface-card border-dashed">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Film className="h-7 w-7" />
              </div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                No games yet
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Upload footage from the admin panel to create your first game and
                start breaking down plays.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                href={`/games/${game.id}`}
                homeTeam={game.homeTeam}
                awayTeam={game.awayTeam}
                stadium={game.stadium}
                gameDateTime={game.gameDateTime}
                playCount={game.plays?.length ?? 0}
              />
            ))}
          </div>
        )}
      </main>
    </PageShell>
  );
}
