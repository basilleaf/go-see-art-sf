import { db } from "@/db";
import { museums } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import MuseumForm from "./MuseumForm";

export const dynamic = "force-dynamic";

export default async function EditMuseumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [museum] = await db
    .select()
    .from(museums)
    .where(eq(museums.id, parseInt(id)));

  if (!museum) notFound();

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
      <h1 className="text-xl font-semibold tracking-tight mb-6">
        Edit Museum
      </h1>
      <MuseumForm museum={museum} />
    </div>
  );
}
