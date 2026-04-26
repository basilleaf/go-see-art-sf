import fs from "fs";
import path from "path";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";

const BASE_URL = "https://www.famsf.org";
const LIST_URL = `${BASE_URL}/exhibitions?where=legion-of-honor`;
const MUSEUM_DIR = "legionofhonor";
const PUBLIC_DIR = path.join(process.cwd(), "public");
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

  const datePara = [...root.querySelectorAll("p.mt-12.text-secondary.f-body-1.order-3")]
    .slice(0, 4)
    .find((p) => {
      const t = p.text.trim();
      return !isEventDate(t) && /(through|opening|ongoing|\d{4})/i.test(t);
    });

  return datePara ? parseDateText(datePara.text.trim()) : { startDate: null, endDate: null };
}

async function downloadImage(remoteUrl: string, slug: string): Promise<string | null> {
  const res = await fetch(remoteUrl, { headers: HEADERS });
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  const extFromUrl = path.extname(new URL(remoteUrl).pathname).split("?")[0];
  const ext = extFromUrl || (contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg");

  const dir = path.join(PUBLIC_DIR, MUSEUM_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${slug}${ext}`;
  const dest = path.join(dir, filename);
  if (fs.existsSync(dest)) return `/${MUSEUM_DIR}/${filename}`;
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return `/${MUSEUM_DIR}/${filename}`;
}

async function scrapeExhibitionDetail(href: string) {
  const slug = href.replace(/^https?:\/\/[^/]+\/exhibitions?\//, "").replace(/\/$/, "");
  console.log(`  Fetching ${href}`);
  const root = await fetchHtml(href);

  const title = root.querySelectorAll("h1")
    .find((h) => !h.classNames.includes("a17-sr-only") && !h.classNames.includes("sr-only"))
    ?.text.trim() ?? slug;

  const { startDate, endDate } = extractDate(root);

  const heroImg = root.querySelectorAll("picture > img").find((img) => {
    const gp = img.parentNode?.parentNode;
    return (gp?.classNames ?? "").includes("aspect-3/4");
  });
  const remoteImageUrl = heroImg?.getAttribute("src") ?? null;
  const image = remoteImageUrl ? await downloadImage(remoteImageUrl, slug) : null;
  if (image) console.log(`    Saved image → ${image}`);

  const imageCredit = root.querySelector("figcaption.media-caption")?.text.trim() || null;

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
    where: eq(museums.homepageUrl, "https://www.famsf.org/visit/legion-of-honor"),
  });
  if (!museum) {
    [museum] = await db
      .insert(museums)
      .values({
        name: "Legion of Honor",
        homepageUrl: "https://www.famsf.org/visit/legion-of-honor",
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
      const data = await scrapeExhibitionDetail(href);
      console.log(`  → "${data.title}" | ${data.startDate ?? "?"} – ${data.endDate ?? "?"}`);
      await db.insert(exhibitions).values({ ...data, museumId }).onConflictDoNothing();
    } catch (err) {
      console.error(`  ERROR on ${href}:`, err);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
