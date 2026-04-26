import fs from "fs";
import path from "path";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";

const BASE_URL = "https://www.sfmoma.org";
const MUSEUM_DIR = "sfmoma";
const PUBLIC_DIR = path.join(process.cwd(), "public");
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
  // Strip appended membership/preview notes
  const text = raw.replace(/\s*Member Previews?.*$/i, "").trim();
  const EN_DASH = "–";

  if (text.includes(EN_DASH)) {
    const [startRaw, endRaw] = text.split(EN_DASH).map((s) => s.trim());
    const endDate = parseDate(endRaw);
    // If start has no 4-digit year, borrow it from the end
    const yearMatch = endRaw.match(/\d{4}/);
    const startFull =
      /\d{4}/.test(startRaw) || !yearMatch
        ? startRaw
        : `${startRaw}, ${yearMatch[0]}`;
    return { startDate: parseDate(startFull), endDate };
  }

  if (/^opening/i.test(text)) {
    return { startDate: parseDate(text.replace(/^opening\s*/i, "")), endDate: null };
  }

  return { startDate: parseDate(text), endDate: null };
}

async function downloadImage(
  remoteUrl: string,
  slug: string
): Promise<string | null> {
  const res = await fetch(remoteUrl, { headers: HEADERS });
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  const extFromUrl = path.extname(new URL(remoteUrl).pathname).split("?")[0];
  const ext =
    extFromUrl ||
    (contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg");

  const dir = path.join(PUBLIC_DIR, MUSEUM_DIR);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${slug}${ext}`;
  const dest = path.join(dir, filename);

  if (fs.existsSync(dest)) return `/${MUSEUM_DIR}/${filename}`;

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  return `/${MUSEUM_DIR}/${filename}`;
}

async function scrapeExhibitionDetail(href: string) {
  const slug = href.replace(/^https?:\/\/[^/]+\/exhibition\//, "").replace(/\/$/, "");
  console.log(`  Fetching ${href}`);
  const root = await fetchHtml(href);

  // Title
  const title =
    root.querySelector("h1.exhibitioncard-wrapper-text-title")?.text.trim() ?? slug;

  // Dates
  const dateRaw =
    root.querySelector(".exhibitioncard-wrapper-text-daterange")?.text.trim() ?? "";
  const { startDate, endDate } = parseDateRange(dateRaw);

  // Hero image — swiper first, fall back to first figure or any cloudfront img
  const cloudfrontImgs = root
    .querySelectorAll("img")
    .filter((img) => (img.getAttribute("src") ?? "").includes("cloudfront.net"));
  const heroImg =
    cloudfrontImgs.find((img) => img.closest(".swiper-slide-container") !== null) ??
    cloudfrontImgs.find((img) => img.closest("figure") !== null) ??
    cloudfrontImgs[0] ?? null;
  const remoteImageUrl = heroImg?.getAttribute("src") ?? null;
  const image = remoteImageUrl ? await downloadImage(remoteImageUrl, slug) : null;
  if (image) console.log(`    Saved image → ${image}`);

  // Image credit — prefer the explicit "Header image:" paragraph
  const headerCreditEl = root
    .querySelectorAll("p.body--xsmall")
    .find((p) => /header image/i.test(p.text));
  const imageCredit = headerCreditEl
    ? headerCreditEl.text.trim().replace(/^header image:\s*/i, "")
    : root.querySelector(".swiper-captions-caption")?.text.trim() || null;

  // Description — <p> tags with no class, skip promo/support copy
  const SKIP = /^(lead support|visionary support|general public tickets|become a member|member preview|read more|this exhibition is part of)/i;
  const description =
    root
      .querySelectorAll("p")
      .filter((p) => !p.classNames && p.text.trim().length >= 60 && !SKIP.test(p.text.trim()))
      .map((p) => p.text.trim())
      .join("\n\n") || null;

  return { title, startDate, endDate, image, imageCredit, description, link: href, artist: null };
}

async function getExhibitionLinks(): Promise<string[]> {
  const root = await fetchHtml(`${BASE_URL}/exhibitions/`);
  const links: string[] = [];
  for (const id of ["item--exhibitions-current", "item--exhibitions-upcoming"]) {
    const section = root.querySelector(`#${id}`);
    section?.querySelectorAll("a[href*='/exhibition/']").forEach((a) => {
      const href = a.getAttribute("href");
      if (href && !links.includes(href)) links.push(href);
    });
  }
  return links;
}

async function main() {
  // Find or create museum
  let museum = await db.query.museums.findFirst({
    where: eq(museums.homepageUrl, BASE_URL),
  });
  if (!museum) {
    [museum] = await db
      .insert(museums)
      .values({
        name: "San Francisco Museum of Modern Art",
        homepageUrl: BASE_URL,
        exhibitionsPageUrl: `${BASE_URL}/exhibitions/`,
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
      const data = await scrapeExhibitionDetail(href);
      console.log(`  → "${data.title}" | ${data.startDate} – ${data.endDate}`);
      await db.insert(exhibitions).values({ ...data, museumId }).onConflictDoNothing();
    } catch (err) {
      console.error(`  ERROR on ${href}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
