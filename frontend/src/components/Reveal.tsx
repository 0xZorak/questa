"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Re-attaches an IntersectionObserver on every navigation so that
 * [data-reveal] elements on pages visited via client-side routing
 * are correctly shown. Without this, navigating back to a page after
 * the initial load leaves elements at opacity:0 forever.
 */
export default function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    let observer: IntersectionObserver | null = null;

    // rAF ensures Next.js has finished committing the new page's DOM
    const frame = requestAnimationFrame(() => {
      const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
      if (!targets.length) return;

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              (entry.target as HTMLElement).dataset.visible = "";
              observer?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08 },
      );

      targets.forEach((el) => {
        delete el.dataset.visible; // reset so the fade-in replays
        observer!.observe(el);
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}
