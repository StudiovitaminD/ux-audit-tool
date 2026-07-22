"use client";

import { useEffect } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export function LandingMotion() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const revealElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );

    const setProgress = (root: HTMLElement) => {
      const fills = Array.from(root.querySelectorAll<HTMLElement>("[data-progress]"));
      for (const el of fills) {
        const v = Number(el.dataset.progress ?? "0");
        if (!Number.isFinite(v)) continue;
        el.style.width = `${Math.max(0, Math.min(100, v))}%`;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (!entry.isIntersecting) continue;
          el.classList.add("visible");
          setProgress(el);
          io.unobserve(el);
        }
      },
      { threshold: 0.18 },
    );

    for (const el of revealElements) io.observe(el);

    // Hero progress bars should animate even if already visible.
    setProgress(document.body);

    return () => io.disconnect();
  }, []);

  return null;
}
