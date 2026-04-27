import { pgTable, serial, text, date, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const museums = pgTable("museums", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  homepageUrl: text("homepage_url").notNull(),
  exhibitionsPageUrl: text("exhibitions_page_url").notNull(),
}, (t) => [unique().on(t.homepageUrl)]);

export const exhibitions = pgTable("exhibitions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  image: text("image"),
  imageCredit: text("image_credit"),
  artist: text("artist"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  museumId: integer("museum_id")
    .notNull()
    .references(() => museums.id),
  link: text("link"),
  hidden: boolean("hidden").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.link)]);

export const museumsRelations = relations(museums, ({ many }) => ({
  exhibitions: many(exhibitions),
}));

export const exhibitionsRelations = relations(exhibitions, ({ one }) => ({
  museum: one(museums, { fields: [exhibitions.museumId], references: [museums.id] }),
}));

export type Museum = typeof museums.$inferSelect;
export type NewMuseum = typeof museums.$inferInsert;
export type Exhibition = typeof exhibitions.$inferSelect;
export type NewExhibition = typeof exhibitions.$inferInsert;
