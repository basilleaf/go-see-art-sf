import { db } from "@/db";
import { exhibitions, museums } from "@/db/schema";
import { and, eq, gte, isNotNull, or, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(exhibitions)
    .leftJoin(museums, eq(exhibitions.museumId, museums.id))
    .where(
      and(
        eq(exhibitions.hidden, false),
        isNotNull(exhibitions.image),
        or(isNull(exhibitions.endDate), gte(exhibitions.endDate, today)),
      ),
    )
    .orderBy(exhibitions.createdAt);

  const items = rows
    .map(({ exhibitions: ex, museums: museum }) => {
      const pubDate = (ex.createdAt ?? new Date()).toUTCString();
      const link = `${siteUrl}/exhibitions/${ex.id}`;
      const title = escapeXml(ex.title);
      const museumName = museum?.name ? museum.name : "";

      // HTML description (CDATA) — image + credit + text
      const htmlParts: string[] = [];
      if (ex.image) {
        htmlParts.push(`<img src="${ex.image}" alt="${ex.title.replace(/"/g, "&quot;")}" style="max-width:100%;"/>`);
      }
      if (ex.imageCredit) {
        htmlParts.push(`<p style="font-size:0.75em;color:#666;">Image: ${ex.imageCredit}</p>`);
      }
      if (ex.artist) htmlParts.push(`<p><strong>${ex.artist}</strong></p>`);
      if (ex.description) htmlParts.push(`<p>${ex.description}</p>`);
      if (museumName) htmlParts.push(`<p><em>${museumName}</em></p>`);
      const htmlDescription = `<![CDATA[${htmlParts.join("\n")}]]>`;

      // media:content for readers that support it (Feedly, etc.)
      const mediaContent = ex.image
        ? `      <media:content url="${escapeXml(ex.image)}" medium="image">${
            ex.imageCredit
              ? `\n        <media:credit>${escapeXml(ex.imageCredit)}</media:credit>\n      `
              : ""
          }</media:content>`
        : "";

      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${htmlDescription}</description>
      <pubDate>${pubDate}</pubDate>
${mediaContent}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Go See Art SF</title>
    <link>${siteUrl}</link>
    <description>Current and upcoming art museum exhibitions in San Francisco</description>
    <language>en-us</language>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
