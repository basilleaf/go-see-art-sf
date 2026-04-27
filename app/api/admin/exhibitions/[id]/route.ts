import { db } from "@/db";
import { exhibitions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  await db
    .update(exhibitions)
    .set({
      title: body.title,
      description: body.description || null,
      image: body.image || null,
      imageCredit: body.imageCredit || null,
      artist: body.artist || null,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      link: body.link || null,
    })
    .where(eq(exhibitions.id, parseInt(id)));

  return Response.json({ ok: true });
}
