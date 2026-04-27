import Anthropic from "@anthropic-ai/sdk";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exhibitions } from "@/db/schema";

const client = new Anthropic();

const SYSTEM = `Summarize this museum exhibition description in a few sentences or at most one paragraph for a website promoting the exhibition. If there isn't description content, use other data such as museum name, start date, or write generic marketing copy for this show. If the content is already a paragraph or shorter, rewrite it in your own voice. The goal is to avoid lifting verbatim copy from the source material. Return only the summary with no preamble or explanation.`;

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

export async function summarizeIfMissing(
  link: string,
  ctx: Parameters<typeof summarizeDescription>[0]
): Promise<string | null> {
  const existing = await db.query.exhibitions.findFirst({
    where: eq(exhibitions.link, link),
    columns: { description: true },
  });
  if (existing?.description) return null;
  return summarizeDescription(ctx);
}

// Only fills a field if the existing row has null — never overwrites.
export const upsertSet = {
  title: sql`COALESCE(exhibitions.title, excluded.title)`,
  description: sql`COALESCE(exhibitions.description, excluded.description)`,
  image: sql`COALESCE(exhibitions.image, excluded.image)`,
  imageCredit: sql`COALESCE(exhibitions.image_credit, excluded.image_credit)`,
  artist: sql`COALESCE(exhibitions.artist, excluded.artist)`,
  startDate: sql`COALESCE(exhibitions.start_date, excluded.start_date)`,
  endDate: sql`COALESCE(exhibitions.end_date, excluded.end_date)`,
};
