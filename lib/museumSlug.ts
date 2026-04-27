import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { museums } from "@/db/schema";
import { museumSlugFromName } from "@/lib/slugify";

type AppDb = typeof db;

/**
 * Picks a unique `museums.slug` (append -2, -3, …) within the table.
 */
export async function allocateUniqueMuseumSlug(database: AppDb, base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  for (;;) {
    const [row] = await database
      .select({ c: count() })
      .from(museums)
      .where(eq(museums.slug, candidate));
    if (!row || row.c === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export async function museumSlugForInsert(database: AppDb, name: string): Promise<string> {
  return allocateUniqueMuseumSlug(database, museumSlugFromName(name));
}
