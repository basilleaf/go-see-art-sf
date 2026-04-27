import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitions } from "@/db/schema";

type AppDb = typeof db;

const MAX_SLUG_LEN = 200;

/**
 * Strips diacritics, lowercases, and replaces non-alphanumeric runs with a single hyphen.
 */
export function slugifySegment(s: string): string {
  const out = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-+/g, "-");
  return (out.slice(0, MAX_SLUG_LEN) || "exhibition").replace(/-+$/, "");
}

/** Public exhibition URL path segment from title and museum (readable + usually unique). */
export function exhibitionPathSlugFromParts(title: string, museumName: string): string {
  return slugifySegment(`${title} ${museumName}`);
}

/**
 * Picks a unique value for `exhibitions.slug` by appending -2, -3, ... if needed.
 */
export async function allocateUniqueExhibitionSlug(
  database: AppDb,
  base: string
): Promise<string> {
  let candidate = base;
  let n = 1;
  for (;;) {
    const [row] = await database
      .select({ c: count() })
      .from(exhibitions)
      .where(eq(exhibitions.slug, candidate));
    if (!row || row.c === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

/** New exhibition row: unique slug from title + museum (collisions get -2, -3, …). */
export async function exhibitionSlugForInsert(
  database: AppDb,
  title: string,
  museumName: string
): Promise<string> {
  const base = exhibitionPathSlugFromParts(title, museumName);
  return allocateUniqueExhibitionSlug(database, base);
}
