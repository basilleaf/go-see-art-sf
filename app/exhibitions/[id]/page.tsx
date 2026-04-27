import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import SwipeNav from "./SwipeNav";

export const dynamic = "force-dynamic";
import { exhibitions, museums } from "@/db/schema";
import { and, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import { sortExhibitions } from "@/lib/sortExhibitions";

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  if (endDate) return `Through ${formatDate(endDate)}`;
  if (startDate) return `Opens ${formatDate(startDate)}`;
  return "Ongoing";
}

export default async function ExhibitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(exhibitions)
    .leftJoin(museums, eq(exhibitions.museumId, museums.id))
    .where(eq(exhibitions.id, parseInt(id)))
    .limit(1);

  if (!rows.length) notFound();

  const { exhibitions: ex, museums: museum } = rows[0];

  const today = new Date().toISOString().slice(0, 10);
  const allVisible = await db
    .select({ id: exhibitions.id, startDate: exhibitions.startDate, endDate: exhibitions.endDate })
    .from(exhibitions)
    .where(
      and(
        eq(exhibitions.hidden, false),
        isNotNull(exhibitions.image),
        or(isNull(exhibitions.endDate), gte(exhibitions.endDate, today)),
      )
    );

  const sorted = sortExhibitions(allVisible, today);
  const currentIndex = sorted.findIndex((row) => row.id === ex.id);
  const prevId = currentIndex > 0 ? sorted[currentIndex - 1].id : null;
  const nextId = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1].id : null;
  const dateLabel = formatDateRange(ex.startDate, ex.endDate);

  return (
    <SwipeNav prevId={prevId} nextId={nextId}>
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/" className="text-sm text-muted hover:text-pink transition-colors mb-8 inline-block">
        ← All exhibitions
      </Link>

      {ex.image && (
        <div className="w-full overflow-hidden mb-8">
          <Image
            src={ex.image}
            alt={ex.title}
            width={1200}
            height={800}
            className="w-full object-cover"
            priority
            unoptimized={ex.image.endsWith(".gif")}
          />
          {ex.imageCredit && (
            <p className="text-xs text-muted mt-2">{ex.imageCredit}</p>
          )}
        </div>
      )}

      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted mb-2">
          {museum?.name}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight leading-tight mb-2">
          {ex.title}
        </h1>
      </div>

      <div className="flex items-center gap-2 mb-8">
        <span className="inline-block w-2 h-2 rounded-full bg-pink" />
        <span className="text-sm font-medium">{dateLabel}</span>
      </div>

      {ex.description && (
        <div className="prose max-w-none mb-10">
          {ex.description.split("\n\n").map((para, i) => (
            <p key={i} className="text-base leading-relaxed text-foreground mb-4">
              {para}
            </p>
          ))}
        </div>
      )}

      {ex.link && (
        <a
          href={ex.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-pink text-white text-sm font-medium px-5 py-2.5 hover:bg-pink-dark transition-colors"
        >
          Visit exhibition page ↗
        </a>
      )}

      {(prevId !== null || nextId !== null) && (
        <div className="flex justify-between mt-12 pt-8 border-t border-border">
          <div>
            {prevId !== null && (
              <Link
                href={`/exhibitions/${prevId}`}
                className="text-sm text-muted hover:text-pink transition-colors"
              >
                ← Previous
              </Link>
            )}
          </div>
          <div>
            {nextId !== null && (
              <Link
                href={`/exhibitions/${nextId}`}
                className="text-sm text-muted hover:text-pink transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
    </SwipeNav>
  );
}
