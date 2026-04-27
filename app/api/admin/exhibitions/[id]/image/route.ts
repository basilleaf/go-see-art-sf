import { put } from "@vercel/blob";
import { db } from "@/db";
import { exhibitions, museums } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const [exhibition] = await db
    .select({ id: exhibitions.id, museumId: exhibitions.museumId })
    .from(exhibitions)
    .where(eq(exhibitions.id, parseInt(id)));

  if (!exhibition) {
    return Response.json({ error: "Exhibition not found" }, { status: 404 });
  }

  const [museum] = await db
    .select({ name: museums.name })
    .from(museums)
    .where(eq(museums.id, exhibition.museumId));

  const museumSlug = (museum?.name ?? "admin")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const ext = path.extname(file.name).toLowerCase() || ".jpg";
  const blobPath = `${museumSlug}/admin-${id}${ext}`;

  const blob = await put(blobPath, file, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: file.type || "image/jpeg",
  });

  await db
    .update(exhibitions)
    .set({ image: blob.url })
    .where(eq(exhibitions.id, parseInt(id)));

  return Response.json({ url: blob.url });
}
