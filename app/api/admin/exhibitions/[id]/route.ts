import { db } from "@/db";
import { exhibitions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const exhibitionId = parseInt(id, 10);

  const title = (body.title as string) ?? "";

  await db
    .update(exhibitions)
    .set({
      title,
      description: body.description || null,
      image: body.image || null,
      imageCredit: body.imageCredit || null,
      artist: body.artist || null,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      link: body.link || null,
      hidden: Boolean(body.hidden),
    })
    .where(eq(exhibitions.id, exhibitionId));

  return Response.json({ ok: true });
}
