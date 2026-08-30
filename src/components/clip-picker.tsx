"use client";

import { useMemo, useState } from "react";
import type { ClipLayoutEntry } from "@/lib/clip-layout";
import { clipPlaySummary } from "@/lib/clip-play-editing";
import { offenseTeamBadgeClass } from "@/lib/play-timeline-colors";
import { formatDuration } from "@/lib/video";
import type { PlayDraft } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ClipPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: ClipLayoutEntry[];
  plays: PlayDraft[];
  homeTeam: string;
  awayTeam: string;
  currentIndex: number;
  onSelectClip: (index: number) => void;
};

function ClipPickerBody({
  entries,
  plays,
  homeTeam,
  awayTeam,
  currentIndex,
  unprocessedCount,
  showUnprocessedOnly,
  onToggleUnprocessedOnly,
  onSelectClip,
}: {
  entries: ClipLayoutEntry[];
  plays: PlayDraft[];
  homeTeam: string;
  awayTeam: string;
  currentIndex: number;
  unprocessedCount: number;
  showUnprocessedOnly: boolean;
  onToggleUnprocessedOnly: () => void;
  onSelectClip: (index: number) => void;
}) {
  const clipRows = useMemo(
    () =>
      entries.map((entry, index) => ({
        index,
        duration: entry.clip.duration,
        summary: clipPlaySummary(plays, entry),
      })),
    [entries, plays],
  );

  const visibleRows = useMemo(
    () =>
      showUnprocessedOnly
        ? clipRows.filter((row) => row.summary.hasWrapper)
        : clipRows,
    [clipRows, showUnprocessedOnly],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-3">
        <p className="text-sm text-muted-foreground">
          Jump to any clip. Unprocessed clips still have a single full-clip
          placeholder play.
          {unprocessedCount > 0 ? (
            <>
              {" "}
              <span className="font-medium text-foreground">
                {unprocessedCount} unprocessed.
              </span>
            </>
          ) : null}
        </p>

        {unprocessedCount > 0 ? (
          <Button
            type="button"
            variant={showUnprocessedOnly ? "default" : "outline"}
            size="sm"
            className="w-fit rounded-lg"
            onClick={onToggleUnprocessedOnly}
          >
            {showUnprocessedOnly
              ? "Show all clips"
              : `Show unprocessed only (${unprocessedCount})`}
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visibleRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No unprocessed clips left.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleRows.map(({ index, duration, summary }) => {
              const isCurrent = index === currentIndex;
              const { hasWrapper, isEmpty, plays } = summary;

              return (
                <button
                  key={entries[index]!.clip.id}
                  type="button"
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    isEmpty &&
                      (isCurrent
                        ? "border-dashed border-muted-foreground/35 bg-muted/30 opacity-80 ring-1 ring-muted-foreground/15"
                        : "border-dashed border-muted-foreground/25 bg-muted/20 opacity-65 hover:opacity-80"),
                    hasWrapper &&
                      (isCurrent
                        ? "border-amber-500/40 bg-amber-500/10 ring-1 ring-amber-500/25"
                        : "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/40 hover:bg-amber-500/10"),
                    !isEmpty &&
                      !hasWrapper &&
                      (isCurrent
                        ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                        : "border-border/80 bg-card hover:border-primary/20 hover:bg-muted/50"),
                  )}
                  onClick={() => onSelectClip(index)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "shrink-0 font-semibold tabular-nums",
                          isEmpty
                            ? "text-muted-foreground"
                            : "text-foreground",
                        )}
                      >
                        Clip {index + 1}
                      </span>
                      {hasWrapper ? (
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                          Unprocessed
                        </span>
                      ) : null}
                      {isEmpty ? (
                        <span className="rounded-md border border-dashed border-muted-foreground/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Empty
                        </span>
                      ) : null}
                      {plays.map((play) => (
                        <span
                          key={play.playNumber}
                          className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-xs"
                        >
                          <span className="font-semibold text-primary tabular-nums">
                            Play {play.playNumber}
                          </span>
                          {play.offenseTeam ? (
                            <span
                              className={offenseTeamBadgeClass(
                                play.offenseTeam,
                                homeTeam,
                                awayTeam,
                              )}
                            >
                              {play.offenseTeam}
                            </span>
                          ) : null}
                          <span className="text-muted-foreground tabular-nums">
                            {formatDuration(play.duration)}
                          </span>
                        </span>
                      ))}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                        isEmpty
                          ? "bg-muted/50 text-muted-foreground/70"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {formatDuration(duration)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ClipPicker({
  open,
  onOpenChange,
  entries,
  plays,
  homeTeam,
  awayTeam,
  currentIndex,
  onSelectClip,
}: ClipPickerProps) {
  const [showUnprocessedOnly, setShowUnprocessedOnly] = useState(false);

  const unprocessedCount = useMemo(
    () =>
      entries.filter((entry) => clipPlaySummary(plays, entry).hasWrapper)
        .length,
    [entries, plays],
  );

  const handleSelect = (index: number) => {
    onSelectClip(index);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setShowUnprocessedOnly(false);
    }
    onOpenChange(next);
  };

  const bodyProps = {
    entries,
    plays,
    homeTeam,
    awayTeam,
    currentIndex,
    unprocessedCount,
    showUnprocessedOnly,
    onToggleUnprocessedOnly: () =>
      setShowUnprocessedOnly((value) => !value),
    onSelectClip: handleSelect,
  };

  return (
    <>
      <div className="max-lg:portrait:hidden">
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="flex h-[min(85dvh,40rem)] max-h-[min(85dvh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-4 pr-12">
              <DialogTitle>All clips</DialogTitle>
              <DialogDescription className="sr-only">
                Jump to any clip in this game.
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
              <ClipPickerBody {...bodyProps} />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="hidden max-lg:portrait:block">
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent
            side="bottom"
            className="flex h-[75vh] max-h-[75vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 data-[side=bottom]:h-[75vh] data-[side=bottom]:max-h-[75vh]"
          >
            <SheetHeader className="shrink-0 border-b border-border/60 p-4 pr-12">
              <SheetTitle className="font-heading">All clips</SheetTitle>
              <SheetDescription className="sr-only">
                Jump to any clip in this game.
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
              <ClipPickerBody {...bodyProps} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
