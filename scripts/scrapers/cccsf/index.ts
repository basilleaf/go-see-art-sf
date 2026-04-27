import path from "path";
import { put } from "@vercel/blob";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";
import { summarizeIfMissing, inferArtistIfMissing, upsertSet } from "../summarize";

const BASE_URL = "https://www.cccsf.us";
const LIST_URL = `${BASE_URL}/current-exhibitions`;
const MUSEUM_DIR = "cccsf";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Referer": "https://www.cccsf.us/",
};

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

function parseDates(rawDesc: string, title: string): { startDate: string | null; endDate: string | null } {
  // Strip repeated title from start of description
  let text = rawDesc.trim();
  if (text.toLowerCase().startsWith(title.toLowerCase())) {
    text = text.slice(title.length).trim();
  }

  // Take segment before "|" or newline (first logical line is the date)
  const segment = text.split(/[|\n]/)[0].trim();

  // "Ongoing" → start date only
  if (/ongoing/i.test(segment)) {
    const m = segment.match(/^([A-Za-z]+ \d+,?\s*\d{4})/);
    return { startDate: m ? parseDate(m[1]) : null, endDate: null };
  }

  const sep = segment.includes("–") ? "–" : " - ";
  if (segment.includes(sep)) {
    const [startRaw, endRaw] = segment.split(sep).map((s) => s.trim());
    const yearMatch = endRaw.match(/\d{4}/);
    // Borrow year from end if start lacks one
    const startFull = /\d{4}/.test(startRaw) || !yearMatch ? startRaw : `${startRaw}, ${yearMatch[0]}`;
    // Borrow month from start if end starts with a number (e.g. "16 - 19, 2026")
    const endFull = /^[A-Za-z]/.test(endRaw)
      ? endRaw
      : (() => {
          const monthMatch = startRaw.match(/^([A-Za-z]+)/);
          return monthMatch ? `${monthMatch[1]} ${endRaw}` : endRaw;
        })();
    return { startDate: parseDate(startFull), endDate: parseDate(endFull) };
  }

  return { startDate: parseDate(segment), endDate: null };
}

// Strip Wix image transformation params to get the base file URL
function cleanWixUrl(url: string): string {
  return url.replace(/\/v1\/.+$/, "");
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

async function main() {
  let museum = await db.query.museums.findFirst({
    where: eq(museums.homepageUrl, BASE_URL),
  });
  if (!museum) {
    [museum] = await db
      .insert(museums)
      .values({
        name: "Chinese Culture Center of San Francisco",
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

  // Build title → image URL map from wixstatic images with alt text matching exhibition names
  const LOGO_RE = /logo|ccc-logo/i;
  const imageMap = new Map<string, string>();
  root.querySelectorAll("img[src*='wixstatic']").forEach((img) => {
    const alt = img.getAttribute("alt")?.trim() ?? "";
    const src = img.getAttribute("src") ?? "";
    if (alt && !LOGO_RE.test(alt) && !imageMap.has(alt)) {
      imageMap.set(alt, cleanWixUrl(src));
    }
  });

  const items = root.querySelectorAll("[data-hook='post-list-item']");
  console.log(`Found ${items.length} exhibitions`);

  for (const item of items) {
    const title = item.querySelector("[data-hook='post-list-item__title']")?.text.trim() ?? "";
    const link = item.querySelector("a[href*='/post/']")?.getAttribute("href") ?? "";
    const rawDesc = item.querySelector("[data-hook='post-description']")?.text.trim() ?? "";

    if (!title || !link) continue;

    const slug = link.split("/").pop() ?? link;
    const { startDate, endDate } = parseDates(rawDesc, title);

    // Strip title and date from description; keep remaining text
    let description = rawDesc;
    if (description.toLowerCase().startsWith(title.toLowerCase())) {
      description = description.slice(title.length).trim();
    }
    // Strip the leading date segment
    const pipeIdx = description.indexOf("|");
    if (pipeIdx !== -1) description = description.slice(pipeIdx + 1).trim();
    description = description.length >= 60 ? description : null!;

    const remoteImageUrl = imageMap.get(title) ?? null;
    const image = remoteImageUrl ? await uploadImage(remoteImageUrl, slug) : null;
    if (image) console.log(`  Uploaded image → ${image}`);

    const [summarized, inferredArtist] = await Promise.all([
      summarizeIfMissing(link, {
        rawDescription: description || null,
        title,
        museumName: museum.name,
        startDate,
        endDate,
      }),
      inferArtistIfMissing(link, {
        rawDescription: description || null,
        title,
        museumName: museum.name,
      }),
    ]);

    console.log(`  → "${title}" | ${startDate ?? "?"} – ${endDate ?? "?"}`);

    await db.insert(exhibitions).values({
      title,
      link,
      startDate,
      endDate,
      image,
      imageCredit: inferredArtist,
      description: summarized,
      artist: inferredArtist,
      museumId,
    }).onConflictDoUpdate({ target: exhibitions.link, set: upsertSet });
  }

  console.log("\nDone.");
}

main().catch(console.error);
