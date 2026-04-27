import { ImageResponse } from "next/og";
import { db } from "@/db";
import { exhibitions } from "@/db/schema";
import { and, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";

export const alt = "Go See Art SF — Select San Francisco art museum exhibitions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const HEADER_H = 90;
const GRID_H = 630 - HEADER_H; // 540
const COL_W = 400; // 1200 / 3
const ROW_H = GRID_H / 2; // 270
const GAP = 3;

export default async function Image() {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({ image: exhibitions.image })
    .from(exhibitions)
    .where(
      and(
        eq(exhibitions.hidden, false),
        isNotNull(exhibitions.image),
        or(isNull(exhibitions.startDate), lte(exhibitions.startDate, today)),
        or(isNull(exhibitions.endDate), gte(exhibitions.endDate, today)),
      ),
    )
    .limit(6);

  const images = rows.map((r) => r.image).filter(Boolean) as string[];

  function cell(src: string | undefined, right: boolean) {
    return (
      <div
        style={{
          width: COL_W,
          height: ROW_H,
          display: "flex",
          overflow: "hidden",
          background: "#e5e5e5",
          borderRight: right ? `${GAP}px solid #ffffff` : "none",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header — mirrors the site nav */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: HEADER_H,
            padding: "0 60px",
            borderBottom: "1px solid #e5e5e5",
            gap: 28,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: "#e91e8c",
              letterSpacing: "-0.5px",
            }}
          >
            go see art sf
          </span>
          <span
            style={{
              fontSize: 20,
              color: "#767676",
              letterSpacing: "-0.2px",
            }}
          >
            Select San Francisco art museum exhibitions, all in one place
          </span>
        </div>

        {/* Grid row 1 */}
        <div style={{ display: "flex" }}>
          {cell(images[0], true)}
          {cell(images[1], true)}
          {cell(images[2], false)}
        </div>

        {/* Grid row 2 */}
        <div style={{ display: "flex", marginTop: GAP }}>
          {cell(images[3], true)}
          {cell(images[4], true)}
          {cell(images[5], false)}
        </div>
      </div>
    ),
    {
      ...size,
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400" },
    },
  );
}
