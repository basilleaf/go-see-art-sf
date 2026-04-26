import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";

export const dynamic = "force-dynamic";
import { exhibitions, museums } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  const dateLabel = formatDateRange(ex.startDate, ex.endDate);

  return (
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
        {ex.artist && (
          <p className="text-lg text-muted">{ex.artist}</p>
        )}
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
    </div>
  );
}
