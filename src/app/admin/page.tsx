import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { AdminGamesList } from "@/components/admin-games-list";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getAllGames } from "@/lib/games";
import { Plus } from "lucide-react";
import { AdminLogoutButton } from "@/components/admin-logout-button";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const games = await getAllGames();

  return (
    <PageShell variant="admin">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          eyebrow="Administration"
          title="Manage games"
          description="Upload footage, define plays, and export stitched film."
          actions={
            <>
              <Link href="/admin/games/new" className={buttonVariants()}>
                <Plus className="mr-2 h-4 w-4" />
                New game
              </Link>
              <AdminLogoutButton />
            </>
          }
        />

        {games.length === 0 ? (
          <Card className="surface-card border-dashed">
            <CardContent className="py-16 text-center text-muted-foreground">
              No games yet. Create your first game to get started.
            </CardContent>
          </Card>
        ) : (
          <AdminGamesList
            games={games.map((game) => ({
              id: game.id,
              homeTeam: game.homeTeam,
              awayTeam: game.awayTeam,
              stadium: game.stadium,
              gameDateTime: game.gameDateTime,
              playCount:
                game.plays?.filter((p) => !p.deletedAt).length ?? 0,
              clipCount: game.videoClips?.length ?? 0,
            }))}
          />
        )}
      </main>
    </PageShell>
  );
}
