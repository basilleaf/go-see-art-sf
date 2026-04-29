@AGENTS.md

# go-see-art

A Next.js app that aggregates current and upcoming art exhibitions from multiple venues into a single browsable feed. Scrapers run on a cron schedule, upsert into a Neon Postgres database, and upload images to Vercel Blob.

---

## Stack

- **Framework**: Next.js App Router, TypeScript, Tailwind CSS v4
- **Database**: Drizzle ORM + Neon Postgres (`db/schema.ts`)
- **Image storage**: Vercel Blob (`@vercel/blob`)
- **HTML parsing**: `node-html-parser`
- **AI**: Anthropic Claude Haiku (summarization + artist inference via `scripts/scrapers/summarize.ts`)
- **Env**: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY`

---

## Database schema

Two tables — `museums` and `exhibitions`.

```
museums
  id, name, slug (unique), homepageUrl (unique), exhibitionsPageUrl

exhibitions
  id, title, slug (unique per museumId), description, image, imageCredit,
  artist, startDate (date), endDate (date), museumId, link (unique), hidden, createdAt
```

- `exhibitions.link` is the canonical URL and the upsert key — one row per exhibition URL.
- `exhibitions.slug` is URL-safe, unique per museum, derived from title, and **never changes after first insert** (stable URLs).
- `exhibitions.hidden` defaults false; used to manually suppress an exhibition from the feed without deleting it.

---

## Scraper conventions

### File layout

Each scraper lives at `scripts/scrapers/<venue-slug>/index.ts` and exports nothing — it runs as a standalone script with a `main()` call at the bottom:

```ts
main().catch(console.error);
```

`scripts/run-all-scrapers.ts` discovers every `scripts/scrapers/*/index.ts` and runs them sequentially via `tsx`, continuing past failures.

### Running scrapers

```bash
# One scraper
npx tsx --env-file=.env scripts/scrapers/<venue>/index.ts

# All scrapers
npx tsx --env-file=.env scripts/run-all-scrapers.ts
```

### Imports every scraper needs

```ts
import { put } from "@vercel/blob";
import { parse } from "node-html-parser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { museums, exhibitions } from "@/db/schema";
import {
  summarizeIfMissing,
  inferArtistIfMissing,
  upsertSet,
  uploadImageIfMissing,
  slugForExhibitionUpsert,
} from "../summarize";
import { museumSlugForInsert } from "@/lib/museumSlug";
```

---

## Shared utilities (`scripts/scrapers/summarize.ts`)

These handle all idempotency — always use them, never call Claude or blob directly.

### `summarizeIfMissing(link, ctx)`
Calls Claude Haiku to write a marketing-style description. Skips the API call if `description` already exists in the DB for that `link`. Pass all available context (title, museumName, artist, startDate, endDate, rawDescription).

### `inferArtistIfMissing(link, ctx)`
Calls Claude Haiku to extract the primary artist(s) from title + raw description. Skips if `artist` already in DB. Returns `null` (not `"unknown"`) when no artist is identifiable.

### `uploadImageIfMissing(link, uploadFn)`
Calls your upload function only if `image` is null in the DB for that `link`. Logs a skip message if it already exists. Returns the new Blob URL, or `null` on skip.

### `upsertSet`
A Drizzle `onConflictDoUpdate` set that uses `COALESCE` for every field — **never overwrites an existing non-null value**. Slug is always kept as-is (never updated). Use it for every exhibition upsert.

### `slugForExhibitionUpsert(link, title, museumId)`
Returns the existing slug for this `link` if the row already exists, otherwise allocates a new slug from the title (unique per museum). Always pass this as `slug` in the insert values.

---

## Museum upsert pattern

Look up by `homepageUrl` (the unique key), create if missing:

```ts
let museum = await db.query.museums.findFirst({
  where: eq(museums.homepageUrl, BASE_URL),
});
if (!museum) {
  const musSlug = await museumSlugForInsert(db, "Full Museum Name");
  [museum] = await db.insert(museums).values({
    name: "Full Museum Name",
    homepageUrl: BASE_URL,
    exhibitionsPageUrl: LIST_URL,
    slug: musSlug,
  }).returning();
}
const museumId = museum.id;
```

---

## Exhibition upsert pattern

After scraping and enriching:

```ts
const slug = await slugForExhibitionUpsert(data.link, data.title, museumId);
await db.insert(exhibitions)
  .values({ ...data, museumId, slug })
  .onConflictDoUpdate({ target: exhibitions.link, set: upsertSet });
```

Wrap each exhibition in a try/catch and log the error, so one bad page doesn't abort the whole run.

---

## Image upload pattern

Each scraper defines a local `uploadImage(remoteUrl, slug)` function:

```ts
const MUSEUM_DIR = "your-slug-here"; // top-level folder in Vercel Blob

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
```

Then use `uploadImageIfMissing` to guard it:
```ts
const image = remoteImageUrl
  ? await uploadImageIfMissing(href, () => uploadImage(remoteImageUrl, slug))
  : null;
```

- `addRandomSuffix: false` + `allowOverwrite: true` keeps blob paths deterministic.
- Always fetch the image bytes using the same `HEADERS` as the HTML fetches (sites block bare requests).
- `MUSEUM_DIR` must be consistent for the lifetime of the scraper — changing it orphans old blobs.

---

## Date parsing

All dates stored as `YYYY-MM-DD` strings. `new Date(text).toISOString().split("T")[0]` is the canonical conversion.

Common patterns to handle:

| Site pattern | Example | Notes |
|---|---|---|
| Range with en-dash | `June 5 – September 14, 2025` | Split on `–`; if start has no year, borrow from end |
| Range with hyphen | `June 5 - September 14, 2025` | Same logic |
| Partial start (no month) | `July 1 – 31, 2025` | Borrow month from start for the end |
| "Through" prefix | `Through September 14, 2025` | endDate only, startDate null |
| "Opening" prefix | `Opening June 5, 2025` | startDate only, endDate null |
| "Ongoing" | `Ongoing` | Both null |
| "to" separator | `January 10 to March 8, 2026` | Fort Mason style — treat same as dash range |

Filter out event/time dates (containing `am`/`pm`, day-of-week prefixes, `HH:MM`) before parsing — these appear on venue sites alongside exhibition dates.

---

## Description extraction

Standard approach across scrapers:

```ts
const SKIP = /^(lead support|presenting sponsor|become a member|tickets are timed|...)/i;
const description = root
  .querySelectorAll("p")
  .filter((p) => !p.classNames && p.text.trim().length >= 60 && !SKIP.test(p.text.trim()))
  .map((p) => p.text.trim())
  .join("\n\n") || null;
```

- Target `<p>` tags with **no class** — classed paragraphs are usually navigation, footers, or boilerplate.
- Minimum 60 characters to filter UI labels and captions.
- Skip sponsorship/support copy, ticket prompts, and membership pitches.
- Strip figcaption text if it leaks into the paragraph list.

The `summarizeIfMissing` call rewrites whatever raw description you extract into clean marketing copy. Raw quality matters for input context, not for the final stored value.

---

## Artist handling

- If the exhibition page has a clear artist label, extract it directly.
- Otherwise leave `artist: null` in the scraped data and let `inferArtistIfMissing` attempt extraction from the description.
- `imageCredit` falls back to the artist name: `imageCredit: rawData.imageCredit ?? artist`.
- For group shows with no clear single artist, `inferArtistIfMissing` will return `null` — that's correct.

---

## What exhibitions to scrape

Only scrape **current and upcoming** exhibitions — not past. Strategies used across existing scrapers:

- **Section/tab selectors**: Sites often have explicit "Current" / "Upcoming" tabs or sections. Target those by ID or `data-w-tab` attribute.
- **URL pattern filtering**: Skip pages matching `/exhibitions/past/` or similar.
- **Date comparison**: Parse `endDate` from the listing page; skip if `endDate < today`.
- **Year heuristics**: If a listing shows years like 2019–2023, it's past — skip it.

Be conservative: it's better to include an exhibition that just ended than to miss one that's still open.

---

## HTTP headers

Always spoof a browser User-Agent. Some sites also need a `Referer`:

```ts
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};
```

---

## URL canonicalization

Some CMSes (e.g., The Events Calendar on WordPress) append date suffixes to event URLs (`/event/my-show/2025-06-01/`). Strip these to get a stable canonical URL before using it as the upsert key:

```ts
function canonicalUrl(href: string): string {
  return href.replace(/\/\d{4}-\d{2}-\d{2}(\/\d+)?\/?$/, "/");
}
```

---

## Adding a new scraper

1. Create `scripts/scrapers/<venue-slug>/index.ts`.
2. Define `BASE_URL`, `LIST_URL`, `MUSEUM_DIR`, and `HEADERS` constants.
3. Implement `fetchHtml(url)` using native `fetch` + `node-html-parser`.
4. Implement `getExhibitionLinks()` returning current + upcoming URLs only.
5. Implement `scrapeExhibitionDetail(href)` returning `{ title, startDate, endDate, image, imageCredit, description, link, artist }`.
6. Implement `uploadImage(remoteUrl, slug)` using the pattern above.
7. In `main()`: upsert the museum, loop over links, call `summarizeIfMissing` + `inferArtistIfMissing`, upsert each exhibition using `upsertSet`.
8. The scraper is automatically discovered by `run-all-scrapers.ts` — no registration needed.

The scraper will be run on a cron and must be fully idempotent. Every expensive operation (image upload, Claude call) is guarded by an "if missing" check in the shared utilities.
