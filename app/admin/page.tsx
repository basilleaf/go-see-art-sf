import Link from "next/link";
import { db } from "@/db";
import { exhibitions, museums } from "@/db/schema";
import { eq } from "drizzle-orm";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const allMuseums = await db.select().from(museums).orderBy(museums.name);

  const allExhibitions = await db
    .select()
    .from(exhibitions)
    .orderBy(exhibitions.title);

  const byMuseum = allMuseums.map((m) => ({
    museum: m,
    exhibitions: allExhibitions.filter((e) => e.museumId === m.id),
  }));

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <LogoutButton />
      </div>

      <div className="flex flex-col gap-10">
        {byMuseum.map(({ museum, exhibitions: exs }) => (
          <section key={museum.id}>
            <div className="flex items-baseline gap-3 mb-3 pb-2 border-b border-border">
              <h2 className="font-semibold text-lg">{museum.name}</h2>
              <Link
                href={`/admin/museums/${museum.id}`}
                className="text-xs text-pink hover:text-pink-dark"
              >
                Edit museum
              </Link>
            </div>

            {exs.length === 0 ? (
              <p className="text-sm text-muted">No exhibitions.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {exs.map((ex) => (
                    <tr key={ex.id} className="border border-border">
                      <td className="px-3 py-2">{ex.title}</td>
                      {!ex.image ? (
                        <td className="px-3 py-2 text-xs text-amber-600 whitespace-nowrap w-0">
                          no image
                        </td>
                      ) : (
                        <td />
                      )}
                      <td className="px-3 py-2 w-0">
                        <Link
                          href={`/admin/exhibitions/${ex.id}`}
                          className="text-xs text-pink hover:text-pink-dark whitespace-nowrap"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
