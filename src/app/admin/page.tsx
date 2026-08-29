import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatGameDate } from "@/lib/video";
import { getAllGames } from "@/lib/games";
import { Plus } from "lucide-react";
import { AdminLogoutButton } from "@/components/admin-logout-button";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const games = await getAllGames();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
            <p className="text-muted-foreground">
              Upload footage and process plays.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/games/new"
              className={buttonVariants()}
            >
              <Plus className="mr-2 h-4 w-4" />
              New game
            </Link>
            <AdminLogoutButton />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Link key={game.id} href={`/admin/games/${game.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
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
                <CardContent className="text-sm text-muted-foreground">
                  <p>{game.stadium}</p>
                  <p>{formatGameDate(game.gameDateTime)}</p>
                  <p className="mt-2">
                    {game.videoClips?.length ?? 0} video clips
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {games.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No games yet. Create your first game to get started.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
