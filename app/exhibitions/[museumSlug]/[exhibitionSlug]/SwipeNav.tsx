"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

export default function SwipeNav({
  prevPath,
  nextPath,
  children,
}: {
  prevPath: string | null;
  nextPath: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!prevPath && !nextPath) return;

    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const mq = window.matchMedia("(max-width: 1023px)");
    let hammer: HammerManager | null = null;

    const attach = async () => {
      hammer?.destroy();
      hammer = null;
      if (!mq.matches || cancelled) return;

      const Hammer = (await import("hammerjs")).default;
      if (cancelled || !mq.matches) return;

      const h = new Hammer(el);
      h.get("swipe").set({ direction: Hammer.DIRECTION_HORIZONTAL });
      h.on("swipeleft", () => {
        if (nextPath) router.push(nextPath);
      });
      h.on("swiperight", () => {
        if (prevPath) router.push(prevPath);
      });
      hammer = h;
    };

    void attach();
    mq.addEventListener("change", attach);
    return () => {
      cancelled = true;
      mq.removeEventListener("change", attach);
      hammer?.destroy();
    };
  }, [prevPath, nextPath, router]);

  return (
    <div ref={containerRef} className="touch-pan-y">
      {children}
    </div>
  );
}
