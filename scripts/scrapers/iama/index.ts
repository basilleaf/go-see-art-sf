import path from "path";
import { put } from "@vercel/blob";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";
import { summarizeIfMissing, inferArtistIfMissing, upsertSet } from "../summarize";

const BASE_URL = "https://iamasf.org";
const MUSEUM_DIR = "iama";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

async function fetchHtml(url: string) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return parse(await res.text());
}

function parseDate(text: string): string | null {
  if (!text?.trim()) return null;
  const d = new Date(text.trim());
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

function parseDateRange(raw: string): { startDate: string | null; endDate: string | null } {
  const text = raw.trim();
  const sep = text.includes(" - ") ? " - " : "–";
  if (!text.includes(sep)) return { startDate: parseDate(text), endDate: null };

  const [startRaw, endRaw] = text.split(sep).map((s) => s.trim());
  const endDate = parseDate(endRaw);
  const yearMatch = endRaw.match(/\d{4}/);
  const startFull = /\d{4}/.test(startRaw) || !yearMatch ? startRaw : `${startRaw}, ${yearMatch[0]}`;
  // Borrow month from start if end is just "DD, YYYY"
  const endFull = /^[A-Za-z]/.test(endRaw)
    ? endRaw
    : (() => {
        const m = startRaw.match(/^([A-Za-z]+)/);
        return m ? `${m[1]} ${endRaw}` : endRaw;
      })();
  return { startDate: parseDate(startFull), endDate: parseDate(endFull) };
}

async function uploadImage(remoteUrl: string, slug: string): Promise<string | null> {
  const res = await fetch(remoteUrl, { headers: HEADERS });
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  const extFromUrl = path.extname(new URL(remoteUrl).pathname).split("?")[0];
  const ext = extFromUrl || (contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg");

  const blob = await put(`${MUSEUM_DIR}/${slug}${ext}`, await res.arrayBuffer(), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: contentType || "image/jpeg",
  });
  return blob.url;
}

async function scrapeDetail(href: string, slug: string) {
  const root = await fetchHtml(href);

  const title = root.querySelector("h1")?.text.trim() ?? slug;

  // First uploaded image (skip theme assets)
  const heroImg = root.querySelectorAll("img[src*='wp-content/uploads']")[0];
  const remoteImageUrl = heroImg?.getAttribute("src") ?? null;
  const image = remoteImageUrl ? await uploadImage(remoteImageUrl, slug) : null;
  if (image) console.log(`    Uploaded image → ${image}`);

  const SKIP = /^(continue reading|reserve your visit|©)/i;
  const description = root
    .querySelectorAll("p")
    .filter((p) => p.text.trim().length >= 60 && !SKIP.test(p.text.trim()))
    .map((p) => p.text.trim())
    .join("\n\n") || null;

  return { title, image, description };
}

async function getExhibitions(): Promise<{ href: string; slug: string; startDate: string | null; endDate: string | null }[]> {
  const results: { href: string; slug: string; startDate: string | null; endDate: string | null }[] = [];
  const today = new Date().toISOString().split("T")[0];

  // Permanent exhibitions
  const permRoot = await fetchHtml(`${BASE_URL}/art/exhibitions/permanent/`);
  permRoot.querySelectorAll("a[href*='/art/exhibitions/']").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    if (/\/art\/exhibitions\/[^/]+\/$/.test(href) && !/\/(permanent|rotating)\/$/.test(href) && !results.find(r => r.href === href)) {
      const slug = href.replace(/^https?:\/\/[^/]+\/art\/exhibitions\//, "").replace(/\/$/, "");
      results.push({ href, slug, startDate: null, endDate: null });
    }
  });

  // Rotating exhibitions — only those with a future end date
  const rotRoot = await fetchHtml(`${BASE_URL}/art/exhibitions/rotating/`);
  rotRoot.querySelectorAll("a.exhibition-item-small").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    const datesRaw = a.querySelector("h5")?.text.trim() ?? "";
    const { startDate, endDate } = parseDateRange(datesRaw);
    if (endDate && endDate >= today && !results.find(r => r.href === href)) {
      const slug = href.replace(/^https?:\/\/[^/]+\/art\/exhibitions\//, "").replace(/\/$/, "");
      results.push({ href, slug, startDate, endDate });
    }
  });

  return results;
}

async function main() {
  let museum = await db.query.museums.findFirst({
    where: eq(museums.homepageUrl, BASE_URL),
  });
  if (!museum) {
    [museum] = await db
      .insert(museums)
      .values({
        name: "International Art Museum of America",
        homepageUrl: BASE_URL,
        exhibitionsPageUrl: `${BASE_URL}/art/exhibitions/`,
      })
      .returning();
    console.log(`Inserted museum id=${museum.id}`);
  } else {
    console.log(`Found existing museum id=${museum.id}`);
  }
  const museumId = museum.id;

  console.log("\nFetching exhibitions...");
  const items = await getExhibitions();
  console.log(`Found ${items.length} exhibitions (permanent + current/upcoming rotating)`);

  for (const { href, slug, startDate, endDate } of items) {
    console.log(`  Fetching ${href}`);
    try {
      const { title, image, description: rawDescription } = await scrapeDetail(href, slug);
      const [description, inferredArtist] = await Promise.all([
        summarizeIfMissing(href, {
          rawDescription,
          title,
          museumName: museum.name,
          startDate,
          endDate,
        }),
        inferArtistIfMissing(href, {
          rawDescription,
          title,
          museumName: museum.name,
        }),
      ]);
      console.log(`  → "${title}" | ${startDate ?? "permanent"} – ${endDate ?? ""}`);
      await db.insert(exhibitions).values({
        title, image, description, startDate, endDate,
        imageCredit: inferredArtist, artist: inferredArtist, link: href, museumId,
      }).onConflictDoUpdate({ target: exhibitions.link, set: upsertSet });
    } catch (err) {
      console.error(`  ERROR on ${href}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
