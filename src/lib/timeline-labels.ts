export function segmentWidthPx(
  widthPercent: number,
  timelineWidthPx: number,
): number {
  return (widthPercent / 100) * timelineWidthPx;
}

function minLabelWidthPx(playNumber: number): number {
  const digits = String(playNumber).length;
  return digits * 6.5 + 4;
}

export function shouldShowTimelinePlayNumber(
  widthPercent: number,
  timelineWidthPx: number,
  playNumber: number,
  isHighlighted: boolean,
): boolean {
  if (isHighlighted) return true;
  if (timelineWidthPx <= 0) return widthPercent >= 1.2;
  return (
    segmentWidthPx(widthPercent, timelineWidthPx) >= minLabelWidthPx(playNumber)
  );
}
