"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Museum } from "@/db/schema";

export default function MuseumForm({ museum }: { museum: Museum }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: museum.name,
    homepageUrl: museum.homepageUrl,
    exhibitionsPageUrl: museum.exhibitionsPageUrl,
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setStatus("idle");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");

    const res = await fetch(`/api/admin/museums/${museum.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setStatus("saved");
      router.refresh();
    } else {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        label="Name"
        value={form.name}
        onChange={(v) => set("name", v)}
        required
      />
      <Field
        label="Homepage URL"
        value={form.homepageUrl}
        onChange={(v) => set("homepageUrl", v)}
        required
        type="url"
      />
      <Field
        label="Exhibitions Page URL"
        value={form.exhibitionsPageUrl}
        onChange={(v) => set("exhibitionsPageUrl", v)}
        required
        type="url"
      />

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={status === "saving"}
          className="bg-pink text-white rounded px-4 py-2 text-sm font-medium hover:bg-pink-dark transition-colors disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && (
          <span className="text-sm text-green-600">Saved</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-500">Save failed</span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="border border-border rounded px-3 py-2 text-sm outline-none focus:border-foreground"
      />
    </label>
  );
}
