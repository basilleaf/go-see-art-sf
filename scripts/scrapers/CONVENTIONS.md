# Scraper conventions

Each museum scraper lives at `scripts/scrapers/<museum-slug>/index.ts`.
See `moad/index.ts` as the reference implementation.

## Rules

**Parser**: `fetch` + `node-html-parser`. Only reach for Playwright if the site requires JS rendering to surface exhibition content.

**Images**: Download to `/public/<museum-slug>/<exhibition-slug>.<ext>`. Skip if the file already exists. Store the local path in the DB (e.g. `/moad/beauty-plus.jpg`), not the remote URL.

**Image credit**: Use the hero image `alt` text. Leave null if empty — don't guess.

**Description**: Scrape the full body text. The UI renders only the first paragraph but we store all of it.

**Scope**: Current + upcoming exhibitions only. Skip past.

**Museum row**: `findFirst` by `homepageUrl` before inserting — never double-insert.

**Exhibition rows**: `onConflictDoNothing()` on the unique `link` constraint — safe to re-run.

**Run**: `npx tsx --env-file=.env scripts/scrapers/<museum>/index.ts`
