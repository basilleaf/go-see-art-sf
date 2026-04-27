import { db } from "@/db";
import { museums } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  await db
    .update(museums)
    .set({
      name: body.name,
      homepageUrl: body.homepageUrl,
      exhibitionsPageUrl: body.exhibitionsPageUrl,
    })
    .where(eq(museums.id, parseInt(id)));

  return Response.json({ ok: true });
}
