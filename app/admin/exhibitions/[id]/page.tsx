import { db } from "@/db";
import { exhibitions, museums } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import ExhibitionForm from "./ExhibitionForm";

export const dynamic = "force-dynamic";

export default async function EditExhibitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [row] = await db
    .select()
    .from(exhibitions)
    .leftJoin(museums, eq(exhibitions.museumId, museums.id))
    .where(eq(exhibitions.id, parseInt(id)));

  if (!row) notFound();

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-6">
        <a
          href="/admin"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          ← Admin
        </a>
      </div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted mb-1">
          {row.museums?.name}
        </p>
        <h1 className="text-xl font-semibold tracking-tight">
          Edit Exhibition
        </h1>
      </div>
      <ExhibitionForm exhibition={row.exhibitions} />
    </div>
  );
}
