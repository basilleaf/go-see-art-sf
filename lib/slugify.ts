const MAX_SLUG_LEN = 200;

/**
 * Strips diacritics, lowercases, and replaces non-alphanumeric runs with a single hyphen.
 */
export function slugifySegment(s: string): string {
  const out = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-+/g, "-");
  return (out.slice(0, MAX_SLUG_LEN) || "untitled").replace(/-+$/, "");
}

export function exhibitionSlugFromTitle(title: string): string {
  const base = slugifySegment(title);
  return base || "exhibition";
}

export function museumSlugFromName(name: string): string {
  const base = slugifySegment(name);
  return base || "museum";
}
