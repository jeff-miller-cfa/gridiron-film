"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ExportProgress,
  useStitchedExport,
  type ExportSource,
} from "@/components/export-video-button";

type ExportGameDrawerProps = ExportSource & {
  // Follows the game's viewer audio setting rather than a manual toggle.
  muteAudio?: boolean;
};

// Viewer-facing export: a small trigger button (meant for the game header) that
// opens a bottom drawer and kicks off the stitched export, showing progress.
export function ExportGameDrawer({
  plays,
  clips,
  gameTitle,
  muteAudio = false,
}: ExportGameDrawerProps) {
  const [open, setOpen] = useState(false);
  const exp = useStitchedExport({ plays, clips, gameTitle });
  const hasFootage = plays.length > 0 && clips.length > 0;

  const startExport = () => void exp.start(muteAudio);

  // Start the export automatically the first time the drawer opens.
  const autostarted = useRef(false);
  useEffect(() => {
    if (open && hasFootage && !autostarted.current) {
      autostarted.current = true;
      startExport();
    } else if (!open && !exp.exporting) {
      // Allow a fresh run next time the drawer is reopened.
      autostarted.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!hasFootage) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "rounded-xl",
        })}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Export
      </button>
      <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-heading">Export game</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          {!exp.exporting && exp.playProgress.length > 0 && (
            <Button onClick={startExport}>
              <Download className="mr-2 h-4 w-4" />
              Export again
            </Button>
          )}
          <ExportProgress exp={exp} />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Export stitches all active plays into a single video with play
            numbers in a footer overlay.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
