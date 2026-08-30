import {
  boolean,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  stadium: text("stadium").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  gameDateTime: timestamp("game_date_time", { withTimezone: true }).notNull(),
  playLookbackSeconds: real("play_lookback_seconds").notNull().default(2),
  viewerAudioMuted: boolean("viewer_audio_muted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const videoClips = pgTable("video_clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  blobUrl: text("blob_url").notNull(),
  filename: text("filename").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  duration: real("duration").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const plays = pgTable("plays", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  startTime: real("start_time").notNull().default(0),
  endTime: real("end_time").notNull(),
  offenseTeam: text("offense_team"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gamesRelations = relations(games, ({ many }) => ({
  videoClips: many(videoClips),
  plays: many(plays),
}));

export const videoClipsRelations = relations(videoClips, ({ one }) => ({
  game: one(games, {
    fields: [videoClips.gameId],
    references: [games.id],
  }),
}));

export const playsRelations = relations(plays, ({ one }) => ({
  game: one(games, {
    fields: [plays.gameId],
    references: [games.id],
  }),
}));

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type VideoClip = typeof videoClips.$inferSelect;
export type Play = typeof plays.$inferSelect;
