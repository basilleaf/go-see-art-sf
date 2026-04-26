import path from "path";
import { put } from "@vercel/blob";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";

const BASE_URL = "https://fortmason.org";
const LIST_URL = `${BASE_URL}/arts/`;
const MUSEUM_DIR = "fortmason";
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

// "January 10 to March 8, 2026" or "August 22 to 30, 2025"
function parseFortMasonDates(raw: string): { startDate: string | null; endDate: string | null; hasDates: boolean } {
  const text = raw.trim();
  if (/ongoing/i.test(text)) return { startDate: null, endDate: null, hasDates: false };

  if (text.includes(" to ")) {
    const [startRaw, endRaw] = text.split(" to ").map((s) => s.trim());
    const yearMatch = endRaw.match(/\d{4}/);
    if (!yearMatch) {
      // No year — it's a series of individual events, treat as ongoing
      return { startDate: null, endDate: null, hasDates: false };
    }
    const startFull = /\d{4}/.test(startRaw) || !yearMatch ? startRaw : `${startRaw}, ${yearMatch[0]}`;
    const endFull = /^[A-Za-z]/.test(endRaw)
      ? endRaw
      : (() => {
          const m = startRaw.match(/^([A-Za-z]+)/);
          return m ? `${m[1]} ${endRaw}` : endRaw;
        })();
    return { startDate: parseDate(startFull), endDate: parseDate(endFull), hasDates: true };
  }

  // Single date — if it has a past year, mark it so we can skip it
  const yearMatch = text.match(/\d{4}/);
  if (yearMatch) {
    const singleDate = parseDate(text.replace(/\s*&\s*.+/, "").trim()); // take first date if "Oct 29 & 30"
    return { startDate: singleDate, endDate: singleDate, hasDates: true };
  }

  return { startDate: null, endDate: null, hasDates: false };
}

// Strip The Events Calendar date instance suffix from URLs
function canonicalUrl(href: string): string {
  return href.replace(/\/\d{4}-\d{2}-\d{2}(\/\d+)?\/?$/, "/");
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

  const heroImg = root.querySelector(".tribe-events-event-image img, .wp-post-image");
  const remoteImageUrl = heroImg?.getAttribute("src") ?? null;
  const image = remoteImageUrl ? await uploadImage(remoteImageUrl, slug) : null;
  if (image) console.log(`    Uploaded image → ${image}`);

  const SKIP = /^(sign up|reserve your|subscribe|©|fort mason center)/i;
  const description = root
    .querySelectorAll("p")
    .filter((p) => p.text.trim().length >= 60 && !SKIP.test(p.text.trim()))
    .map((p) => p.text.trim())
    .join("\n\n") || null;

  return { title, image, description };
}

async function main() {
  let museum = await db.query.museums.findFirst({
    where: eq(museums.homepageUrl, BASE_URL),
  });
  if (!museum) {
    [museum] = await db
      .insert(museums)
      .values({
        name: "Fort Mason Center for Arts & Culture",
        homepageUrl: BASE_URL,
        exhibitionsPageUrl: LIST_URL,
      })
      .returning();
    console.log(`Inserted museum id=${museum.id}`);
  } else {
    console.log(`Found existing museum id=${museum.id}`);
  }
  const museumId = museum.id;

  console.log("\nFetching exhibition list...");
  const root = await fetchHtml(LIST_URL);
  const today = new Date().toISOString().split("T")[0];

  type ExhibitionItem = { href: string; slug: string; startDate: string | null; endDate: string | null };
  const items: ExhibitionItem[] = [];

  root.querySelectorAll(".event-item").forEach((item) => {
    const rawHref = item.querySelector("a")?.getAttribute("href") ?? "";
    if (!rawHref.includes("/event/")) return;

    const href = canonicalUrl(rawHref);
    const slug = href.replace(/^https?:\/\/[^/]+\/event\//, "").replace(/\/$/, "");
    const dateText = item.querySelector(".event-date p")?.text.trim() ?? "";
    const { startDate, endDate, hasDates } = parseFortMasonDates(dateText);

    // Skip past exhibitions (has a parseable end date that's already passed)
    if (hasDates && endDate && endDate < today) return;

    if (!items.find((i) => i.href === href)) {
      items.push({ href, slug, startDate, endDate });
    }
  });

  console.log(`Found ${items.length} exhibitions (current + ongoing)`);

  for (const { href, slug, startDate, endDate } of items) {
    console.log(`  Fetching ${href}`);
    try {
      const { title, image, description } = await scrapeDetail(href, slug);
      console.log(`  → "${title}" | ${startDate ?? "ongoing"} – ${endDate ?? ""}`);
      await db.insert(exhibitions).values({
        title, image, description,
        startDate, endDate,
        imageCredit: null, artist: null,
        link: href, museumId,
      }).onConflictDoNothing();
    } catch (err) {
      console.error(`  ERROR on ${href}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
