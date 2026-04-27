"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Exhibition } from "@/db/schema";

export default function ExhibitionForm({
  exhibition,
}: {
  exhibition: Exhibition;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: exhibition.title ?? "",
    description: exhibition.description ?? "",
    image: exhibition.image ?? "",
    imageCredit: exhibition.imageCredit ?? "",
    artist: exhibition.artist ?? "",
    startDate: exhibition.startDate ?? "",
    endDate: exhibition.endDate ?? "",
    link: exhibition.link ?? "",
  });

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState("");

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaveStatus("idle");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus("saving");

    const res = await fetch(`/api/admin/exhibitions/${exhibition.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setSaveStatus("saved");
      router.refresh();
    } else {
      setSaveStatus("error");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus("uploading");
    setUploadError("");

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(`/api/admin/exhibitions/${exhibition.id}/image`, {
      method: "POST",
      body: fd,
    });

    if (res.ok) {
      const { url } = await res.json();
      setForm((f) => ({ ...f, image: url }));
      setUploadStatus("done");
      setSaveStatus("idle");
    } else {
      setUploadError("Upload failed.");
      setUploadStatus("error");
    }

    if (fileRef.current) fileRef.current.value = "";
  }

  const imageIsBlob = form.image.includes("blob.vercel-storage.com");

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <TextField
        label="Title"
        value={form.title}
        onChange={(v) => set("title", v)}
        required
      />

      <TextField
        label="Artist"
        value={form.artist}
        onChange={(v) => set("artist", v)}
      />

      <div className="flex gap-3">
        <TextField
          label="Start date"
          value={form.startDate}
          onChange={(v) => set("startDate", v)}
          type="date"
          className="flex-1"
        />
        <TextField
          label="End date"
          value={form.endDate}
          onChange={(v) => set("endDate", v)}
          type="date"
          className="flex-1"
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Description
        </span>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={5}
          className="border border-border rounded px-3 py-2 text-sm outline-none focus:border-foreground resize-y"
        />
      </label>

      <fieldset className="border border-border rounded p-4 flex flex-col gap-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted px-1">
          Image
        </legend>

        {form.image && (
          <div className="relative aspect-[4/3] w-full max-w-sm bg-border overflow-hidden rounded">
            <Image
              src={form.image}
              alt="Exhibition image"
              fill
              className="object-cover"
              unoptimized={form.image.endsWith(".gif") || !imageIsBlob}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadStatus === "uploading"}
            className="border border-border rounded px-3 py-1.5 text-sm hover:bg-border transition-colors disabled:opacity-50"
          >
            {uploadStatus === "uploading" ? "Uploading…" : "Upload new image"}
          </button>
          {uploadStatus === "done" && (
            <span className="text-xs text-green-600">Uploaded</span>
          )}
          {uploadStatus === "error" && (
            <span className="text-xs text-red-500">{uploadError}</span>
          )}
        </div>

        <TextField
          label="Or paste image URL"
          value={form.image}
          onChange={(v) => set("image", v)}
          type="url"
          placeholder="https://…"
        />

        <TextField
          label="Image credit"
          value={form.imageCredit}
          onChange={(v) => set("imageCredit", v)}
          placeholder="Photographer / © Museum"
        />
      </fieldset>

      <TextField
        label="Exhibition link"
        value={form.link}
        onChange={(v) => set("link", v)}
        type="url"
        placeholder="https://…"
      />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saveStatus === "saving"}
          className="bg-pink text-white rounded px-4 py-2 text-sm font-medium hover:bg-pink-dark transition-colors disabled:opacity-50"
        >
          {saveStatus === "saving" ? "Saving…" : "Save"}
        </button>
        {saveStatus === "saved" && (
          <span className="text-sm text-green-600">Saved</span>
        )}
        {saveStatus === "error" && (
          <span className="text-sm text-red-500">Save failed</span>
        )}
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="border border-border rounded px-3 py-2 text-sm outline-none focus:border-foreground"
      />
    </label>
  );
}
