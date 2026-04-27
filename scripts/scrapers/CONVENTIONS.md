# Scraper conventions

Each museum scraper lives at `scripts/scrapers/<museum-slug>/index.ts`.
See `moad/index.ts` as the reference implementation.

## Rules

**Parser**: `fetch` + `node-html-parser`. Only reach for Playwright if the site requires JS rendering to surface exhibition content.

**Images**: Download to `/public/<museum-slug>/<exhibition-slug>.<ext>`. Skip if the file already exists. Store the local path in the DB (e.g. `/moad/beauty-plus.jpg`), not the remote URL.

**Image credit**: Use the hero image `alt` text. Leave null if empty — don't guess.

**Description**: Scrape the full body text, then pass it through `summarizeDescription()` from `../summarize` before storing. Never store raw scraped copy.

**Scope**: Current + upcoming exhibitions only. Skip past.

**Museum row**: `findFirst` by `homepageUrl` before inserting — never double-insert.

**Exhibition rows**: `onConflictDoUpdate({ target: exhibitions.link, set: upsertSet })` — updates all mutable fields (title, description, image, imageCredit, artist, startDate, endDate) on re-run. Import `upsertSet` from `../summarize`.

**Env**: Requires `ANTHROPIC_API_KEY` in `.env` (for summarization) in addition to `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`.

**Run**: `npx tsx --env-file=.env scripts/scrapers/<museum>/index.ts`
