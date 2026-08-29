import { GameCard } from "@/components/game-card";

type AdminGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  gameDateTime: Date | string;
  playCount: number;
  clipCount: number;
};

export function AdminGamesList({ games }: { games: AdminGame[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((game) => (
        <GameCard
          key={game.id}
          id={game.id}
          href={`/admin/games/${game.id}`}
          homeTeam={game.homeTeam}
          awayTeam={game.awayTeam}
          stadium={game.stadium}
          gameDateTime={game.gameDateTime}
          playCount={game.playCount}
          clipCount={game.clipCount}
        />
      ))}
    </div>
  );
}
