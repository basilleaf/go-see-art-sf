import { pgTable, serial, text, date, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const museums = pgTable(
  "museums",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** URL segment: /exhibitions/{slug}/… */
    slug: text("slug").notNull().unique(),
    homepageUrl: text("homepage_url").notNull(),
    exhibitionsPageUrl: text("exhibitions_page_url").notNull(),
  },
  (t) => [unique().on(t.homepageUrl)]
);

export const exhibitions = pgTable(
  "exhibitions",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    /** URL segment under the museum: /exhibitions/{museumSlug}/{slug} — unique per museum. */
    slug: text("slug").notNull(),
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
  },
  (t) => [unique().on(t.link), unique("exhibitions_museum_id_slug_unique").on(t.museumId, t.slug)]
);

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
