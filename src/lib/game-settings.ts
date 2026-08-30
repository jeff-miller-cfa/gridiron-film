export const DEFAULT_PLAY_LOOKBACK_SECONDS = 2;
export const MIN_PLAY_LOOKBACK_SECONDS = 0;
export const MAX_PLAY_LOOKBACK_SECONDS = 30;

export function normalizePlayLookbackSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PLAY_LOOKBACK_SECONDS;
  }

  return Math.min(
    MAX_PLAY_LOOKBACK_SECONDS,
    Math.max(MIN_PLAY_LOOKBACK_SECONDS, Math.round(parsed)),
  );
}

export function formatPlayLookbackLabel(seconds: number): string {
  return `${normalizePlayLookbackSeconds(seconds)}s`;
}

export function toDatetimeLocalValue(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
