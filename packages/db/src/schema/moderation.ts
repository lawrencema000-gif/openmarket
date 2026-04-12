import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { developers } from "./developers";
import { apps } from "./apps";

export const moderationTargetTypeEnum = pgEnum("moderation_target_type", [
  "app",
  "release",
  "developer",
]);

export const moderationActionEnum = pgEnum("moderation_action", [
  "warn",
  "delist_release",
  "freeze_updates",
  "suspend_developer",
  "reinstate",
]);

export const appealStatusEnum = pgEnum("appeal_status", [
  "none",
  "pending",
  "upheld",
  "overturned",
]);

export const moderationActions = pgTable("moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: moderationTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  action: moderationActionEnum("action").notNull(),
  reason: text("reason").notNull(),
  moderatorId: uuid("moderator_id")
    .references(() => developers.id)
    .notNull(),
  appealStatus: appealStatusEnum("appeal_status").default("none").notNull(),
  appealNotes: text("appeal_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const releaseChannels = pgTable(
  "release_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    channelName: text("channel_name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("release_channels_app_channel_idx").on(
      table.appId,
      table.channelName
    ),
  ]
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0).notNull(),
});
