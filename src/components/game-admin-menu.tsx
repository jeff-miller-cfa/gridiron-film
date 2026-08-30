"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Film, MoreHorizontal, RefreshCw, Settings, Trash2 } from "lucide-react";

type DialogKind = "reset" | "deleteClips" | "deleteGame";

type GameAdminMenuProps = {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  clipCount: number;
  playCount: number;
  onPlaysReset?: () => void;
  onClipsDeleted?: () => void;
};

export function GameAdminMenu({
  gameId,
  awayTeam,
  homeTeam,
  clipCount,
  playCount,
  onPlaysReset,
  onClipsDeleted,
}: GameAdminMenuProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setError("");
  };

  const handleResetPlays = async () => {
    setBusy(true);
    setError("");

    const res = await fetch(`/api/games/${gameId}/plays/reset`, {
      method: "POST",
    });

    if (res.ok) {
      setBusy(false);
      setDialog(null);
      onPlaysReset?.();
      return;
    }

    setBusy(false);
    setError("Failed to reset plays. Please try again.");
  };

  const handleDeleteClips = async () => {
    setBusy(true);
    setError("");

    const res = await fetch(`/api/games/${gameId}/clips`, {
      method: "DELETE",
    });

    if (res.ok) {
      setBusy(false);
      setDialog(null);
      onClipsDeleted?.();
      return;
    }

    setBusy(false);
    setError("Failed to delete clips. Please try again.");
  };

  const handleDeleteGame = async () => {
    setBusy(true);
    setError("");

    const res = await fetch(`/api/games/${gameId}`, { method: "DELETE" });

    if (res.ok) {
      setDialog(null);
      router.push("/admin");
      router.refresh();
      return;
    }

    setBusy(false);
    setError("Failed to delete game. Please try again.");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" className="rounded-xl">
              <MoreHorizontal className="h-4 w-4" />
              More
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => router.push(`/admin/games/${gameId}/settings`)}
          >
            <Settings />
            Game settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={clipCount === 0}
            onClick={() => setDialog("reset")}
          >
            <RefreshCw />
            Reset plays
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={clipCount === 0}
            onClick={() => setDialog("deleteClips")}
          >
            <Film />
            Delete all clips
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDialog("deleteGame")}
          >
            <Trash2 />
            Delete game
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={dialog === "reset"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all plays?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {playCount} play{playCount === 1 ? "" : "s"}{" "}
              (including splits and removed plays) and creates one full-length
              play per uploaded clip ({clipCount} clip
              {clipCount === 1 ? "" : "s"}). Offense tags and notes will be
              lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void handleResetPlays();
              }}
            >
              {busy ? "Resetting…" : "Reset plays"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialog === "deleteClips"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all clips?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all {clipCount} uploaded clip
              {clipCount === 1 ? "" : "s"} and their plays from{" "}
              <strong>
                {awayTeam} @ {homeTeam}
              </strong>
              . The game record stays, but you will need to upload footage
              again. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteClips();
              }}
            >
              {busy ? "Deleting…" : "Delete all clips"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialog === "deleteGame"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this game?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes{" "}
              <strong>
                {awayTeam} @ {homeTeam}
              </strong>
              , including all uploaded videos and plays. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteGame();
              }}
            >
              {busy ? "Deleting…" : "Delete game"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
