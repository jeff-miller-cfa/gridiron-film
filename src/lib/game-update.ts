import { normalizePlayLookbackSeconds } from "@/lib/game-settings";

export type GameUpdateInput = {
  stadium?: string;
  homeTeam?: string;
  awayTeam?: string;
  gameDateTime?: string;
  playLookbackSeconds?: number;
  viewerAudioMuted?: boolean;
};

export function parseGameUpdateInput(body: unknown): {
  data: GameUpdateInput;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { data: {}, error: "Invalid request body" };
  }

  const input = body as Record<string, unknown>;
  const data: GameUpdateInput = {};

  if ("stadium" in input) {
    const stadium = String(input.stadium ?? "").trim();
    if (!stadium) return { data: {}, error: "Stadium is required" };
    data.stadium = stadium;
  }

  if ("homeTeam" in input) {
    const homeTeam = String(input.homeTeam ?? "").trim();
    if (!homeTeam) return { data: {}, error: "Home team is required" };
    data.homeTeam = homeTeam;
  }

  if ("awayTeam" in input) {
    const awayTeam = String(input.awayTeam ?? "").trim();
    if (!awayTeam) return { data: {}, error: "Away team is required" };
    data.awayTeam = awayTeam;
  }

  if ("gameDateTime" in input) {
    const raw = String(input.gameDateTime ?? "").trim();
    if (!raw) return { data: {}, error: "Date and time are required" };
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return { data: {}, error: "Invalid date and time" };
    }
    data.gameDateTime = parsed.toISOString();
  }

  if ("playLookbackSeconds" in input) {
    data.playLookbackSeconds = normalizePlayLookbackSeconds(
      input.playLookbackSeconds,
    );
  }

  if ("viewerAudioMuted" in input) {
    data.viewerAudioMuted = Boolean(input.viewerAudioMuted);
  }

  if (Object.keys(data).length === 0) {
    return { data: {}, error: "No valid fields to update" };
  }

  return { data };
}
