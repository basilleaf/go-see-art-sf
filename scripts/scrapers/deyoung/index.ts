import path from "path";
import { put } from "@vercel/blob";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";
import { summarizeIfMissing, inferArtistIfMissing, upsertSet } from "../summarize";

const BASE_URL = "https://www.famsf.org";
const LIST_URL = `${BASE_URL}/exhibitions?where=de-young`;
const MUSEUM_DIR = "deyoung";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

async function fetchHtml(url: string) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return parse(await res.text());
}

function parseDate(text: string): string | null {
  const d = new Date(text.trim());
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

function parseDateText(raw: string): { startDate: string | null; endDate: string | null } {
  const text = raw.trim();
  if (/^through\s+/i.test(text)) {
    return { startDate: null, endDate: parseDate(text.replace(/^through\s+/i, "")) };
  }
  if (/^opening\s+/i.test(text)) {
    return { startDate: parseDate(text.replace(/^opening\s+/i, "")), endDate: null };
  }
  const EN_DASH = "–";
  if (text.includes(EN_DASH) || text.includes(" - ")) {
    const [startRaw, endRaw] = text.split(/\s*[–-]\s*/, 2).map((s) => s.trim());
    const endDate = parseDate(endRaw);
    const yearMatch = endRaw.match(/\d{4}/);
    const startFull = /\d{4}/.test(startRaw) || !yearMatch ? startRaw : `${startRaw}, ${yearMatch[0]}`;
    return { startDate: parseDate(startFull), endDate };
  }
  return { startDate: null, endDate: null };
}

function extractDate(root: ReturnType<typeof parse>): { startDate: string | null; endDate: string | null } {
  const isEventDate = (t: string) =>
    /\b(am|pm)\b/i.test(t) || /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(,|\s)/i.test(t) || /\d:\d\d/.test(t);

  // The exhibition date lives in the sticky sidebar as p.f-body-1.font-medium
  // (e.g. "August 26, 2025 – August 31, 2028"). The p.mt-12.text-secondary.f-body-1.order-3
  // elements appear only in the "what else is on" section for other exhibitions.
  const datePara = root.querySelectorAll("p.f-body-1.font-medium").find((p) => {
    const t = p.text.trim();
    return !isEventDate(t) && /(through|opening|ongoing|\d{4})/i.test(t);
  });

  return datePara ? parseDateText(datePara.text.trim()) : { startDate: null, endDate: null };
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

  const title = root.querySelectorAll("h1")
    .find((h) => !h.classNames.includes("a17-sr-only") && !h.classNames.includes("sr-only"))
    ?.text.trim() ?? slug;

  const { startDate, endDate } = extractDate(root);

  // Hero image: first IMG in a PICTURE whose grandparent DIV has aspect-3/4
  const heroImg = root.querySelectorAll("picture > img").find((img) => {
    const gp = img.parentNode?.parentNode;
    return (gp?.classNames ?? "").includes("aspect-3/4");
  });
  const remoteImageUrl = heroImg?.getAttribute("src") ?? null;
  const image = remoteImageUrl ? await uploadImage(remoteImageUrl, slug) : null;
  if (image) console.log(`    Uploaded image → ${image}`);

  // Image credit from figcaption
  const imageCredit = root.querySelector("figcaption.media-caption")?.text.trim() || null;

  // Description: no-class paragraphs, skip figcaption text and short/promo copy
  const figText = imageCredit ?? "";
  const SKIP = /^(tickets are timed|become a member|general public|shop online)/i;
  const description = root
    .querySelectorAll("p")
    .filter((p) => {
      const t = p.text.trim();
      return !p.classNames && t.length >= 60 && !SKIP.test(t) && t !== figText;
    })
    .map((p) => p.text.trim())
    .join("\n\n") || null;

  return { title, startDate, endDate, image, imageCredit, description, link: href, artist: null };
}

async function getExhibitionLinks(): Promise<string[]> {
  const root = await fetchHtml(LIST_URL);
  const links: string[] = [];
  root.querySelectorAll("a[href*='/exhibitions/']").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    if (/\/exhibitions\/[^?#/]+\/?$/.test(href) && !/\/exhibitions\/past\/?$/.test(href) && !links.includes(href)) links.push(href);
  });
  return links;
}

async function main() {
  let museum = await db.query.museums.findFirst({
    where: eq(museums.homepageUrl, "https://www.famsf.org/visit/de-young"),
  });
  if (!museum) {
    [museum] = await db
      .insert(museums)
      .values({
        name: "de Young Museum",
        homepageUrl: "https://www.famsf.org/visit/de-young",
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
      await db.insert(exhibitions).values({ ...data, museumId })
        .onConflictDoUpdate({ target: exhibitions.link, set: upsertSet });
    } catch (err) {
      console.error(`  ERROR on ${href}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
