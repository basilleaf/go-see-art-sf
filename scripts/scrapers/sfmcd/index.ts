import path from "path";
import { put } from "@vercel/blob";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";
import { summarizeIfMissing, inferArtistIfMissing, upsertSet, uploadImageIfMissing, slugForExhibitionUpsert } from "../summarize";
import { museumSlugForInsert } from "@/lib/museumSlug";

const BASE_URL = "https://sfmcd.org";
const MUSEUM_DIR = "sfmcd";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};

async function fetchHtml(url: string) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return parse(await res.text());
}

function parseDate(text: string): string | null {
  if (!text) return null;
  const d = new Date(text.trim());
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function parseDateRange(raw: string): { startDate: string | null; endDate: string | null } {
  // Handles both "–" (en-dash) and " – " with spaces
  const text = raw.trim();
  const parts = text.split(/\s*[–-]\s*/);
  if (parts.length >= 2) {
    const [startRaw, endRaw] = [parts[0].trim(), parts.slice(1).join("-").trim()];
    const endDate = parseDate(endRaw);
    const yearMatch = endRaw.match(/\d{4}/);
    const startFull = /\d{4}/.test(startRaw) || !yearMatch ? startRaw : `${startRaw}, ${yearMatch[0]}`;
    return { startDate: parseDate(startFull), endDate };
  }
  return { startDate: parseDate(text), endDate: null };
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

async function scrapeExhibitionDetail(href: string) {
  const slug = href.replace(/^https?:\/\/[^/]+\/exhibitions?\//, "").replace(/\/$/, "");
  console.log(`  Fetching ${href}`);
  const root = await fetchHtml(href);

  const title = root.querySelector("h1")?.text.trim() ?? slug;

  // Date is in an H3 containing a dash-separated range
  const dateH3 = root.querySelectorAll("h3").find((h) => /[–-]/.test(h.text) && /\d{4}/.test(h.text));
  const { startDate, endDate } = dateH3 ? parseDateRange(dateH3.text.trim()) : { startDate: null, endDate: null };

  // Hero image: featured image in post-content
  const heroImg = root.querySelector("span.post-featured-img img");
  const remoteImageUrl = heroImg?.getAttribute("src") ?? null;
  const image = remoteImageUrl ? await uploadImageIfMissing(href, () => uploadImage(remoteImageUrl, slug)) : null;

  // Image credit: first H6, strip "Above Image:" prefix
  const imageCredit = root.querySelector("h6")?.text.trim().replace(/^above image:\s*/i, "") || null;

  // Description: clean <p> tags with no class, skip nav/short text
  const SKIP = /^(about|curators?:|press release|audio tour|translations|large print)/i;
  const description = root
    .querySelectorAll("p")
    .filter((p) => !p.classNames && p.text.trim().length >= 60 && !SKIP.test(p.text.trim()))
    .map((p) => p.text.trim())
    .join("\n\n") || null;

  return { title, startDate, endDate, image, imageCredit, description, link: href, artist: null };
}

async function getExhibitionLinks(): Promise<string[]> {
  const links: string[] = [];
  for (const page of [`${BASE_URL}/exhibitions/`, `${BASE_URL}/upcoming-exhibitions/`]) {
    const root = await fetchHtml(page);
    root.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") ?? "";
      // Match exhibition detail pages, not the category pages themselves
      if (/sfmcd\.org\/exhibitions\/.+/.test(href) && !links.includes(href)) {
        links.push(href);
      }
    });
  }
  return links;
}

async function main() {
  let museum = await db.query.museums.findFirst({
    where: eq(museums.homepageUrl, BASE_URL),
  });
  if (!museum) {
    const musSlug = await museumSlugForInsert(db, "Museum of Craft and Design");
    [museum] = await db
      .insert(museums)
      .values({
        name: "Museum of Craft and Design",
        homepageUrl: BASE_URL,
        exhibitionsPageUrl: `${BASE_URL}/exhibitions/`,
        slug: musSlug,
      })
      .returning();
    console.log(`Inserted museum id=${museum.id}`);
  } else {
    console.log(`Found existing museum id=${museum.id}`);
  }
  const museumId = museum.id;

  console.log("\nFetching exhibition list...");
  const links = await getExhibitionLinks();
  console.log(`Found ${links.length} exhibitions (current + upcoming)`);

  for (const href of links) {
    try {
      const rawData = await scrapeExhibitionDetail(href);
      const [description, inferredArtist] = await Promise.all([
        summarizeIfMissing(href, {
          rawDescription: rawData.description,
          title: rawData.title,
          artist: rawData.artist,
          museumName: museum.name,
          startDate: rawData.startDate,
          endDate: rawData.endDate,
        }),
        rawData.artist ? Promise.resolve(null) : inferArtistIfMissing(href, {
          rawDescription: rawData.description,
          title: rawData.title,
          museumName: museum.name,
        }),
      ]);
      const artist = rawData.artist ?? inferredArtist;
      const data = { ...rawData, description, artist, imageCredit: rawData.imageCredit ?? artist };
      console.log(`  → "${data.title}" | ${data.startDate} – ${data.endDate}`);
      const slug = await slugForExhibitionUpsert(data.link!, data.title, museumId);
      await db.insert(exhibitions).values({ ...data, museumId, slug })
        .onConflictDoUpdate({ target: exhibitions.link, set: upsertSet });
    } catch (err) {
      console.error(`  ERROR on ${href}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
