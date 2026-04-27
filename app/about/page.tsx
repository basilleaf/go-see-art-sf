import { db } from "@/db";
import { museums } from "@/db/schema";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const rows = await db
    .select()
    .from(museums)
    .orderBy(sql`lower(${museums.name})`);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">About</h1>
      <p className="text-muted mb-10">
        Go see art sf tracks current and upcoming exhibitions at select San
        Francisco museums, all in one place.
      </p>

      <h2 className="text-xs uppercase tracking-widest text-muted mb-4">
        Museums
      </h2>
      <ul className="divide-y divide-border">
        {rows.map((museum) => (
          <li key={museum.id} className="py-4">
            <a
              href={museum.homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:text-pink transition-colors"
            >
              {museum.name}
            </a>
            <span className="text-muted text-sm ml-2">↗</span>
          </li>
        ))}
      </ul>

      <div className="mt-12 pt-8 border-t border-border">
        <Link
          href="/contact"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Get in touch →
        </Link>
      </div>
    </div>
  );
}
