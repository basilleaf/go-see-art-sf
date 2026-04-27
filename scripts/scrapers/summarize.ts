import Anthropic from "@anthropic-ai/sdk";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exhibitions } from "@/db/schema";
import { exhibitionSlugForInsert } from "@/lib/exhibitionSlug";

const client = new Anthropic();

const SYSTEM = `Summarize this museum exhibition description in a few sentences or at most one paragraph for a website promoting the exhibition. If there isn't description content, use other data such as museum name, start date, or write generic marketing copy for this show. If the content is already a paragraph or shorter, rewrite it in your own voice. The goal is to avoid lifting verbatim copy from the source material. Return only the summary with no preamble or explanation.`;

const ARTIST_SYSTEM = `Extract the primary artist or artists from this museum exhibition. Return only the name(s) — nothing else. If multiple artists, list them separated by commas. If no specific artist can be identified from the provided text, return exactly: unknown`;

export async function summarizeDescription({
  rawDescription,
  title,
  artist,
  museumName,
  startDate,
  endDate,
}: {
  rawDescription?: string | null;
  title: string;
  artist?: string | null;
  museumName: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<string | null> {
  const lines = [`Title: ${title}`, `Museum: ${museumName}`];
  if (artist) lines.push(`Artist: ${artist}`);
  if (startDate) lines.push(`Opens: ${startDate}`);
  if (endDate) lines.push(`Closes: ${endDate}`);
  if (rawDescription?.trim()) lines.push(`\nDescription:\n${rawDescription.trim()}`);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const block = message.content[0];
  if (block.type !== "text") return null;
  return block.text.trim() || null;
}

export async function inferArtistFromDescription({
  rawDescription,
  title,
  museumName,
}: {
  rawDescription?: string | null;
  title: string;
  museumName: string;
}): Promise<string | null> {
  const lines = [`Title: ${title}`, `Museum: ${museumName}`];
  if (rawDescription?.trim()) lines.push(`\nDescription:\n${rawDescription.trim()}`);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: [{ type: "text", text: ARTIST_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  const block = message.content[0];
  if (block.type !== "text") return null;
  const text = block.text.trim();
  return !text || text.toLowerCase() === "unknown" ? null : text;
}

export async function inferArtistIfMissing(
  link: string,
  ctx: Parameters<typeof inferArtistFromDescription>[0]
): Promise<string | null> {
  const existing = await db.query.exhibitions.findFirst({
    where: eq(exhibitions.link, link),
    columns: { artist: true },
  });
  if (existing?.artist) return null;
  return inferArtistFromDescription(ctx);
}

export async function uploadImageIfMissing(
  link: string,
  upload: () => Promise<string | null>
): Promise<string | null> {
  const existing = await db.query.exhibitions.findFirst({
    where: eq(exhibitions.link, link),
    columns: { image: true },
  });
  if (existing?.image) {
    console.log(`    [image] skipped — already in DB`);
    return null;
  }
  const result = await upload();
  if (result) console.log(`    Uploaded image → ${result}`);
  return result;
}

export async function summarizeIfMissing(
  link: string,
  ctx: Parameters<typeof summarizeDescription>[0]
): Promise<string | null> {
  const existing = await db.query.exhibitions.findFirst({
    where: eq(exhibitions.link, link),
    columns: { description: true },
  });
  if (existing?.description) {
    console.log(`    [summarize] skipped — description already exists`);
    return null;
  }
  console.log(`    [summarize] calling Claude for description...`);
  const result = await summarizeDescription(ctx);
  console.log(`    [summarize] ${result ? "got description ✓" : "WARNING: Claude returned null"}`);
  return result;
}

// Only fills a field if the existing row has null — never overwrites. Slug: keep the existing value on re-scrape (stable URLs).
export const upsertSet = {
  title: sql`COALESCE(exhibitions.title, excluded.title)`,
  description: sql`COALESCE(exhibitions.description, excluded.description)`,
  image: sql`COALESCE(exhibitions.image, excluded.image)`,
  imageCredit: sql`COALESCE(exhibitions.image_credit, excluded.image_credit)`,
  artist: sql`COALESCE(exhibitions.artist, excluded.artist)`,
  startDate: sql`COALESCE(exhibitions.start_date, excluded.start_date)`,
  endDate: sql`COALESCE(exhibitions.end_date, excluded.end_date)`,
  slug: sql`exhibitions.slug`,
};

/** For scraper insert/upsert on `exhibitions.link`. New row: unique slug from title. Existing row: same slug (title changes do not retarget the URL). */
export async function slugForExhibitionUpsert(link: string, title: string, museumName: string) {
  const existing = await db.query.exhibitions.findFirst({
    where: eq(exhibitions.link, link),
    columns: { slug: true },
  });
  if (existing) {
    return existing.slug;
  }
  return exhibitionSlugForInsert(db, title, museumName);
}
