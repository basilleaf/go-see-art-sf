import path from "path";
import { put } from "@vercel/blob";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";
import { summarizeIfMissing, inferArtistIfMissing, upsertSet, uploadImageIfMissing, slugForExhibitionUpsert } from "../summarize";

const BASE_URL = "https://exhibitions.asianart.org";
const LIST_URL = BASE_URL + "/";
const MUSEUM_DIR = "asianart";
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
  const EN_DASH = "–";
  if (text.includes(EN_DASH)) {
    const [startRaw, endRaw] = text.split(EN_DASH).map((s) => s.trim());
    const endDate = parseDate(endRaw);
    const yearMatch = endRaw.match(/\d{4}/);
    const startFull = /\d{4}/.test(startRaw) || !yearMatch ? startRaw : `${startRaw}, ${yearMatch[0]}`;
    return { startDate: parseDate(startFull), endDate };
  }
  return { startDate: null, endDate: null };
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
  const slug = href.replace(/^https?:\/\/[^/]+\/exhibitions\//, "").replace(/\/$/, "");
  console.log(`  Fetching ${href}`);
  const root = await fetchHtml(href);

  const title = root.querySelector("h1")?.text.trim() ?? slug;
  const { startDate, endDate } = parseDateRange(root.querySelector(".hero-exhib__subtitle")?.text.trim() ?? "");

  const heroImg = root.querySelector("img.hero-exhib__image-src");
  const remoteImageUrl = heroImg?.getAttribute("src") ?? null;
  const image = remoteImageUrl ? await uploadImageIfMissing(href, () => uploadImage(remoteImageUrl, slug)) : null;

  // Credit: span containing photo credit keywords, skip the "Top image:" caption span
  const imageCredit = root
    .querySelectorAll("span")
    .find((s) => /photo by|courtesy|©/i.test(s.text) && !/^top image/i.test(s.text))
    ?.text.trim() || null;

  const SKIP = /^(lead support|presenting sponsor|major support|additional support|this exhibition)/i;
  const description = root
    .querySelectorAll("p")
    .filter((p) => !p.classNames && p.text.trim().length >= 60 && !SKIP.test(p.text.trim()))
    .map((p) => p.text.trim())
    .join("\n\n") || null;

  return { title, startDate, endDate, image, imageCredit, description, link: href, artist: null };
}

async function getExhibitionLinks(): Promise<string[]> {
  const root = await fetchHtml(LIST_URL);
  const links: string[] = [];

  root.querySelectorAll("article.card").forEach((article) => {
    const subtitle = article.querySelector(".card__subtitle")?.text.trim() ?? "";
    // Skip past exhibitions — they have full historical date ranges with years before current
    if (/\b20(1\d|2[0-4])\b/.test(subtitle)) return;

    const href = article.querySelector("a.card__img-wrap, a.card__title")?.getAttribute("href") ?? "";
    if (href.includes("/exhibitions/") && !links.includes(href)) links.push(href);
  });

  return links;
}

async function main() {
  let museum = await db.query.museums.findFirst({
    where: eq(museums.homepageUrl, "https://www.asianart.org"),
  });
  if (!museum) {
    [museum] = await db
      .insert(museums)
      .values({
        name: "Asian Art Museum",
        homepageUrl: "https://www.asianart.org",
        exhibitionsPageUrl: LIST_URL,
      })
      .returning();
    console.log(`Inserted museum id=${museum.id}`);
  } else {
    console.log(`Found existing museum id=${museum.id}`);
  }
  const museumId = museum.id;

  console.log("\nFetching exhibition list...");
  const links = await getExhibitionLinks();
  console.log(`Found ${links.length} exhibitions`);

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
      console.log(`  → "${data.title}" | ${data.startDate ?? "?"} – ${data.endDate ?? "?"}`);
      const slug = await slugForExhibitionUpsert(data.link!, data.title, museum.name);
      await db.insert(exhibitions).values({ ...data, museumId, slug })
        .onConflictDoUpdate({ target: exhibitions.link, set: upsertSet });
    } catch (err) {
      console.error(`  ERROR on ${href}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
