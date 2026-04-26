import { pgTable, serial, text, date, integer, timestamp, unique } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.link)]);

export type Museum = typeof museums.$inferSelect;
export type NewMuseum = typeof museums.$inferInsert;
export type Exhibition = typeof exhibitions.$inferSelect;
export type NewExhibition = typeof exhibitions.$inferInsert;
