import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { exhibitions } from "@/db/schema";
import { exhibitionSlugFromTitle } from "@/lib/slugify";

type AppDb = typeof db;

/**
 * Picks a unique `exhibitions.slug` for this museum (append -2, -3, …).
 */
export async function allocateUniqueExhibitionSlug(
  database: AppDb,
  museumId: number,
  base: string
): Promise<string> {
  let candidate = base;
  let n = 1;
  for (;;) {
    const [row] = await database
      .select({ c: count() })
      .from(exhibitions)
      .where(and(eq(exhibitions.museumId, museumId), eq(exhibitions.slug, candidate)));
    if (!row || row.c === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

/** New exhibition: slug from title only; unique per museum. */
export async function exhibitionSlugForInsert(
  database: AppDb,
  museumId: number,
  title: string
): Promise<string> {
  const base = exhibitionSlugFromTitle(title);
  return allocateUniqueExhibitionSlug(database, museumId, base);
}
