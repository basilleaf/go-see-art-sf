import Image from "next/image";
import Link from "next/link";
import { db } from "@/db";

export const dynamic = "force-dynamic";
import { exhibitions, museums } from "@/db/schema";
import { and, eq, gte, or, isNull } from "drizzle-orm";
import { sortExhibitions } from "@/lib/sortExhibitions";

function ordinalSuffix(d: number): string {
  if (d === 1 || d === 21 || d === 31) return "st";
  if (d === 2 || d === 22) return "nd";
  if (d === 3 || d === 23) return "rd";
  return "th";
}

function formatComingDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const monthName = date.toLocaleString("en-US", { month: "short" });
  const d = date.getDate();
  return `${monthName} ${d}${ordinalSuffix(d)}`;
}

export default async function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rawRows = await db
    .select()
    .from(exhibitions)
    .leftJoin(museums, eq(exhibitions.museumId, museums.id))
    .where(
      and(
        eq(exhibitions.hidden, false),
        or(isNull(exhibitions.endDate), gte(exhibitions.endDate, today)),
      ),
    );

  const rows = sortExhibitions(
    rawRows.map((r) => ({ ...r, startDate: r.exhibitions.startDate, endDate: r.exhibitions.endDate })),
    today,
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          SF Exhibitions
        </h1>
        <p className="text-muted mt-1">
          {rows.length} exhibitions on view now &amp; coming soon
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ exhibitions: ex, museums: museum }) => (
          <Link
            key={ex.id}
            href={`/exhibitions/${ex.id}`}
            className="group block"
          >
            <div className="overflow-hidden bg-border aspect-[4/3] w-full mb-3">
              {ex.image ? (
                <Image
                  src={ex.image}
                  alt={ex.title}
                  width={800}
                  height={600}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  unoptimized={ex.image.endsWith(".gif")}
                />
              ) : (
                <div className="w-full h-full bg-[#f0f0f0] flex items-center justify-center">
                  <span className="text-muted text-sm">No image</span>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs uppercase tracking-widest text-muted">
                  {museum?.name}
                </p>
                {ex.startDate && ex.startDate > today ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                    Coming {formatComingDate(ex.startDate)}
                  </span>
                ) : ex.endDate && ex.endDate <= twoWeeksOut ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-pink/10 text-pink px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                    Ending soon
                  </span>
                ) : null}
              </div>
              <h2 className="font-semibold text-base leading-snug group-hover:text-pink transition-colors">
                {ex.title}
              </h2>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
