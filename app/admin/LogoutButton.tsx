"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-muted hover:text-foreground transition-colors"
    >
      Sign out
    </button>
  );
}
