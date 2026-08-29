import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatGameDate } from "@/lib/video";
import { getAllGames } from "@/lib/games";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gridiron Film — Game Library",
  description: "Watch processed football game footage play by play",
};

export default async function HomePage() {
  const games = await getAllGames();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Games</h1>
          <p className="mt-1 text-muted-foreground">
            Browse and watch processed game film.
          </p>
        </div>

        {games.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No games yet. Use the admin panel to upload footage.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <Link key={game.id} href={`/games/${game.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">
                        {game.awayTeam} @ {game.homeTeam}
                      </CardTitle>
                      <Badge variant="secondary">
                        {game.plays?.length ?? 0} plays
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>{game.stadium}</p>
                    <p>{formatGameDate(game.gameDateTime)}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
