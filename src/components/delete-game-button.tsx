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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type DeleteGameButtonProps = {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  className?: string;
  variant?: "outline" | "ghost" | "destructive";
};

export function DeleteGameButton({
  gameId,
  awayTeam,
  homeTeam,
  className,
  variant = "outline",
}: DeleteGameButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setError("");

    const res = await fetch(`/api/games/${gameId}`, { method: "DELETE" });

    if (res.ok) {
      setOpen(false);
      router.push("/admin");
      router.refresh();
      return;
    }

    setDeleting(false);
    setError("Failed to delete game. Please try again.");
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        className={cn(
          variant === "destructive"
            ? "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-destructive/10 px-2.5 text-sm font-medium whitespace-nowrap text-destructive transition-all hover:bg-destructive/20"
            : "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium whitespace-nowrap text-destructive transition-all hover:bg-destructive/10",
          className,
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </AlertDialogTrigger>
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
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            {deleting ? "Deleting…" : "Delete game"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
