"use client";

import { GameCard } from "@/components/game-card";
import { DeleteGameButton } from "@/components/delete-game-button";

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
        <div key={game.id} className="relative">
          <GameCard
            id={game.id}
            href={`/admin/games/${game.id}`}
            homeTeam={game.homeTeam}
            awayTeam={game.awayTeam}
            stadium={game.stadium}
            gameDateTime={game.gameDateTime}
            playCount={game.playCount}
            clipCount={game.clipCount}
          />
          <div
            className="absolute right-3 top-3 z-10"
            onClick={(e) => e.preventDefault()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <DeleteGameButton
              gameId={game.id}
              awayTeam={game.awayTeam}
              homeTeam={game.homeTeam}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
