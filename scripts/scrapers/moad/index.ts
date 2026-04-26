import path from "path";
import { put } from "@vercel/blob";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";

const BASE_URL = "https://www.moadsf.org";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};

async function uploadImage(
  remoteUrl: string,
  museumDir: string,
  slug: string
): Promise<string | null> {
  const res = await fetch(remoteUrl, { headers: HEADERS });
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  const extFromUrl = path.extname(new URL(remoteUrl).pathname).split("?")[0];
  const ext =
    extFromUrl ||
    (contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg");

  const blob = await put(`${museumDir}/${slug}${ext}`, await res.arrayBuffer(), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: contentType || "image/jpeg",
  });
  return blob.url;
}

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

async function scrapeExhibitionDetail(exhibitionPath: string, museumDir: string) {
  const url = `${BASE_URL}${exhibitionPath}`;
  const slug = exhibitionPath.split("/").pop() ?? exhibitionPath;
  console.log(`  Fetching ${url}`);
  const root = await fetchHtml(url);
  const header = root.querySelector(".section_header");

  // Title and artist
  const h1 = header?.querySelector("h1")?.text.trim() ?? "";
  const italicP = header?.querySelector("p.header_description-text")?.text.trim() ?? "";
  const descDivs = header?.querySelectorAll("div.header_description-text") ?? [];
  const firstDiv = descDivs[0]?.text.trim() ?? "";

  let title: string;
  let artist: string | null = null;

  if (/^curated/i.test(firstDiv)) {
    title = h1 ? `${h1}: ${italicP}` : italicP;
    artist = firstDiv.replace(/^curated\s+by\s*/i, "").trim() || null;
  } else if (!h1) {
    title = italicP;
  } else {
    // H1 is the artist, italic is the title
    artist = h1 || null;
    title = italicP || h1;
  }

  // Dates — find divs with month names, skip "-" separator
  const monthRe = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  const dateDivTexts = descDivs
    .map((d) => d.text.trim())
    .filter((t) => monthRe.test(t));
  const startDate = parseDate(dateDivTexts[0] ?? "");
  const endDate = parseDate(dateDivTexts[1] ?? "");

  // Hero image — download locally
  const heroImg = root
    .querySelectorAll(".header_component img")
    .find((img) => (img.getAttribute("src") ?? "").includes("62ea747d1e6f2d3fc81babe5"));
  const remoteImageUrl = heroImg?.getAttribute("src") ?? null;
  const imageCredit = heroImg?.getAttribute("alt")?.trim() || null;
  const image = remoteImageUrl
    ? await uploadImage(remoteImageUrl, museumDir, slug)
    : null;
  if (image) console.log(`    Uploaded image → ${image}`);

  // Description (paragraphs in section-event-top, skip empties and zero-width joiners)
  const ZWJ = "‍";
  const descParas = root
    .querySelectorAll(".section-event-top p")
    .map((p) => p.text.trim())
    .filter((t) => t && t !== ZWJ && !/^[\s‍]+$/.test(t));
  const description = descParas.join("\n\n") || null;

  return { title, artist, startDate, endDate, image, imageCredit, description, link: url };
}

async function getExhibitionLinks(): Promise<string[]> {
  const root = await fetchHtml(`${BASE_URL}/exhibitions`);

  const links: string[] = [];
  for (const tab of ["Current", "Upcoming"]) {
    const pane = root.querySelectorAll(".w-tab-pane").find(
      (el) => el.getAttribute("data-w-tab") === tab
    );
    pane?.querySelectorAll("a[href^='/exhibitions/']").forEach((a) => {
      const href = a.getAttribute("href");
      if (href && !links.includes(href)) links.push(href);
    });
  }
  return links;
}

async function main() {
  // Find or create museum
  let museum = await db.query.museums.findFirst({
    where: eq(museums.homepageUrl, "https://www.moadsf.org"),
  });
  if (!museum) {
    [museum] = await db
      .insert(museums)
      .values({
        name: "Museum of the African Diaspora",
        homepageUrl: "https://www.moadsf.org",
        exhibitionsPageUrl: "https://www.moadsf.org/exhibitions",
      })
      .returning();
    console.log(`Inserted museum id=${museum.id}`);
  } else {
    console.log(`Found existing museum id=${museum.id}`);
  }
  const museumId = museum.id;

  // Get exhibition links
  console.log("\nFetching exhibition list...");
  const links = await getExhibitionLinks();
  console.log(`Found ${links.length} exhibitions (current + upcoming)`);

  const MUSEUM_DIR = "moad";

  // Scrape each and insert
  for (const exhibitionPath of links) {
    try {
      const data = await scrapeExhibitionDetail(exhibitionPath, MUSEUM_DIR);
      console.log(`  → "${data.title}" | artist: ${data.artist} | ${data.startDate} – ${data.endDate}`);

      await db
        .insert(exhibitions)
        .values({ ...data, museumId })
        .onConflictDoNothing(); // unique constraint on link
    } catch (err) {
      console.error(`  ERROR on ${exhibitionPath}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
