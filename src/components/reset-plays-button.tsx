"use client";

import { useState } from "react";
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
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type ResetPlaysButtonProps = {
  gameId: string;
  clipCount: number;
  playCount: number;
  className?: string;
  onReset?: () => void;
};

export function ResetPlaysButton({
  gameId,
  clipCount,
  playCount,
  className,
  onReset,
}: ResetPlaysButtonProps) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    setResetting(true);
    setError("");

    const res = await fetch(`/api/games/${gameId}/plays/reset`, {
      method: "POST",
    });

    if (res.ok) {
      setResetting(false);
      setOpen(false);
      onReset?.();
      return;
    }

    setResetting(false);
    setError("Failed to reset plays. Please try again.");
  };

  const disabled = clipCount === 0;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        disabled={disabled}
        className={cn(
          "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium whitespace-nowrap text-foreground transition-all hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        <RefreshCw className="h-4 w-4" />
        Reset plays
      </AlertDialogTrigger>
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
          <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={resetting}
            onClick={(e) => {
              e.preventDefault();
              void handleReset();
            }}
          >
            {resetting ? "Resetting…" : "Reset plays"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
