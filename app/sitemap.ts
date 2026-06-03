import type { MetadataRoute } from "next";
import { db } from "@/db";
import { exhibitions, museums } from "@/db/schema";
import { and, eq, gte, isNull, isNotNull, or } from "drizzle-orm";

function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      exSlug: exhibitions.slug,
      museumSlug: museums.slug,
      createdAt: exhibitions.createdAt,
    })
    .from(exhibitions)
    .innerJoin(museums, eq(exhibitions.museumId, museums.id))
    .where(
      and(
        eq(exhibitions.hidden, false),
        isNotNull(exhibitions.image),
        or(isNull(exhibitions.endDate), gte(exhibitions.endDate, today))
      )
    );

  const exhibitionUrls: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${base}/exhibitions/${row.museumSlug}/${row.exSlug}`,
    lastModified: row.createdAt ?? new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    ...exhibitionUrls,
  ];
}
